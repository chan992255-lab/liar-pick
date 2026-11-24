import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Modal, TopBar } from '../../components/ui';
import { ChatBox } from '../../components/ChatBox';
import { useOnlineAuth } from '../../lib/onlineAuth';
import { onlineApi } from '../../lib/onlineApi';
import { roomErrorMessage } from '../../lib/supabase';
import { useRoom } from '../../lib/useRoom';
import { CATEGORIES } from '../../lib/words';
import { sfx } from '../../lib/sound';
import { cn } from '../../lib/utils';
import {
  GAME_META,
  liarRoomPayload,
  mafiaRoomPayload,
  type LiarConfig,
  type MafiaConfig,
  type Snapshot,
} from '../../lib/onlineTypes';
import LiarOnline from './LiarOnline';
import MafiaOnline from './MafiaOnline';

export type RoomActor = {
  act: (fn: () => Promise<unknown>) => Promise<void>;
  notify: (message: string) => void;
};

export default function RoomScreen({ roomId, onExit }: { roomId: string; onExit: () => void }) {
  const { user } = useOnlineAuth();
  const { snapshot, messages, error, remaining, sendMessage, reload } = useRoom(roomId);
  const [toast, setToast] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const advancingRef = useRef('');

  const me = snapshot?.players.find((player) => player.userId === user?.id) ?? null;
  const isHost = snapshot?.room.hostId === user?.id;

  const act = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (caught) {
        const message = roomErrorMessage(caught instanceof Error ? caught.message : '');
        setToast(message);
        window.setTimeout(() => setToast(''), 2600);
      } finally {
        void reload();
      }
    },
    [reload],
  );

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(id);
  }, [toast]);

  /* 방장 자동 진행: 타이머가 0이 되면 다음 단계로 */
  useEffect(() => {
    if (!snapshot || !isHost || remaining == null || remaining > 0) {
      if (remaining != null && remaining > 0) advancingRef.current = '';
      return;
    }
    const key = `${snapshot.room.phase}-${snapshot.room.round}`;
    if (advancingRef.current === key) return;
    const phase = snapshot.room.phase;
    const call = (() => {
      if (phase === 'liar_discuss') return () => onlineApi.liarPhase(roomId, 'vote');
      if (phase === 'liar_vote') return () => onlineApi.liarPhase(roomId, 'tally');
      if (phase === 'liar_guess') return () => onlineApi.liarPhase(roomId, 'result');
      if (phase === 'mafia_night') return () => onlineApi.mafiaPhase(roomId, 'dawn');
      if (phase === 'mafia_discuss') return () => onlineApi.mafiaPhase(roomId, 'vote');
      if (phase === 'mafia_vote') return () => onlineApi.mafiaPhase(roomId, 'tally');
      return null;
    })();
    if (!call) return;
    advancingRef.current = key;
    void act(call);
  }, [snapshot, isHost, remaining, roomId, act]);

  /* 방장: 전원 투표 완료 시 자동 집계 */
  useEffect(() => {
    if (!isHost || !snapshot) return;
    const phase = snapshot.room.phase;
    if (phase !== 'liar_vote' && phase !== 'mafia_vote') return;
    const game = snapshot.room.game;
    const id = window.setInterval(async () => {
      try {
        const stats = await onlineApi.voteStats(roomId);
        if (stats.total > 0 && stats.voted >= stats.total) {
          await (game === 'liar' ? onlineApi.liarPhase(roomId, 'tally') : onlineApi.mafiaPhase(roomId, 'tally'));
          void reload();
        }
      } catch {
        /* 무시: 다음 주기에 재시도 */
      }
    }, 2500);
    return () => window.clearInterval(id);
  }, [isHost, snapshot, roomId, reload]);

  if (!snapshot) {
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <TopBar title="방으로 이동 중" onBack={onExit} />
        <div className="app-body flex flex-1 items-center justify-center">
          <p className="text-[12.5px] text-sub">{error ?? '방 정보를 불러오는 중…'}</p>
        </div>
      </div>
    );
  }

  const room = snapshot.room;
  const inLobby = room.phase === 'lobby';

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <TopBar
        title={`${GAME_META[room.game].emoji} ${room.title}`}
        subtitle={`방 코드 ${room.code} · ${snapshot.players.length}/12명`}
        onBack={() => {
          if (confirm('방에서 나갈까요?')) {
            void act(async () => {
              await onlineApi.leaveRoom(roomId);
              onExit();
            });
          }
        }}
        right={
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(room.code);
                setToast('방 코드를 복사했어요');
              } catch {
                setToast(`방 코드 ${room.code}`);
              }
            }}
            className="press rounded-full border border-line/80 bg-surf px-3 py-1.5 text-[11px] font-extrabold text-purple"
          >
            코드 복사
          </button>
        }
      />

      <div className="app-body pb-24">
        {inLobby ? (
          <Lobby
            snapshot={snapshot}
            me={me}
            isHost={isHost}
            act={act}
            onOpenSettings={() => setSettingsOpen(true)}
            chat={
              <ChatBox
                messages={messages}
                onSend={sendMessage}
                placeholder="대기실 채팅"
                height="h-[180px]"
                className="mt-3"
              />
            }
          />
        ) : room.game === 'liar' ? (
          <LiarOnline snapshot={snapshot} me={me} isHost={isHost} remaining={remaining} actor={{ act, notify: setToast }} />
        ) : (
          <MafiaOnline snapshot={snapshot} me={me} isHost={isHost} remaining={remaining} actor={{ act, notify: setToast }} />
        )}

        {!inLobby && (
          <div className="mt-4">
            <p className="mb-1.5 text-[11px] font-extrabold tracking-wide text-sub">실시간 채팅</p>
            <ChatBox messages={messages} onSend={sendMessage} height="h-[170px]" placeholder="토론 채팅" />
          </div>
        )}
      </div>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-6">
          <span className="animate-pop-in rounded-full border border-line bg-raised/95 px-4 py-2 text-[12px] font-bold text-ink shadow-card">
            {toast}
          </span>
        </div>
      )}

      <HostSettings
        open={settingsOpen}
        snapshot={snapshot}
        onClose={() => setSettingsOpen(false)}
        act={act}
      />
    </div>
  );
}

