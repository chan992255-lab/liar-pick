import { useCallback, useEffect, useState } from 'react';
import { Button, Modal, SectionTitle, TopBar } from '../../components/ui';
import { useOnlineAuth } from '../../lib/onlineAuth';
import { onlineApi } from '../../lib/onlineApi';
import { roomErrorMessage } from '../../lib/supabase';
import { CATEGORIES } from '../../lib/words';
import { sfx } from '../../lib/sound';
import { cn } from '../../lib/utils';
import {
  DEFAULT_LIAR_CONFIG,
  DEFAULT_MAFIA_CONFIG,
  GAME_META,
  liarRoomPayload,
  mafiaRoomPayload,
  recommendedMafia,
  type LiarConfig,
  type MafiaConfig,
  type OnlineGame,
  type RoomSummary,
} from '../../lib/onlineTypes';

export default function LobbyScreen({
  onRoom,
  onExit,
}: {
  onRoom: (roomId: string) => void;
  onExit: () => void;
}) {
  const { profile, signOut, updateNickname } = useOnlineAuth();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [code, setCode] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [nickOpen, setNickOpen] = useState(false);
  const [nickDraft, setNickDraft] = useState(profile?.nickname ?? '');

  const refresh = useCallback(async () => {
    try {
      const list = await onlineApi.listRooms(null);
      setRooms(list);
      setError('');
    } catch (caught) {
      setError(roomErrorMessage(caught instanceof Error ? caught.message : ''));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void onlineApi.cleanup().catch(() => null);
    void refresh();
    const id = window.setInterval(() => void refresh(), 6000);
    return () => window.clearInterval(id);
  }, [refresh]);

  async function quickMatch(game: OnlineGame) {
    if (busy) return;
    setBusy('match');
    sfx.tap();
    try {
      const payload =
        game === 'liar' ? liarRoomPayload(DEFAULT_LIAR_CONFIG) : mafiaRoomPayload(DEFAULT_MAFIA_CONFIG);
      const snapshot = await onlineApi.quickMatch(game, payload.publicConfig, payload.secret);
      onRoom(snapshot.room.id);
    } catch (caught) {
      setError(roomErrorMessage(caught instanceof Error ? caught.message : ''));
    } finally {
      setBusy('');
    }
  }

  async function joinByCode() {
    const value = code.trim().toUpperCase();
    if (value.length !== 6) {
      setError('방 코드는 6자리예요.');
      return;
    }
    setBusy('code');
    try {
      const snapshot = await onlineApi.joinRoom(value);
      onRoom(snapshot.room.id);
    } catch (caught) {
      setError(roomErrorMessage(caught instanceof Error ? caught.message : ''));
    } finally {
      setBusy('');
    }
  }

  async function joinRoom(room: RoomSummary) {
    setBusy(room.id);
    try {
      const snapshot = await onlineApi.joinRoom(room.code);
      onRoom(snapshot.room.id);
    } catch (caught) {
      setError(roomErrorMessage(caught instanceof Error ? caught.message : ''));
      void refresh();
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <TopBar
        title="🌐 온라인 매칭"
        subtitle="모르는 사람과 바로 시작"
        onBack={onExit}
        right={
          <button
            onClick={() => {
              sfx.tap();
              setNickDraft(profile?.nickname ?? '');
              setNickOpen(true);
            }}
            className="press flex items-center gap-2 rounded-full border border-line/80 bg-surf px-2 py-1"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet to-purple text-[12px] font-extrabold text-white">
              {(profile?.nickname ?? '?').slice(0, 1)}
            </span>
            <span className="max-w-[76px] truncate text-[11.5px] font-extrabold">{profile?.nickname ?? '게스트'}</span>
          </button>
        }
      />

      <div className="app-body pb-10">
        <div className="mt-1 grid grid-cols-3 gap-2">
          {[
            { label: '판수', value: profile?.games ?? 0 },
            { label: '승리', value: profile?.wins ?? 0 },
            { label: '점수', value: profile?.score ?? 0 },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-line/60 bg-surf/60 px-3 py-2.5 text-center">
              <p className="num text-[17px] font-black">{item.value}</p>
              <p className="text-[10.5px] font-bold text-sub">{item.label}</p>
            </div>
          ))}
        </div>

        {error && (
          <p className="mt-3 rounded-xl border border-rose/40 bg-rose/10 px-3.5 py-2.5 text-[12px] leading-relaxed text-rose">
            {error}
          </p>
        )}

        <SectionTitle hint="대기 중인 방에 자동 입장">빠른 매칭</SectionTitle>
        <div className="grid grid-cols-2 gap-2.5">
          {(['liar', 'mafia'] as OnlineGame[]).map((game) => (
            <button
              key={game}
              disabled={busy === 'match'}
              onClick={() => void quickMatch(game)}
              className={cn(
                'press relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br px-4 py-4 text-left shadow-card disabled:opacity-60',
                GAME_META[game].gradient,
              )}
            >
              <span className="text-[24px]">{GAME_META[game].emoji}</span>
              <p className="mt-1 text-[15px] font-black">{GAME_META[game].label}</p>
              <p className="mt-0.5 text-[10.5px] text-white/70">{GAME_META[game].minPlayers}명부터 · 자동 매칭</p>
            </button>
          ))}
        </div>

        <SectionTitle hint="6자리 코드로 참가">방 코드로 들어가기</SectionTitle>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase().slice(0, 6))}
            placeholder="ABC123"
            className="num h-12 min-w-0 flex-1 rounded-2xl border border-line bg-bg/60 px-4 text-center text-[19px] font-black tracking-[0.3em] placeholder:tracking-normal placeholder:text-sub/30 focus:border-purple/60 focus:outline-none"
          />
          <Button size="md" full={false} className="w-[104px] shrink-0" disabled={busy === 'code'} onClick={() => void joinByCode()}>
            입장
          </Button>
        </div>

        <SectionTitle hint={`${rooms.length}개`}>공개 방</SectionTitle>
        {loading ? (
          <p className="py-8 text-center text-[12px] text-sub">방 목록을 불러오는 중…</p>
        ) : rooms.length === 0 ? (
          <div className="rounded-3xl border border-line/60 bg-surf/50 px-4 py-8 text-center">
            <p className="text-[13.5px] font-bold">아직 열린 방이 없어요</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-sub">
              빠른 매칭을 누르면 새 공개 방이 만들어지고, 친구나 다른 사람이 들어올 수 있어요.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {rooms.map((room) => (
              <div
                key={room.id}
                className="flex items-center gap-3 rounded-2xl border border-line/60 bg-surf/70 px-3.5 py-3"
              >
                <span className="text-[20px]">{room.game === 'liar' ? '🕵️' : '🔫'}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-extrabold">{room.title}</p>
                  <p className="mt-0.5 text-[11px] text-sub">
                    <span className="num">{room.code}</span> · {room.players}/12명
                    {room.game === 'liar' && room.mode ? ` · ${room.mode === 'fool' ? '바보' : '일반'}` : ''}
                  </p>
                </div>
                <button
                  disabled={busy === room.id}
                  onClick={() => void joinRoom(room)}
                  className="press h-9 shrink-0 rounded-xl bg-gradient-to-br from-violet to-purple px-3.5 text-[12px] font-extrabold text-white disabled:opacity-40"
                >
                  입장
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5">
          <Button variant="ghost" onClick={() => setCreateOpen(true)}>
            + 내 방 만들기 (공개·비공개)
          </Button>
        </div>

        <p className="mt-5 text-center text-[10.5px] leading-relaxed text-sub/60">
          온라인 매칭은 Supabase 실시간 연결로 동작해요.
          <br />
          역할·제시어는 본인 화면에만 표시됩니다.
        </p>
      </div>

      <CreateRoomModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(roomId) => {
          setCreateOpen(false);
          onRoom(roomId);
        }}
        onError={setError}
      />

      <Modal open={nickOpen} onClose={() => setNickOpen(false)} title="닉네임 바꾸기">
        <input
          value={nickDraft}
          onChange={(event) => setNickDraft(event.target.value)}
          maxLength={12}
          className="w-full rounded-2xl border border-line bg-bg/60 px-4 py-3.5 text-[14px] focus:border-purple/60 focus:outline-none"
        />
        <div className="mt-3 space-y-2">
          <Button
            onClick={async () => {
              const result = await updateNickname(nickDraft.trim());
              if (result.ok) {
                setNickOpen(false);
                sfx.reveal();
              } else {
                setError(result.error ?? '닉네임을 바꾸지 못했어요.');
              }
            }}
          >
            저장
          </Button>
          <Button
            variant="dark"
            onClick={async () => {
              await signOut();
              setNickOpen(false);
            }}
          >
            로그아웃
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function CreateRoomModal({
  open,
  onClose,
  onCreated,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (roomId: string) => void;
  onError: (message: string) => void;
}) {
  const [game, setGame] = useState<OnlineGame>('liar');
  const [title, setTitle] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [liar, setLiar] = useState<LiarConfig>(DEFAULT_LIAR_CONFIG);
  const [mafia, setMafia] = useState<MafiaConfig>(DEFAULT_MAFIA_CONFIG);
  const [busy, setBusy] = useState(false);

  async function create() {
    if (busy) return;
    setBusy(true);
    try {
      const payload = game === 'liar' ? liarRoomPayload(liar) : mafiaRoomPayload(mafia);
      const snapshot = await onlineApi.createRoom(
        game,
        title.trim() || `${game === 'liar' ? '라이어' : '마피아'} 파티`,
        isPublic,
        payload.publicConfig,
        payload.secret,
      );
      onCreated(snapshot.room.id);
    } catch (caught) {
      onError(roomErrorMessage(caught instanceof Error ? caught.message : ''));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="방 만들기">
      <div className="max-h-[62dvh] space-y-3 overflow-y-auto pb-2">
        <div className="grid grid-cols-2 gap-2">
          {(['liar', 'mafia'] as OnlineGame[]).map((key) => (
            <button
              key={key}
              onClick={() => {
                sfx.tap();
                setGame(key);
              }}
              className={cn(
                'press rounded-2xl border px-3 py-3 text-[13px] font-extrabold',
                game === key ? 'border-purple/70 bg-purple/15 text-ink' : 'border-line bg-bg/40 text-sub',
              )}
            >
              {GAME_META[key].emoji} {GAME_META[key].label}
            </button>
          ))}
        </div>

        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="방 이름 (비우면 자동)"
          maxLength={24}
          className="w-full rounded-2xl border border-line bg-bg/60 px-4 py-3 text-[13.5px] focus:border-purple/60 focus:outline-none"
        />

        <button
          onClick={() => setIsPublic((value) => !value)}
          className="flex w-full items-center justify-between rounded-2xl border border-line/70 bg-raised/60 px-4 py-3"
        >
          <span className="text-[13px] font-bold">공개 방 (목록에 보이기)</span>
          <span
            className={cn(
              'relative h-6 w-11 rounded-full transition',
              isPublic ? 'bg-gradient-to-r from-violet to-purple' : 'bg-line',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all',
                isPublic ? 'left-[22px]' : 'left-0.5',
              )}
            />
          </span>
        </button>

        {game === 'liar' ? (
          <div className="space-y-2.5">
            <label className="block">
              <span className="text-[11.5px] font-bold text-sub">카테고리</span>
              <select
                value={liar.categoryId}
                onChange={(event) => {
                  const next = CATEGORIES.find((item) => item.id === event.target.value) ?? CATEGORIES[0];
                  setLiar({
                    ...liar,
                    categoryId: next.id,
                    categoryLabel: next.label,
                    categoryEmoji: next.emoji,
                  });
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
                  {key === 'normal' ? '🎯 일반 모드' : '🤡 바보 모드'}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(['secret', 'open'] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => setLiar({ ...liar, voteMode: key })}
                  className={cn(
                    'press rounded-2xl border px-3 py-2.5 text-[12.5px] font-extrabold',
                    liar.voteMode === key ? 'border-purple/70 bg-purple/15' : 'border-line bg-bg/40 text-sub',
                  )}
                >
                  {key === 'secret' ? '🤫 비밀 투표' : '👉 지목 투표'}
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
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="rounded-2xl border border-line/70 bg-raised/60 px-4 py-3">
              <p className="text-[12.5px] font-bold">
                역할 구성 · 마피아 {recommendedMafia(mafia.mafia + 3).mafia > 0 ? mafia.mafia : 1} · 경찰 {mafia.police} · 의사{' '}
                {mafia.doctor}
              </p>
              <p className="mt-1 text-[11px] text-sub">게임을 시작할 때 인원에 맞춰 자동으로 배정돼요.</p>
            </div>

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
          </div>
        )}

        <Button onClick={() => void create()} disabled={busy}>
          {busy ? '만드는 중…' : '방 만들고 입장'}
        </Button>
      </div>
    </Modal>
  );
}
