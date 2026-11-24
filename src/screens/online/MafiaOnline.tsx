import { useState } from 'react';
import { Button, SectionTitle } from '../../components/ui';
import { onlineApi } from '../../lib/onlineApi';
import { sfx } from '../../lib/sound';
import { cn } from '../../lib/utils';
import { MAFIA_ROLE_LABEL, type RoomPlayer, type Snapshot } from '../../lib/onlineTypes';
import type { RoomActor } from './RoomScreen';
import { PhaseTimer, PlayerStrip, TargetGrid, WaitingForHost } from './parts';

type Mates = { userId: string; nickname: string }[];

export default function MafiaOnline({
  snapshot,
  me,
  isHost,
  remaining,
  actor,
}: {
  snapshot: Snapshot;
  me: RoomPlayer | null;
  isHost: boolean;
  remaining: number | null;
  actor: RoomActor;
}) {
  const room = snapshot.room;
  const state = room.state;
  const phase = room.phase;
  const role = snapshot.me?.role ?? 'citizen';
  const meta = (snapshot.me?.meta ?? {}) as Record<string, unknown>;
  const mates = (meta.mates as Mates) ?? [];
  const lastCheck = meta.lastCheck as { nickname: string; isMafia: boolean } | undefined;
  const alive = snapshot.players.filter((player) => player.isAlive);
  const iAmAlive = me?.isAlive ?? false;
  const [target, setTarget] = useState<string | null>(snapshot.myVote ?? null);
  const [nightTarget, setNightTarget] = useState<string | null>(snapshot.myAction ?? null);
  const [submitting, setSubmitting] = useState(false);
  const roleMeta = MAFIA_ROLE_LABEL[role] ?? MAFIA_ROLE_LABEL.citizen;

  function callPhase(next: string) {
    void actor.act(() => onlineApi.mafiaPhase(room.id, next));
  }

  /* ─────────────── 역할 확인 ─────────────── */
  if (phase === 'mafia_reveal') {
    return (
      <div>
        <div className="panel mt-1 border-rose/30 bg-rose/5 px-5 py-6 text-center">
          <p className="text-[11px] font-extrabold tracking-[0.2em] text-sub">내 직업 · 나만 볼 수 있어요</p>
          <p className="mt-3 text-[44px]">{roleMeta.emoji}</p>
          <p className="mt-1 text-[28px] font-black">{roleMeta.label}</p>
          <p className="mt-2 text-[12px] leading-relaxed text-sub">
            {role === 'mafia'
              ? '밤마다 한 명을 지목해 제거하세요. 동료 마피아와 함께 살아남으면 승리!'
              : role === 'police'
                ? '밤마다 한 명을 조사해 마피아인지 확인하세요. 결과는 내 화면에만 보여요.'
                : role === 'doctor'
                  ? '밤마다 한 명을 보호하세요. 마피아의 습격을 막아낼 수 있어요.'
                  : '능력은 없지만 낮의 토론과 투표로 마피아를 찾아내세요.'}
          </p>
          {role === 'mafia' && mates.length > 0 && (
            <div className="mt-4 rounded-2xl border border-rose/30 bg-rose/10 px-4 py-3">
              <p className="text-[11px] font-extrabold text-rose">같은 마피아</p>
              <p className="mt-1 text-[13px] font-bold">{mates.map((mate) => mate.nickname).join(', ')}</p>
            </div>
          )}
          <div className="mt-4 flex justify-center gap-2 text-[10.5px] text-sub">
            <span className="chip">🔪 마피아 {state.mafia}</span>
            <span className="chip">🕵️ 경찰 {state.police}</span>
            <span className="chip">💉 의사 {state.doctor}</span>
          </div>
        </div>

        <SectionTitle hint={`${snapshot.players.length}명`}>참가자</SectionTitle>
        <PlayerStrip players={snapshot.players} selfId={me?.userId} />

        <div className="mt-5">
          {isHost ? (
            <Button
              variant="danger"
              onClick={() => {
                sfx.night();
                callPhase('night');
              }}
            >
              🌙 밤 시작
            </Button>
          ) : (
            <WaitingForHost label="방장이 밤을 시작하면 각자 역할에 맞는 행동을 해요." />
          )}
        </div>
      </div>
    );
  }

  /* ─────────────── 밤 ─────────────── */
  if (phase === 'mafia_night') {
    const actionLabel = role === 'mafia' ? '제거할 사람' : role === 'police' ? '조사할 사람' : '보호할 사람';
    const canAct = iAmAlive && ['mafia', 'police', 'doctor'].includes(role);

    return (
      <div>
        <div className="panel mt-1 border-violet/30 bg-violet/5 px-4 py-5 text-center">
          <p className="text-[11px] font-extrabold tracking-[0.2em] text-violet">{state.day ?? 1}일차 NIGHT</p>
          <div className="mt-2">
            <PhaseTimer seconds={remaining} />
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-sub">
            {iAmAlive
              ? role === 'citizen'
                ? '시민은 밤에 할 일이 없어요. 눈을 감고 아침을 기다려 주세요.'
                : `${actionLabel}을 골라 주세요. 마감 전까지 바꿀 수 있어요.`
              : '탈락했어요. 남은 사람들의 밤을 지켜봐 주세요.'}
          </p>
        </div>

        {canAct && (
          <>
            <SectionTitle hint={roleMeta.label}>{actionLabel}</SectionTitle>
            <TargetGrid
              players={alive}
              selfId={me?.userId}
              selectedId={nightTarget}
              onSelect={setNightTarget}
              allowSelf={role === 'doctor'}
              tone={role === 'doctor' ? 'mint' : role === 'police' ? 'purple' : 'rose'}
            />
            <div className="mt-3">
              <Button
                variant={role === 'doctor' ? 'mint' : role === 'police' ? 'ghost' : 'danger'}
                disabled={!nightTarget || submitting}
                onClick={() => {
                  if (!nightTarget) return;
                  setSubmitting(true);
                  void actor
                    .act(async () => {
                      await onlineApi.nightAction(room.id, nightTarget);
                      sfx.night();
                    })
                    .finally(() => setSubmitting(false));
                }}
              >
                {snapshot.myAction ? '다시 고르기' : '결정하기'}
              </Button>
              {snapshot.myAction && (
                <p className="mt-2 text-center text-[11.5px] text-mint">
                  ✅ {snapshot.players.find((player) => player.userId === snapshot.myAction)?.nickname} 님으로 정했어요
                </p>
              )}
            </div>

            {role === 'police' && lastCheck && (
              <div
                className={cn(
                  'mt-4 rounded-2xl border px-4 py-3 text-center',
                  lastCheck.isMafia ? 'border-rose/50 bg-rose/10' : 'border-mint/40 bg-mint/10',
                )}
              >
                <p className="text-[11px] font-extrabold text-sub">🔍 조사 결과 (나만 보임)</p>
                <p className={cn('mt-1 text-[14px] font-black', lastCheck.isMafia ? 'text-rose' : 'text-mint')}>
                  {lastCheck.nickname} 님은 {lastCheck.isMafia ? '마피아!' : '마피아가 아니에요'}
                </p>
              </div>
            )}
          </>
        )}

        <SectionTitle>생존자</SectionTitle>
        <PlayerStrip players={snapshot.players} selfId={me?.userId} />

        <div className="mt-5">
          {isHost ? (
            <Button variant="ghost" onClick={() => callPhase('dawn')}>
              ☀️ 아침으로 넘어가기
            </Button>
          ) : (
            <WaitingForHost label="모두 행동을 마치면 아침이 밝아요." />
          )}
        </div>
      </div>
    );
  }

  /* ─────────────── 아침 ─────────────── */
  if (phase === 'mafia_dawn') {
    const dawn = state.dawn;
    const saved = dawn?.saved;
    return (
      <div>
        <div
          className={cn(
            'panel mt-1 px-5 py-6 text-center',
            saved ? 'border-mint/40 bg-mint/10' : dawn?.victimId ? 'border-rose/40 bg-rose/10' : 'border-line bg-surf',
          )}
        >
          <p className="text-[40px]">{saved ? '💉' : dawn?.victimId ? '💀' : '🌙'}</p>
          <p className="mt-2 text-[18px] font-black">
            {saved
              ? '의사의 보호로 아무도 죽지 않았어요'
              : dawn?.victimId
                ? `${dawn.victimNickname} 님이 습격당했어요`
                : '아무 일도 일어나지 않았어요'}
          </p>
          <p className="mt-1.5 text-[12px] text-sub">{state.day ?? 1}일차 아침</p>
        </div>

        <SectionTitle>생존자</SectionTitle>
        <PlayerStrip players={snapshot.players} selfId={me?.userId} />

        <div className="mt-5">
          {isHost ? (
            <Button onClick={() => callPhase('discuss')}>낮 토론 시작</Button>
          ) : (
            <WaitingForHost label="방장이 낮 토론을 시작합니다." />
          )}
        </div>
      </div>
    );
  }

  /* ─────────────── 낮 토론 ─────────────── */
  if (phase === 'mafia_discuss') {
    return (
      <div>
        <div className="panel mt-1 px-4 py-5 text-center">
          <p className="text-[11px] font-extrabold tracking-[0.2em] text-amber">{state.day ?? 1}일차 DAY</p>
          <div className="mt-2">
            <PhaseTimer seconds={remaining} tone="rose" />
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-sub">
            {iAmAlive ? '마피아를 찾아내세요. 채팅으로 서로의 행동을 캐물어 보세요.' : '탈락했어요 · 토론은 볼 수 있어요.'}
          </p>
        </div>

        <SectionTitle>생존자</SectionTitle>
        <PlayerStrip players={snapshot.players} selfId={me?.userId} />

        <div className="mt-5">
          {isHost ? (
            <Button variant="danger" onClick={() => callPhase('vote')}>
              🗳️ 처형 투표 시작
            </Button>
          ) : (
            <WaitingForHost label="방장이 처형 투표를 시작하면 한 명을 지목할 수 있어요." />
          )}
        </div>
      </div>
    );
  }

  /* ─────────────── 처형 투표 ─────────────── */
  if (phase === 'mafia_vote') {
    const canVote = iAmAlive;
    return (
      <div>
        <div className="panel mt-1 px-4 py-5 text-center">
          <p className="text-[11px] font-extrabold tracking-[0.2em] text-rose">EXECUTION VOTE</p>
          <p className="mt-1 text-[16px] font-extrabold">처형할 사람은?</p>
          <div className="mt-2">
            <PhaseTimer seconds={remaining} tone="rose" />
          </div>
          <p className="mt-2 text-[11.5px] text-sub">
            {snapshot.votesIn}/{alive.length}명 투표 완료
          </p>
        </div>

        {canVote ? (
          <>
            <div className="mt-4">
              <TargetGrid players={alive} selfId={me?.userId} selectedId={target} onSelect={setTarget} />
            </div>
            <div className="mt-4">
              <Button
                variant="danger"
                disabled={!target || submitting}
                onClick={() => {
                  if (!target) return;
                  setSubmitting(true);
                  void actor
                    .act(async () => {
                      await onlineApi.castVote(room.id, target);
                      sfx.execute();
                    })
                    .finally(() => setSubmitting(false));
                }}
              >
                {snapshot.myVote ? '투표 바꾸기' : '투표하기'}
              </Button>
            </div>
          </>
        ) : (
          <WaitingForHost label="탈락한 참가자는 투표할 수 없어요." />
        )}
      </div>
    );
  }

  /* ─────────────── 처형 결과 ─────────────── */
  if (phase === 'mafia_execution') {
    const executed = state.executed;
    return (
      <div>
        <div
          className={cn(
            'panel mt-1 px-5 py-6 text-center',
            state.tie ? 'border-amber/40 bg-amber/10' : 'border-rose/40 bg-rose/10',
          )}
        >
          <p className="text-[40px]">{state.tie ? '⚖️' : '⚰️'}</p>
          <p className="mt-2 text-[18px] font-black">
            {state.tie ? '표가 갈려 아무도 처형되지 않았어요' : `${executed?.nickname} 님이 처형되었어요`}
          </p>
          {executed && (
            <p className="mt-1 text-[12.5px] text-sub">
              정체는 <b className="text-ink">{MAFIA_ROLE_LABEL[executed.role]?.label ?? executed.role}</b>
            </p>
          )}
        </div>

        <SectionTitle>생존자</SectionTitle>
        <PlayerStrip players={snapshot.players} selfId={me?.userId} />

        <div className="mt-5">
          {isHost ? (
            <Button variant="danger" onClick={() => callPhase('night')}>
              🌙 다음 밤으로
            </Button>
          ) : (
            <WaitingForHost label="방장이 다음 밤을 시작합니다." />
          )}
        </div>
      </div>
    );
  }

  /* ─────────────── 결과 ─────────────── */
  const mafiaWon = state.winner === 'mafia';
  const meVictory = role === 'mafia' ? mafiaWon : !mafiaWon;
  return (
    <div>
      <div
        className={cn(
          'panel mt-1 px-5 py-6 text-center',
          mafiaWon ? 'border-rose/40 bg-rose/10' : 'border-mint/40 bg-mint/10',
        )}
      >
        <p className="text-[44px]">{mafiaWon ? '🔪' : '🎉'}</p>
        <p className={cn('mt-1 text-[24px] font-black', mafiaWon ? 'text-rose' : 'text-mint')}>
          {mafiaWon ? '마피아 승리' : '시민 승리'}
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-sub">
          마피아는 <b className="text-ink">{(state.mafiaNames ?? []).join(', ') || '?'}</b>
        </p>
        <p
          className={cn(
            'mt-3 inline-block rounded-full px-3 py-1.5 text-[12px] font-extrabold',
            meVictory ? 'bg-mint/20 text-mint' : 'bg-line/50 text-sub',
          )}
        >
          {meVictory ? '🏆 나는 이번 판 승리!' : '이번 판은 패배 · 다음 판에 다시!'}
        </p>
      </div>

      <SectionTitle hint="내 직업">내 역할</SectionTitle>
      <div className="flex items-center justify-between rounded-xl border border-line/60 bg-surf/60 px-3.5 py-3 text-[12.5px] font-bold">
        <span>
          {roleMeta.emoji} {roleMeta.label}
        </span>
        <span className="text-sub">{iAmAlive ? '끝까지 생존' : '중간에 탈락'}</span>
      </div>

      <div className="mt-5">
        {isHost ? (
          <Button onClick={() => callPhase('lobby')}>대기실로 돌아가기</Button>
        ) : (
          <WaitingForHost label="방장이 대기실로 돌아가면 다시 시작할 수 있어요." />
        )}
      </div>
    </div>
  );
}
