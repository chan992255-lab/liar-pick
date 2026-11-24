import { useState } from 'react';
import type { LogEntry, MafiaConfig, MafiaPlayer, MafiaRole, ScoreEntry } from '../../lib/types';
import { ROLE_META } from '../../lib/types';
import { loadScores, recordRound } from '../../lib/storage';
import { cn, tally, uid } from '../../lib/utils';
import { sfx } from '../../lib/sound';
import { Button, SectionTitle, Stepper, TopBar } from '../../components/ui';
import { HoldReveal } from '../../components/HoldReveal';
import { TimerPanel } from '../../components/Timer';
import { PlayerChipGrid, PlayerNameEditor } from '../../components/PlayerSelect';
import { ScoreRows } from '../../components/ScoreBoard';
import { SoundButton } from '../../components/SoundButton';
import { GameHeaderRight } from '../../components/GameHeaderRight';
import { defaultNames, resizeNames, toPlayers } from '../liar/engine';
import {
  alivePlayers,
  assignRoles,
  checkWin,
  emptyNight,
  recommendedRoles,
  resolveKill,
  type NightActions,
} from './engine';

type Phase = 'setup' | 'reveal' | 'night' | 'morning' | 'day' | 'vote' | 'execution' | 'result';

const ROLE_TONE: Record<MafiaRole, { text: string; border: string; bg: string; accent: 'rose' | 'violet' | 'mint' | 'purple' }> = {
  mafia: { text: 'text-rose', border: 'border-rose/40', bg: 'bg-rose/10', accent: 'rose' },
  police: { text: 'text-violet', border: 'border-violet/40', bg: 'bg-violet/10', accent: 'violet' },
  doctor: { text: 'text-mint', border: 'border-mint/40', bg: 'bg-mint/10', accent: 'mint' },
  citizen: { text: 'text-sub', border: 'border-line', bg: 'bg-raised/50', accent: 'purple' },
};