function Lobby({
  snapshot,
  me,
  isHost,
  act,
  onOpenSettings,
  chat,
}: {
  snapshot: Snapshot;
  me: { userId: string; isReady: boolean } | null;
  isHost: boolean;
  act: RoomActor['act'];
  onOpenSettings: () => void;
  chat: React.ReactNode;
}) {
  const room = snapshot.room;
  const minPlayers = GAME_META[room.game].minPlayers;
  const readyCount = snapshot.players.filter((player) => player.isReady).length;
  const canStart = snapshot.players.length >= minPlayers;

  return (
    <div>
      <div className="panel mt-1 px-4 py-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-extrabold tracking-[0.16em] text-purple">WAITING ROOM</p>
          <span className="rounded-full border border-line bg-bg/50 px-2.5 py-1 text-[10.5px] font-bold text-sub">
            {room.isPublic ? '공개 방' : '🔒 비공개 방'}
          </span>
        </div>
        <p className="mt-2 text-[15px] font-extrabold">
          {room.game === 'liar'
            ? `${room.state.categoryEmoji ?? '🎲'} ${room.state.categoryLabel ?? '제시어'} · ${
                room.state.mode === 'fool' ? '바보 모드' : '일반 모드'
              }`
            : `마피아 ${room.state.mafia ?? 1} · 경찰 ${room.state.police ?? 1} · 의사 ${room.state.doctor ?? 0}`}
        </p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-sub">
          {room.game === 'liar'
            ? `토론 ${Math.round(((room.state.discussSeconds as number) ?? 180) / 60)}분 · ${
                room.state.voteMode === 'open' ? '지목 투표' : '비밀 투표'
              }`
            : `밤 ${room.state.nightSeconds ?? 45}초 · 낮 토론 ${Math.round(((room.state.discussSeconds as number) ?? 180) / 60)}분`}
        </p>
        {isHost && (
          <button onClick={onOpenSettings} className="press mt-2 text-[11.5px] font-bold text-purple">
            방 설정 바꾸기 →
          </button>
        )}
      </div>

      <p className="mb-2 mt-4 text-[13px] font-extrabold text-sub">
        참가자 {snapshot.players.length}/{minPlayers}명 이상 필요 · 준비 {readyCount}명
      </p>
      <div className="space-y-2">
        {snapshot.players.map((player) => (
          <div
            key={player.userId}
            className="flex items-center gap-3 rounded-2xl border border-line/60 bg-surf/70 px-3.5 py-2.5"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet/70 to-purple/40 text-[12px] font-extrabold text-white">
              {player.nickname.slice(0, 1)}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">
              {player.nickname}
              {player.userId === me?.userId && <span className="ml-1 text-[11px] font-bold text-sub">(나)</span>}
            </span>
            {player.isHost && <span className="text-[13px]">👑</span>}
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-[10.5px] font-extrabold',
                player.isReady ? 'bg-mint/15 text-mint' : 'bg-line/50 text-sub',
              )}
            >
              {player.isReady ? '준비 완료' : '대기 중'}
            </span>
          </div>
        ))}
      </div>

      {chat}

      <div className="sticky bottom-0 mt-4 bg-gradient-to-t from-bg via-bg/95 to-bg/0 pb-3 pt-3">
        {isHost ? (
          <Button
            disabled={!canStart}
            onClick={() =>
              void act(async () => {
                sfx.reveal();
                await onlineApi.startGame(room.id);
              })
            }
          >
            {canStart ? '🚀 게임 시작' : `${minPlayers}명부터 시작할 수 있어요 (${snapshot.players.length}명)`}
          </Button>
        ) : (
          <Button
            variant={me?.isReady ? 'ghost' : 'primary'}
            onClick={() =>
              void act(async () => {
                if (!me) return;
                sfx.tap();
                await onlineApi.setReady(room.id, me.userId, !me.isReady);
              })
            }
          >
            {me?.isReady ? '준비 취소' : '✅ 준비 완료'}
          </Button>
        )}
      </div>
    </div>
  );
}

