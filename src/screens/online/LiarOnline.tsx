import { useState } from 'react';
import { Button, SectionTitle } from '../../components/ui';
import { onlineApi } from '../../lib/onlineApi';
import { sfx } from '../../lib/sound';
import { cn } from '../../lib/utils';
import type { RoomPlayer, Snapshot } from '../../lib/onlineTypes';
import type { RoomActor } from './RoomScreen';
import { PhaseTimer, PlayerStrip, TargetGrid, WaitingForHost } from './parts';

export default function LiarOnline({
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
  const alive = snapshot.players.filter((player) => player.isAlive);
  const role = snapshot.me?.role ?? null;
  const word = snapshot.me?.word ?? null;
  const foolMode = state.mode === 'fool';
  const [target, setTarget] = useState<string | null>(snapshot.myVote ?? null);
  const [guess, setGuess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function callPhase(next: string) {
    void actor.act(() => onlineApi.liarPhase(room.id, next));
  }

  /* ─────────────── 역할 확인 ─────────────── */
  if (phase === 'liar_reveal') {
    const showLiar = role === 'liar' && !foolMode;
    return (
      <div>
        <div
          className={cn(
            'panel mt-1 px-5 py-7 text-center',
            showLiar ? 'border-rose/40 bg-rose/5' : 'border-purple/30 bg-purple/5',
          )}
        >
          <p className="text-[11px] font-extrabold tracking-[0.2em] text-sub">내 역할 · 나만 볼 수 있어요</p>
          <p className="mt-3 text-[46px]">{showLiar ? '🕵️‍♂️' : role === 'liar' ? '🤡' : '🙂'}</p>
          <p className={cn('mt-2 text-[30px] font-black', showLiar ? 'text-rose' : 'text-ink')}>
            {showLiar ? '라이어' : role === 'liar' ? '제시어' : '시민'}
          </p>

          {word ? (
            <>
              <p className="mt-3 text-[11px] font-extrabold tracking-[0.18em] text-sub">오늘의 제시어</p>
              <p className="mt-1 break-keep text-[34px] font-black leading-tight text-ink">{word}</p>
            </>
          ) : (
            <p className="mt-3 text-[12px] leading-relaxed text-sub">
              제시어를 모릅니다. 설명을 듣고 정답을 추리거나, 자연스럽게 섞여 보세요.
            </p>
          )}

          <span className="mt-4 inline-block rounded-full border border-line bg-bg/50 px-3 py-1 text-[11px] font-bold text-sub">
            {state.categoryEmoji} {state.categoryLabel}
            {foolMode ? ' · 바보 모드' : ''}
          </span>
          {foolMode && role === 'liar' && (
            <p className="mt-3 text-[11px] leading-relaxed text-amber">
              🤡 바보 모드 — 내가 라이어인지 아무도(나도) 몰라요. 단, 제시어가 아주 조금 달라요.
            </p>
          )}
        </div>

        <SectionTitle hint={`${alive.length}명`}>참가자</SectionTitle>
        <PlayerStrip players={snapshot.players} selfId={me?.userId} />

        <div className="mt-5">
          {isHost ? (
            <Button
              onClick={() => {
                sfx.reveal();
                callPhase('discuss');
              }}
            >
              모두 확인했어요 · 토론 시작
            </Button>
          ) : (
            <WaitingForHost label="다들 제시어를 확인하고 있어요. 방장이 토론을 시작합니다." />
          )}
        </div>
      </div>
    );
  }

  /* ─────────────── 토론 ─────────────── */
  if (phase === 'liar_discuss') {
    return (
      <div>
        <div className="panel mt-1 px-4 py-5 text-center">
          <p className="text-[11px] font-extrabold tracking-[0.2em] text-purple">DISCUSSION</p>
          <div className="mt-3">
            <PhaseTimer seconds={remaining} />
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-sub">
            한 명씩 한 문장으로 제시어를 설명하세요. 정답을 그대로 말하면 라이어가 알아차려요.
          </p>
        </div>

        <SectionTitle hint="한 명씩 돌아가며">설명 순서</SectionTitle>
        <PlayerStrip players={snapshot.players} selfId={me?.userId} />

        <div className="panel-tight mt-4 px-4 py-3">
          <p className="text-[11.5px] leading-relaxed text-sub">
            💡 너무 애매하게 말하면 오히려 의심받아요. 라이어는 다른 사람 설명을 잘 듣고 눈치로 버텨 보세요.
          </p>
        </div>

        <div className="mt-4">
          {isHost ? (
            <Button variant="danger" onClick={() => callPhase('vote')}>
              🗳️ 투표 시작
            </Button>
          ) : (
            <WaitingForHost label="방장이 투표를 시작하면 한 명을 지목할 수 있어요." />
          )}
        </div>
      </div>
    );
  }

  /* ─────────────── 투표 ─────────────── */
  if (phase === 'liar_vote') {
    const voted = snapshot.myVote ?? target;
    return (
      <div>
        <div className="panel mt-1 px-4 py-5 text-center">
          <p className="text-[11px] font-extrabold tracking-[0.2em] text-rose">SECRET VOTE</p>
          <p className="mt-1 text-[16px] font-extrabold">가장 의심되는 사람은?</p>
          <div className="mt-2">
            <PhaseTimer seconds={remaining} tone="rose" />
          </div>
          <p className="mt-2 text-[11.5px] text-sub">
            {snapshot.votesIn}/{alive.length}명 투표 완료
          </p>
        </div>

        <div className="mt-4">
          <TargetGrid players={alive} selfId={me?.userId} selectedId={target} onSelect={setTarget} />
        </div>

        <div className="mt-4 space-y-2">
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
            {voted ? '투표 바꾸기' : '지목하고 투표하기'}
          </Button>
          {snapshot.myVote && (
            <p className="text-center text-[11.5px] text-mint">
              ✅ {snapshot.players.find((player) => player.userId === snapshot.myVote)?.nickname} 님에게 투표했어요 ·
              마감 전까지 바꿀 수 있어요
            </p>
          )}
        </div>
      </div>
    );
  }

  /* ─────────────── 라이어 마지막 기회 ─────────────── */
  if (phase === 'liar_guess') {
    const isLiar = role === 'liar';
    return (
      <div>
        <div className="panel mt-1 border-rose/40 bg-rose/5 px-5 py-6 text-center">
          <p className="text-[11px] font-extrabold tracking-[0.2em] text-rose">TRAP!</p>
          <p className="mt-2 text-[20px] font-black text-rose">라이어를 잡았습니다!</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-sub">
            지목된 사람: <b className="text-ink">{state.accused?.nickname}</b> · 정답을 맞히면 라이어 승리
          </p>
          <div className="mt-3">
            <PhaseTimer seconds={remaining} tone="rose" />
          </div>
        </div>

        {state.counts && state.counts.length > 0 && (
          <>
            <SectionTitle hint={`총 ${state.totalVotes ?? 0}표`}>투표 결과</SectionTitle>
            <div className="space-y-1.5">
              {state.counts.map((row) => (
                <div key={row.userId} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 truncate text-[12.5px] font-bold">{row.nickname}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-line/60">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-rose to-purple"
                      style={{ width: `${Math.max(8, Math.round((row.votes / Math.max(1, state.totalVotes ?? 1)) * 100))}%` }}
                    />
                  </div>
                  <span className="num w-8 text-right text-[11.5px] font-extrabold text-sub">{row.votes}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mt-5">
          {isLiar ? (
            <div className="panel px-4 py-4">
              <p className="text-[13px] font-extrabold text-rose">{state.accused?.nickname} 님, 제시어를 맞혀 보세요</p>
              <p className="mt-1 text-[11.5px] text-sub">
                카테고리는 <b className="text-ink">{state.categoryEmoji} {state.categoryLabel}</b> 이에요.
              </p>
              <input
                value={guess}
                onChange={(event) => setGuess(event.target.value)}
                placeholder="제시어 입력"
                maxLength={20}
                className="mt-3 w-full rounded-2xl border border-line bg-bg/60 px-4 py-3.5 text-center text-[17px] font-bold focus:border-rose/60 focus:outline-none"
              />
              <div className="mt-3">
                <Button
                  variant="danger"
                  disabled={!guess.trim() || submitting}
                  onClick={() => {
                    setSubmitting(true);
                    void actor
                      .act(() => onlineApi.submitGuess(room.id, guess))
                      .finally(() => setSubmitting(false));
                  }}
                >
                  정답 제출
                </Button>
              </div>
            </div>
          ) : (
            <WaitingForHost label="라이어가 제시어를 맞히는 중이에요. 잠시만 기다려 주세요." />
          )}
        </div>
      </div>
    );
  }

  /* ─────────────── 결과 ─────────────── */
  const winner = state.winner ?? null;
  const liarWon = winner === 'liar';
  const meVictory = winner ? (liarWon ? role === 'liar' : role !== 'liar') : false;

  return (
    <div>
      <div
        className={cn(
          'panel mt-1 px-5 py-6 text-center',
          liarWon ? 'border-rose/40 bg-rose/10' : 'border-mint/40 bg-mint/10',
        )}
      >
        <p className="text-[44px]">{liarWon ? '😈' : '🎉'}</p>
        <p className={cn('mt-1 text-[24px] font-black', liarWon ? 'text-rose' : 'text-mint')}>
          {liarWon ? '라이어 승리' : '시민 승리'}
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-sub">
          라이어는 <b className="text-ink">{state.liarNickname ?? '?'}</b> · 제시어는{' '}
          <b className="text-ink">{state.word ?? '?'}</b>
        </p>
        {state.accusedIsLiar != null && (
          <p className="mt-1 text-[11.5px] text-sub">
            {state.accusedIsLiar
              ? state.guessCorrect
                ? '지목은 맞았지만 정답을 맞혀 라이어가 이겼어요.'
                : '지목은 맞았지만 정답을 못 맞혀 시민이 이겼어요.'
              : '시민들이 라이어를 놓쳤어요.'}
          </p>
        )}
        <p className={cn('mt-3 inline-block rounded-full px-3 py-1.5 text-[12px] font-extrabold', meVictory ? 'bg-mint/20 text-mint' : 'bg-line/50 text-sub')}>
          {meVictory ? '🏆 나는 이번 판 승리!' : '이번 판은 패배 · 다음 판에 다시!'}
        </p>
      </div>

      {state.counts && state.counts.length > 0 && (
        <>
          <SectionTitle hint={`총 ${state.totalVotes ?? 0}표`}>최종 투표</SectionTitle>
          <div className="space-y-1.5">
            {state.counts.map((row) => (
              <div key={row.userId} className="flex items-center gap-3">
                <span className="w-20 shrink-0 truncate text-[12.5px] font-bold">{row.nickname}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-line/60">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-rose to-purple"
                    style={{ width: `${Math.max(8, Math.round((row.votes / Math.max(1, state.totalVotes ?? 1)) * 100))}%` }}
                  />
                </div>
                <span className="num w-8 text-right text-[11.5px] font-extrabold text-sub">{row.votes}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <SectionTitle>다음 판</SectionTitle>
      {isHost ? (
        <Button onClick={() => callPhase('lobby')}>대기실로 돌아가기</Button>
      ) : (
        <WaitingForHost label="방장이 대기실로 돌아가면 다시 시작할 수 있어요." />
      )}
    </div>
  );
}