export default function MafiaGame({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>('setup');
  const [config, setConfig] = useState<MafiaConfig | null>(null);
  const [players, setPlayers] = useState<MafiaPlayer[]>([]);
  const [revealIndex, setRevealIndex] = useState(0);
  const [nightIndex, setNightIndex] = useState(0);
  const [actions, setActions] = useState<NightActions>(emptyNight());
  const [choice, setChoice] = useState<string | null>(null);
  const [checkInfo, setCheckInfo] = useState<{ name: string; isMafia: boolean } | null>(null);
  const [nightResult, setNightResult] = useState<{ victim: MafiaPlayer | null; saved: boolean } | null>(null);
  const [dayVotes, setDayVotes] = useState<Record<string, string>>({});
  const [voteIndex, setVoteIndex] = useState(0);
  const [tallyInfo, setTallyInfo] = useState<{
    counts: Record<string, number>;
    executed: MafiaPlayer | null;
    tie: boolean;
    total: number;
  } | null>(null);
  const [winner, setWinner] = useState<'mafia' | 'citizens' | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [scores, setScores] = useState<ScoreEntry[]>(loadScores);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [dayNo, setDayNo] = useState(1);

  function addLog(label: string, tone: LogEntry['tone']) {
    setLog((prev) => [{ id: uid('log'), label, tone }, ...prev].slice(0, 24));
  }

  function startGame(next: MafiaConfig) {
    const dealt = assignRoles(next);
    setConfig(next);
    setPlayers(dealt);
    setPhase('reveal');
    setRevealIndex(0);
    setLog([]);
    setDayNo(1);
    setWinner(null);
    setNightResult(null);
    setTallyInfo(null);
    setActions(emptyNight());
    setDayVotes({});
    sfx.night();
  }

  function finishGame(team: 'mafia' | 'citizens') {
    setWinner(team);
    const winners = players
      .filter((player) => (team === 'mafia' ? player.role === 'mafia' : player.role !== 'mafia'))
      .map((player) => player.name);
    setScores(recordRound('mafia', players.map((player) => player.name), winners));
    setHighlight(winners);
    setPhase('result');
    if (team === 'mafia') sfx.lose();
    else sfx.win();
  }

  function advanceReveal() {
    if (!config) return;
    if (revealIndex + 1 >= players.length) {
      setNightIndex(0);
      setActions(emptyNight());
      setChoice(null);
      setCheckInfo(null);
      setPhase('night');
      sfx.night();
      return;
    }
    setRevealIndex((index) => index + 1);
  }

  function completeNightAction(targetId?: string) {
    const alive = alivePlayers(players);
    const actor = alive[nightIndex];
    if (!actor) return;
    let next = actions;
    if (actor.role === 'mafia') {
      next = targetId ? { ...actions, kills: { ...actions.kills, [actor.id]: targetId } } : actions;
    } else if (actor.role === 'doctor') {
      next = targetId ? { ...actions, protects: { ...actions.protects, [actor.id]: targetId } } : actions;
    } else if (actor.role === 'police') {
      const isMafia = players.find((player) => player.id === targetId)?.role === 'mafia';
      next = targetId
        ? { ...actions, checks: { ...actions.checks, [actor.id]: { target: targetId, isMafia } } }
        : actions;
    }
    setActions(next);
    setChoice(null);
    setCheckInfo(null);

    if (nightIndex + 1 >= alive.length) {
      resolveNight(next);
    } else {
      setNightIndex((index) => index + 1);
      sfx.pass();
    }
  }

  function resolveNight(next: NightActions) {
    const victimId = resolveKill(next);
    const protectedIds = Object.values(next.protects);
    const victim = victimId ? players.find((player) => player.id === victimId) ?? null : null;
    const saved = !!victim && protectedIds.includes(victim.id);
    if (victim && !saved) {
      setPlayers((prev) => prev.map((player) => (player.id === victim.id ? { ...player, alive: false } : player)));
    }
    setNightResult({ victim, saved });
    addLog(
      saved
        ? `🌙 ${dayNo}일차 밤 — 의사의 보호로 아무도 사망하지 않았다`
        : victim
          ? `🌙 ${dayNo}일차 밤 — ${victim.name} 님이 습격당했다`
          : `🌙 ${dayNo}일차 밤 — 아무 일도 일어나지 않았다`,
      saved ? 'mint' : 'rose',
    );
    setPhase('morning');
    sfx.morning();
  }

  function afterVotes(nextVotes: Record<string, string>) {
    const result = tally(nextVotes);
    const alive = alivePlayers(players);
    if (result.top.length === 1) {
      const executedId = result.top[0];
      const executed = alive.find((player) => player.id === executedId) ?? null;
      if (executed) {
        setPlayers((prev) =>
          prev.map((player) => (player.id === executed.id ? { ...player, alive: false } : player)),
        );
        addLog(`☀️ ${dayNo}일차 낮 — ${executed.name} 님이 처형되었다 (${ROLE_META[executed.role].label})`, 'amber');
      }
      setTallyInfo({ counts: result.counts, executed, tie: false, total: result.total });
    } else {
      setTallyInfo({ counts: result.counts, executed: null, tie: true, total: result.total });
      addLog(`☀️ ${dayNo}일차 낮 — 표가 갈려 아무도 처형되지 않았다`, 'neutral');
    }
    setDayVotes(nextVotes);
    setPhase('execution');
    sfx.execute();
  }

  function submitDayVote(targetId: string, voterId: string) {
    const nextVotes = { ...dayVotes, [voterId]: targetId };
    setDayVotes(nextVotes);
    setChoice(null);
    const alive = alivePlayers(players);
    if (voteIndex + 1 >= alive.length) {
      afterVotes(nextVotes);
    } else {
      setVoteIndex((index) => index + 1);
      sfx.pass();
    }
  }

  function proceedAfterExecution() {
    const team = checkWin(players);
    if (team) {
      finishGame(team);
      return;
    }
    setDayNo((value) => value + 1);
    setNightIndex(0);
    setActions(emptyNight());
    setChoice(null);
    setCheckInfo(null);
    setDayVotes({});
    setVoteIndex(0);
    setTallyInfo(null);
    setPhase('night');
    sfx.night();
  }

  /* ------------------------------- 설정 ------------------------------- */
  if (phase === 'setup' || !config) {
    return (
      <MafiaSetup
        onExit={onExit}
        onStart={(next) => {
          sfx.tap();
          startGame(next);
        }}
      />
    );
  }

  const alive = alivePlayers(players);
  const mafiaMembers = players.filter((player) => player.role === 'mafia');

  /* ------------------------------ 역할 확인 ------------------------------ */
  if (phase === 'reveal') {
    const actor = players[revealIndex];
    const meta = ROLE_META[actor.role];
    const tone = ROLE_TONE[actor.role];
    const mates = mafiaMembers.filter((player) => player.id !== actor.id).map((player) => player.name);
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <TopBar
          title={`비밀 역할 ${revealIndex + 1}/${players.length}`}
          subtitle={`${config.mafia} 마피아 · ${config.police} 경찰 · ${config.doctor} 의사`}
          right={<GameHeaderRight onQuit={onExit} />}
        />
        <div className="app-body flex flex-col justify-center pb-10">
          <HoldReveal
            key={`mafia-reveal-${actor.id}`}
            name={actor.name}
            kicker="마피아 게임 · 역할 확인"
            accent={tone.accent}
            doneLabel={
              revealIndex + 1 >= players.length ? '모두 확인했어요 · 첫 번째 밤' : '확인 완료 · 다음 사람에게'
            }
            onDone={advanceReveal}
            sideNote="이 화면은 다른 사람에게 절대 보여주지 마세요."
          >
            <div className="flex flex-col items-center">
              <span className="text-5xl">{meta.emoji}</span>
              <p className="mt-2 text-[12px] font-bold text-sub">당신의 역할은</p>
              <p className={cn('mt-1 text-[40px] font-black leading-none', tone.text)}>{meta.label}</p>
              <p className="mt-3 max-w-[240px] text-[12px] leading-relaxed text-sub">{meta.blurb}</p>
              {actor.role === 'mafia' && (
                <div className={cn('mt-3 rounded-xl border px-3 py-2 text-[11.5px] font-bold', tone.border, tone.bg)}>
                  {mates.length ? `동료 마피아 · ${mates.join(', ')}` : '동료 없이 혼자 싸우는 마피아'}
                </div>
              )}
              {(actor.role === 'police' || actor.role === 'doctor') && (
                <div className="mt-3 rounded-xl border border-line bg-bg/50 px-3 py-2 text-[11px] text-sub">
                  낮에는 시민처럼 토론하고 투표하세요.
                </div>
              )}
            </div>
          </HoldReveal>
        </div>
      </div>
    );
  }

  /* -------------------------------- 밤 -------------------------------- */
  if (phase === 'night') {
    const actor = alive[nightIndex];
    if (!actor) {
      return (
        <div className="flex min-h-[100dvh] flex-col">
          <TopBar title="밤" right={<GameHeaderRight onQuit={onExit} />} />
          <div className="app-body flex items-center justify-center">
            <Button onClick={() => setPhase('morning')}>계속</Button>
          </div>
        </div>
      );
    }
    const tone = ROLE_TONE[actor.role];
    const targets =
      actor.role === 'mafia'
        ? alive.filter((player) => player.role !== 'mafia')
        : actor.role === 'doctor'
          ? alive
          : actor.role === 'police'
            ? alive.filter((player) => player.id !== actor.id)
            : [];

    return (
      <div className="flex min-h-[100dvh] flex-col">
        <TopBar
          title={`🌙 ${dayNo}일차 밤`}
          subtitle={`${nightIndex + 1}/${alive.length}번째 차례`}
          right={<GameHeaderRight onQuit={onExit} />}
        />
        <div className="app-body flex flex-col justify-center pb-10">
          <HoldReveal
            key={`night-${dayNo}-${actor.id}`}
            name={actor.name}
            kicker={`조용히 · ${dayNo}일차 밤`}
            accent={tone.accent}
            doneLabel={
              actor.role === 'citizen'
                ? '조용히 다음 사람에게 넘기기'
                : choice
                  ? nightIndex + 1 >= alive.length
                    ? '밤 마치기'
                    : '결정 완료 · 다음 사람에게'
                  : '대상을 선택해 주세요'
            }
            doneDisabled={actor.role !== 'citizen' && !choice}
            onDone={() => completeNightAction(choice ?? undefined)}
            sideNote="소리가 나지 않게, 화면을 가린 채 확인하세요."
          >
            {actor.role === 'citizen' ? (
              <div className="flex flex-col items-center">
                <span className="text-5xl">🌙</span>
                <p className="mt-3 text-[15px] font-extrabold">당신은 평범한 시민이에요</p>
                <p className="mt-2 max-w-[230px] text-[12px] leading-relaxed text-sub">
                  밤에는 아무 능력도 없습니다. 아무것도 하지 않은 채 조용히 다음 사람에게 폰을 넘겨주세요.
                </p>
              </div>
            ) : (
              <div className="w-full">
                <p className={cn('text-center text-[12px] font-bold', tone.text)}>
                  {actor.role === 'mafia'
                    ? '제거할 사람을 지목하세요'
                    : actor.role === 'police'
                      ? '조사할 사람을 선택하세요'
                      : '보호할 사람을 선택하세요'}
                </p>
                <div className="mt-1 text-center text-[10.5px] text-sub">
                  {actor.role === 'mafia'
                    ? matesText(mafiaMembers, actor.id)
                    : actor.role === 'police'
                      ? '조사 결과는 즉시 알려드려요'
                      : '본인을 보호할 수도 있어요'}
                </div>
                <div className="mt-3">
                  <PlayerChipGrid
                    players={targets}
                    selectedId={choice}
                    tone={actor.role === 'mafia' ? 'rose' : 'purple'}
                    onSelect={(id) => {
                      sfx.tap();
                      setChoice(id);
                      if (actor.role === 'police') {
                        const target = players.find((player) => player.id === id);
                        setCheckInfo({
                          name: target?.name ?? '',
                          isMafia: target?.role === 'mafia',
                        });
                        sfx.reveal();
                      }
                    }}
                  />
                </div>
                {checkInfo && (
                  <div
                    className={cn(
                      'mt-3 rounded-xl border px-3 py-2 text-center text-[12px] font-extrabold',
                      checkInfo.isMafia ? 'border-rose/50 bg-rose/15 text-rose' : 'border-mint/40 bg-mint/15 text-mint',
                    )}
                  >
                    {checkInfo.name} 님은 {checkInfo.isMafia ? '마피아입니다 🔪' : '마피아가 아닙니다 🙂'}
                  </div>
                )}
              </div>
            )}
          </HoldReveal>
        </div>
      </div>
    );
  }

  /* ------------------------------- 아침 ------------------------------- */
  if (phase === 'morning') {
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <TopBar title={`🌅 ${dayNo}일차 아침`} subtitle="간밤의 소식" right={<GameHeaderRight onQuit={onExit} />} />
        <div className="app-body">
          <div
            className={cn(
              'mt-1 rounded-4xl border px-5 py-8 text-center',
              nightResult?.saved ? 'border-mint/40 bg-mint/10' : 'border-rose/40 bg-rose/10',
            )}
          >
            <p className="text-[52px]">{nightResult?.saved ? '💉' : '⚰️'}</p>
            <p className="mt-2 text-[21px] font-black">
              {nightResult?.saved
                ? '아무도 죽지 않았습니다'
                : nightResult?.victim
                  ? `${nightResult.victim.name} 님이 사망했습니다`
                  : '조용한 밤이었습니다'}
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-sub">
              {nightResult?.saved
                ? '의사가 결정적인 순간에 대상을 지켜냈어요.'
                : nightResult?.victim
                  ? '마피아의 습격을 받았습니다. 명복을 빕니다… 이제 범인을 찾아주세요.'
                  : '아무 일도 일어나지 않았어요.'}
            </p>
          </div>

          <SectionTitle hint={`${alive.length}명 생존`}>생존자</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {players.map((player) => (
              <span
                key={player.id}
                className={cn('chip px-3 py-1.5', !player.alive && 'border-rose/30 text-sub/50 line-through')}
              >
                {player.name}
              </span>
            ))}
          </div>

          <div className="mt-6 space-y-2 pb-4">
            <Button
              onClick={() => {
                const team = checkWin(players);
                if (team) finishGame(team);
                else {
                  setPhase('day');
                  sfx.tap();
                }
              }}
            >
              ☀️ 낮 토론 시작
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------- 낮 -------------------------------- */
  if (phase === 'day') {
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <TopBar
          title={`☀️ ${dayNo}일차 낮`}
          subtitle={`생존 ${alive.length}명 · 마피아를 찾아라`}
          right={<GameHeaderRight onQuit={onExit} />}
        />
        <div className="app-body">
          <div className="panel mt-1 px-5 py-5">
            <TimerPanel seconds={config.seconds} accent="mint" label="의심 가는 사람을 이야기해 보세요" />
          </div>

          <SectionTitle hint={`${alive.length}명`}>생존자</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            {alive.map((player) => (
              <div
                key={player.id}
                className="rounded-2xl border border-line/70 bg-raised/50 px-3 py-2.5 text-[13px] font-bold"
              >
                {player.name}
              </div>
            ))}
          </div>

          {log.length > 0 && (
            <>
              <SectionTitle>지금까지의 기록</SectionTitle>
              <div className="panel divide-y divide-line/60 px-4">
                {log.slice(0, 5).map((entry) => (
                  <p key={entry.id} className="py-2.5 text-[11.5px] leading-relaxed text-sub">
                    {entry.label}
                  </p>
                ))}
              </div>
            </>
          )}

          <div className="sticky bottom-0 mt-6 bg-gradient-to-t from-bg via-bg/95 to-bg/0 pb-3 pt-4">
            <Button
              onClick={() => {
                setDayVotes({});
                setVoteIndex(0);
                setChoice(null);
                setPhase('vote');
                sfx.tap();
              }}
            >
              🗳️ 처형 투표 시작
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------- 투표 -------------------------------- */
  if (phase === 'vote') {
    const voter = alive[voteIndex];
    if (!voter) {
      return (
        <div className="app-body flex items-center justify-center">
          <Button onClick={() => afterVotes(dayVotes)}>결과 보기</Button>
        </div>
      );
    }
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <TopBar
          title={`처형 투표 ${voteIndex + 1}/${alive.length}`}
          subtitle="한 명씩 몰래 투표해요"
          right={<GameHeaderRight onQuit={onExit} />}
        />
        <div className="app-body flex flex-col justify-center pb-10">
          <HoldReveal
            key={`day-vote-${dayNo}-${voter.id}`}
            name={voter.name}
            kicker={`${dayNo}일차 · 처형 투표`}
            accent="amber"
            doneLabel={voteIndex + 1 >= alive.length ? '투표 마감 · 결과 보기' : '투표 완료 · 다음 사람에게'}
            doneDisabled={!choice}
            onDone={() => choice && submitDayVote(choice, voter.id)}
            sideNote="본인에게는 투표할 수 없어요."
          >
            <p className="text-[13px] font-bold text-sub">처형할 사람을 선택하세요</p>
            <div className="mt-3 w-full">
              <PlayerChipGrid
                players={alive}
                selectedId={choice}
                disabledId={voter.id}
                onSelect={(id) => {
                  sfx.tap();
                  setChoice(id);
                }}
                tone="rose"
              />
            </div>
          </HoldReveal>
        </div>
      </div>
    );
  }

  /* ------------------------------ 처형 결과 ------------------------------ */
  if (phase === 'execution' && tallyInfo) {
    const ranked = Object.entries(tallyInfo.counts).sort((a, b) => b[1] - a[1]);
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <TopBar title="처형 결과" subtitle={`총 ${tallyInfo.total}표`} right={<GameHeaderRight onQuit={onExit} />} />
        <div className="app-body">
          <div className="panel mt-1 space-y-2 px-4 py-4">
            {ranked.map(([id, count]) => {
              const name = players.find((player) => player.id === id)?.name ?? '?';
              const percent = Math.round((count / Math.max(1, tallyInfo.total)) * 100);
              return (
                <div key={id} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 truncate text-[13px] font-bold">{name}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-line/60">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber to-rose"
                      style={{ width: `${Math.max(8, percent)}%` }}
                    />
                  </div>
                  <span className="num w-8 text-right text-[12px] font-extrabold text-sub">{count}표</span>
                </div>
              );
            })}
          </div>

          <div
            className={cn(
              'mt-4 rounded-3xl border px-5 py-6 text-center',
              tallyInfo.executed ? 'border-rose/40 bg-rose/10' : 'border-line bg-raised/40',
            )}
          >
            <p className="text-[40px]">{tallyInfo.executed ? '⚰️' : '⚖️'}</p>
            <p className="mt-2 text-[19px] font-extrabold">
              {tallyInfo.executed ? `${tallyInfo.executed.name} 님 처형` : '아무도 처형되지 않았습니다'}
            </p>
            {tallyInfo.executed && (
              <p className="mt-1.5 text-[13px] font-bold">
                정체는{' '}
                <span className={ROLE_TONE[tallyInfo.executed.role].text}>
                  {ROLE_META[tallyInfo.executed.role].emoji} {ROLE_META[tallyInfo.executed.role].label}
                </span>
                {tallyInfo.executed.role === 'mafia' ? ' 였습니다!' : ' 였습니다…'}
              </p>
            )}
            <p className="mt-2 text-[11.5px] text-sub">
              {tallyInfo.executed
                ? '생존자가 한 명 줄었어요. 다시 밤이 찾아옵니다.'
                : '표가 갈렸어요. 아무도 처형하지 않고 밤으로 넘어갑니다.'}
            </p>
          </div>

          <div className="mt-5 pb-4">
            <Button onClick={proceedAfterExecution}>🌙 다음 밤으로</Button>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------- 결과 -------------------------------- */
  if (phase === 'result' && winner) {
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <TopBar title="게임 결과" subtitle={`${dayNo}일차 종료`} right={<GameHeaderRight onQuit={onExit} />} />
        <div className="app-body">
          <div
            className={cn(
              'mt-1 rounded-4xl border px-5 py-7 text-center',
              winner === 'mafia'
                ? 'border-rose/40 bg-gradient-to-b from-rose/20 to-surf'
                : 'border-mint/40 bg-gradient-to-b from-mint/20 to-surf',
            )}
          >
            <p className="text-[52px] leading-none">{winner === 'mafia' ? '🔪' : '🎉'}</p>
            <p className="mt-2 text-[26px] font-black">
              {winner === 'mafia' ? '마피아 승리!' : '시민 승리!'}
            </p>
            <p className="mt-1 text-[12.5px] text-sub">
              {winner === 'mafia'
                ? '마피아가 마을을 장악했습니다.'
                : '모든 마피아를 잡아냈습니다. 마을을 지켰어요!'}
            </p>
          </div>

          <SectionTitle hint="모두 공개">역할 공개</SectionTitle>
          <div className="panel divide-y divide-line/60 overflow-hidden">
            {players.map((player) => {
              const meta = ROLE_META[player.role];
              return (
                <div key={player.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-[16px]">{meta.emoji}</span>
                  <span className={cn('min-w-0 flex-1 truncate text-[13.5px] font-bold', !player.alive && 'text-sub line-through')}>
                    {player.name}
                  </span>
                  <span className={cn('text-[11.5px] font-extrabold', ROLE_TONE[player.role].text)}>{meta.label}</span>
                  <span className="text-[10px] text-sub">{player.alive ? '생존' : '사망'}</span>
                </div>
              );
            })}
          </div>

          <SectionTitle hint="이 기기에서 누적">누적 점수판</SectionTitle>
          <ScoreRows scores={scores} highlight={highlight} limit={8} />

          <div className="mt-5 space-y-2 pb-4">
            <Button
              onClick={() => {
                if (config) startGame(config);
              }}
            >
              🔁 한 판 더 (같은 멤버)
            </Button>
            <Button variant="ghost" onClick={onExit}>
              홈으로
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function matesText(members: MafiaPlayer[], selfId: string): string {
  const others = members.filter((member) => member.id !== selfId).map((member) => member.name);
  return others.length ? `동료 마피아 · ${others.join(', ')}` : '혼자 싸우는 마피아예요';
}

/* ================================ 설정 ================================ */

function MafiaSetup({
  onStart,
  onExit,
}: {
  onStart: (config: MafiaConfig) => void;
  onExit: () => void;
}) {
  const [count, setCount] = useState(6);
  const [names, setNames] = useState<string[]>(defaultNames(6));
  const base = recommendedRoles(6);
  const [mafia, setMafia] = useState(base.mafia);
  const [police, setPolice] = useState(base.police);
  const [doctor, setDoctor] = useState(base.doctor);
  const [minutes, setMinutes] = useState(2);

  const citizens = count - mafia - police - doctor;
  const mafiaMax = Math.max(1, Math.floor((count - 1) / 2));
  const valid = citizens >= 1 && mafia >= 1 && mafia < count - mafia;

  const applyCount = (next: number) => {
    setCount(next);
    setNames(resizeNames(names, next));
    const rec = recommendedRoles(next);
    setMafia(rec.mafia);
    setPolice(rec.police);
    setDoctor(rec.doctor);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <TopBar
        title="🔫 마피아 게임"
        subtitle={`${count}명 · 마피아 ${mafia}명`}
        onBack={onExit}
        right={<SoundButton />}
      />
      <div className="app-body">
        <div className="flex flex-wrap gap-2">
          <span className="chip">🌙 밤 · ☀️ 낮</span>
          <span className="chip">🕵️ 경찰 조사</span>
          <span className="chip">💉 의사 보호</span>
        </div>

        <SectionTitle hint="4 ~ 12명">인원</SectionTitle>
        <div className="panel px-4 py-3">
          <Stepper label="참가자" value={count} min={4} max={12} onChange={applyCount} />
        </div>

        <SectionTitle hint="비우면 자동 이름">참가자 이름</SectionTitle>
        <div className="max-h-[210px] overflow-y-auto rounded-2xl">
          <PlayerNameEditor names={names} onChange={setNames} />
        </div>

        <SectionTitle hint="인원에 맞춰 자동 추천">역할 구성</SectionTitle>
        <div className="space-y-2">
          <Stepper label="🔪 마피아" value={mafia} min={1} max={mafiaMax} onChange={setMafia} />
          <Stepper label="🕵️ 경찰" value={police} min={0} max={2} onChange={setPolice} />
          <Stepper label="💉 의사" value={doctor} min={0} max={1} onChange={setDoctor} />
          <div className="flex items-center justify-between rounded-2xl border border-line/70 bg-raised/60 px-4 py-3">
            <p className="text-[14px] font-bold text-sub">🙂 시민</p>
            <p className="num text-[17px] font-extrabold">{Math.max(0, citizens)}명</p>
          </div>
        </div>
        {!valid && (
          <p className="mt-2 text-[11.5px] font-semibold text-rose">
            시민이 최소 1명 있어야 하고, 마피아가 전체의 절반 미만이어야 게임이 성립해요.
          </p>
        )}

        <SectionTitle>낮 토론 시간</SectionTitle>
        <div className="panel px-4 py-3">
          <Stepper label="타이머" hint="1~5분" value={minutes} min={1} max={5} onChange={setMinutes} />
        </div>

        <div className="panel-tight mt-4 px-4 py-3">
          <p className="text-[11.5px] leading-relaxed text-sub">
            💡 밤에는 폰을 한 명씩 돌려 역할을 확인하고, 마피아는 제거할 사람을, 경찰은 조사할 사람을, 의사는
            보호할 사람을 몰래 선택해요. 시민 차례에는 아무 일 없이 넘어갑니다.
          </p>
        </div>

        <div className="sticky bottom-0 mt-6 bg-gradient-to-t from-bg via-bg/95 to-bg/0 pb-3 pt-4">
          <Button
            disabled={!valid}
            onClick={() =>
              onStart({
                players: toPlayers(names),
                mafia,
                police,
                doctor,
                seconds: minutes * 60,
              })
            }
          >
            🎮 게임 시작
          </Button>
        </div>
      </div>
    </div>
  );
}