function HostSettings({
  open,
  snapshot,
  onClose,
  act,
}: {
  open: boolean;
  snapshot: Snapshot;
  onClose: () => void;
  act: RoomActor['act'];
}) {
  const room = snapshot.room;
  const [liar, setLiar] = useState<LiarConfig>({
    categoryId: (room.state.categoryLabel as string) ?? CATEGORIES[0].id,
    categoryLabel: (room.state.categoryLabel as string) ?? CATEGORIES[0].label,
    categoryEmoji: (room.state.categoryEmoji as string) ?? CATEGORIES[0].emoji,
    mode: (room.state.mode as 'normal' | 'fool') ?? 'normal',
    seconds: (room.state.discussSeconds as number) ?? 180,
    voteMode: (room.state.voteMode as 'secret' | 'open') ?? 'secret',
  });
  const [mafia, setMafia] = useState<MafiaConfig>({
    mafia: (room.state.mafia as number) ?? 1,
    police: (room.state.police as number) ?? 1,
    doctor: (room.state.doctor as number) ?? 0,
    nightSeconds: (room.state.nightSeconds as number) ?? 45,
    discussSeconds: (room.state.discussSeconds as number) ?? 180,
    voteSeconds: (room.state.voteSeconds as number) ?? 60,
  });

  return (
    <Modal open={open} onClose={onClose} title="방 설정">
      <div className="max-h-[60dvh] space-y-3 overflow-y-auto pb-2">
        {room.game === 'liar' ? (
          <>
            <label className="block">
              <span className="text-[11.5px] font-bold text-sub">카테고리</span>
              <select
                value={CATEGORIES.find((item) => item.label === liar.categoryLabel)?.id ?? CATEGORIES[0].id}
                onChange={(event) => {
                  const next = CATEGORIES.find((item) => item.id === event.target.value) ?? CATEGORIES[0];
                  setLiar({ ...liar, categoryId: next.id, categoryLabel: next.label, categoryEmoji: next.emoji });
                }}
                className="mt-1.5 w-full rounded-2xl border border-line bg-bg/60 px-3.5 py-3 text-[13.5px] font-bold focus:border-purple/60 focus:outline-none"
              >
                {CATEGORIES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.emoji} {item.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['normal', 'fool'] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => setLiar({ ...liar, mode: key })}
                  className={cn(
                    'press rounded-2xl border px-3 py-2.5 text-[12.5px] font-extrabold',
                    liar.mode === key ? 'border-purple/70 bg-purple/15' : 'border-line bg-bg/40 text-sub',
                  )}
                >
                  {key === 'normal' ? '🎯 일반' : '🤡 바보'}
                </button>
              ))}
            </div>
            <label className="block">
              <span className="text-[11.5px] font-bold text-sub">토론 시간 · {liar.seconds}초</span>
              <input
                type="range"
                min={60}
                max={420}
                step={30}
                value={liar.seconds}
                onChange={(event) => setLiar({ ...liar, seconds: Number(event.target.value) })}
                className="mt-2 w-full accent-purple"
              />
            </label>
          </>
        ) : (
          <>
            <label className="block">
              <span className="text-[11.5px] font-bold text-sub">밤 시간 · {mafia.nightSeconds}초</span>
              <input
                type="range"
                min={20}
                max={90}
                step={5}
                value={mafia.nightSeconds}
                onChange={(event) => setMafia({ ...mafia, nightSeconds: Number(event.target.value) })}
                className="mt-2 w-full accent-rose"
              />
            </label>
            <label className="block">
              <span className="text-[11.5px] font-bold text-sub">낮 토론 · {mafia.discussSeconds}초</span>
              <input
                type="range"
                min={60}
                max={420}
                step={30}
                value={mafia.discussSeconds}
                onChange={(event) => setMafia({ ...mafia, discussSeconds: Number(event.target.value) })}
                className="mt-2 w-full accent-rose"
              />
            </label>
          </>
        )}
        <Button
          onClick={() =>
            void act(async () => {
              const payload = room.game === 'liar' ? liarRoomPayload(liar) : mafiaRoomPayload(mafia);
              await onlineApi.setConfig(room.id, payload.publicConfig, payload.secret);
              onClose();
            })
          }
        >
          저장
        </Button>
      </div>
    </Modal>
  );
}
