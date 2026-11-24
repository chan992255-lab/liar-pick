import { useMemo, useState } from 'react';
import type { LiarConfig, LiarMode, ScoreEntry, VoteMode } from '../../lib/types';
import { CATEGORIES, TOTAL_WORDS } from '../../lib/words';
import { loadScores, recordRound } from '../../lib/storage';
import { cn, tally } from '../../lib/utils';
import { sfx } from '../../lib/sound';
import { Button, SectionTitle, Stepper, TopBar } from '../../components/ui';
import { HoldReveal } from '../../components/HoldReveal';
import { TimerPanel } from '../../components/Timer';
import { PlayerNameEditor, PlayerChipGrid } from '../../components/PlayerSelect';
import { ScoreRows } from '../../components/ScoreBoard';
import { SoundButton } from '../../components/SoundButton';
import { GameHeaderRight } from '../../components/GameHeaderRight';
import {
  MODE_META,
  VOTE_META,
  createRound,
  defaultNames,
  isCorrectGuess,
  resizeNames,
  toPlayers,
  type LiarRound,
} from './engine';

type Phase = 'setup' | 'reveal' | 'discuss' | 'vote' | 'tally' | 'guess' | 'result';

export default function LiarGame({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>('setup');
  const [config, setConfig] = useState<LiarConfig | null>(null);
  const [round, setRound] = useState<LiarRound | null>(null);
  const [roundNo, setRoundNo] = useState(1);
  const [revealIndex, setRevealIndex] = useState(0);
  const [voteIndex, setVoteIndex] = useState(0);
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [choice, setChoice] = useState<string | null>(null);
  const [guessInput, setGuessInput] = useState('');
  const [guessResult, setGuessResult] = useState<'none' | 'correct' | 'wrong'>('none');
  const [scores, setScores] = useState<ScoreEntry[]>(loadScores);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [liarWon, setLiarWon] = useState(false);
  const [caught, setCaught] = useState(false);

  const tallyResult = useMemo(() => tally(votes), [votes]);

  function beginRound(base: LiarConfig, nextRoundNo: number) {
    setConfig(base);
    setRound(createRound(base));
    setRoundNo(nextRoundNo);
    setRevealIndex(0);
    setVoteIndex(0);
    setVotes({});
    setChoice(null);
    setGuessInput('');
    setGuessResult('none');
    setHighlight([]);
    setPhase('reveal');
    sfx.reveal();
  }

  function advanceReveal() {
    if (!config) return;
    if (revealIndex + 1 >= config.players.length) {
      setPhase('discuss');
      sfx.morning();
      return;
    }
    setRevealIndex((index) => index + 1);
  }

  function submitVote(targetId: string, voterId?: string) {
    if (!config) return;
    if (!voterId) {
      // 공개 지목 투표
      setVotes({ open: targetId });
      setChoice(null);
      setPhase('tally');
      sfx.execute();
      return;
    }
    const nextVotes = { ...votes, [voterId]: targetId };
    setVotes(nextVotes);
    setChoice(null);
    if (voteIndex + 1 >= config.players.length) {
      setPhase('tally');
      sfx.execute();
      return;
    }
    setVoteIndex((index) => index + 1);
  }

  function finishRound(liarWins: boolean, wasCaught: boolean, correctGuess: boolean) {
    if (!config || !round) return;
    const liarName = config.players.find((p) => p.id === round.liarId)?.name ?? '라이어';
    const winners = liarWins
      ? [liarName]
      : config.players.filter((p) => p.id !== round.liarId).map((p) => p.name);
    const updated = recordRound(
      'liar',
      config.players.map((p) => p.name),
      winners,
    );
    setScores(updated);
    setHighlight(winners);
    setLiarWon(liarWins);
    setCaught(wasCaught);
    setGuessResult(correctGuess ? 'correct' : wasCaught ? 'wrong' : 'none');
    setPhase('result');
    if (liarWins) sfx.lose();
    else sfx.win();
  }

  /* ------------------------------- 설정 화면 ------------------------------- */
  if (phase === 'setup' || !config || !round) {
    return (
      <LiarSetup
        onExit={onExit}
        onStart={(next) => {
          sfx.tap();
          beginRound(next, 1);
        }}
      />
    );
  }

  const liar = config.players.find((p) => p.id === round.liarId)!;
  const revealPlayer = config.players[revealIndex];
  const voter = config.players[voteIndex];

  /* ------------------------------ 역할 확인 ------------------------------ */
  if (phase === 'reveal') {
    const isLiar = revealPlayer.id === round.liarId;
    const showLiar = isLiar && config.mode === 'normal';
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <TopBar
          title={`역할 확인 ${revealIndex + 1}/${config.players.length}`}
          subtitle={`${round.categoryEmoji} ${round.categoryLabel} · ${config.mode === 'fool' ? '바보 모드' : '일반 모드'}`}
          right={<GameHeaderRight onQuit={onExit} />}
        />
        <div className="app-body flex flex-col justify-center pb-10">
          <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-line/60">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet to-purple transition-all duration-500"
              style={{ width: `${((revealIndex + (isLiar ? 1 : 0.6)) / config.players.length) * 100}%` }}
            />
          </div>
          <HoldReveal
            key={`reveal-${roundNo}-${revealPlayer.id}`}
            name={revealPlayer.name}
            kicker="제시어 확인"
            accent={showLiar ? 'rose' : 'purple'}
            doneLabel={
              revealIndex + 1 >= config.players.length ? '모두 확인했어요 · 토론 시작' : '확인 완료 · 다음 사람에게'
            }
            onDone={advanceReveal}
            sideNote={
              showLiar
                ? '라이어는 제시어를 모릅니다. 다른 사람의 설명을 잘 듣고 버텨 보세요.'
                : '제시어를 기억하고, 바로 다음 사람에게 폰을 넘겨주세요.'
            }
          >
            {showLiar ? (
              <div className="flex flex-col items-center">
                <span className="text-5xl">🕵️‍♂️</span>
                <p className="mt-3 text-[13px] font-bold text-rose">당신은</p>
                <p className="mt-1 text-[44px] font-black leading-none text-rose text-glow">라이어</p>
                <p className="mt-4 max-w-[230px] text-[12px] leading-relaxed text-sub">
                  제시어는 <b className="text-ink">알 수 없어요</b>. 설명을 듣고 정답을 추리거나, 들키지 않게
                  자연스럽게 섞여 보세요.
                </p>
                <span className="mt-4 rounded-full border border-rose/40 bg-rose/10 px-3 py-1 text-[11px] font-bold text-rose">
                  {round.categoryEmoji} 카테고리 · {round.categoryLabel}
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <span className="text-[11px] font-extrabold tracking-[0.18em] text-sub">오늘의 제시어</span>
                <p className="mt-2 break-keep text-[38px] font-black leading-tight text-ink">
                  {isLiar ? round.liarWord : round.word}
                </p>
                <span className="mt-3 rounded-full border border-line bg-bg/50 px-3 py-1 text-[11px] font-bold text-sub">
                  {round.categoryEmoji} {round.categoryLabel}
                </span>
                <p className="mt-4 max-w-[230px] text-[12px] leading-relaxed text-sub">
                  정답을 직접 말하면 안 돼요. 한 문장으로 설명하고 넘겨주세요.
                </p>
              </div>
            )}
          </HoldReveal>
        </div>
      </div>
    );
  }

  /* -------------------------------- 토론 -------------------------------- */
  if (phase === 'discuss') {
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <TopBar
          title="🕵️ 토론 타임"
          subtitle={`${round.categoryEmoji} ${round.categoryLabel} · ${config.players.length}명`}
          right={<GameHeaderRight onQuit={onExit} />}
        />
        <div className="app-body">
          <div className="panel mt-1 px-5 py-5">
            <TimerPanel
              seconds={config.seconds}
              label="설명이 끝났다면 투표로 넘어가세요"
              onFinish={() => sfx.warn()}
            />
          </div>

          <SectionTitle hint="한 명씩 돌아가며 한 문장">설명 순서</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {config.players.map((player, index) => (
              <span key={player.id} className="chip px-3 py-1.5">
                <span className="num text-sub/70">{index + 1}</span> {player.name}
              </span>
            ))}
          </div>

          <div className="panel-tight mt-4 px-4 py-3">
            <p className="text-[11.5px] leading-relaxed text-sub">
              💡 눈치 게임 팁 · 제시어를 그대로 말하면 라이어가 정답을 알아요. 너무 애매하게 말하면 라이어로
              의심받아요.
            </p>
          </div>

          <div className="sticky bottom-0 mt-6 bg-gradient-to-t from-bg via-bg/95 to-bg/0 pb-3 pt-4">
            <Button
              onClick={() => {
                sfx.tap();
                setPhase('vote');
                setVoteIndex(0);
                setChoice(null);
              }}
            >
              {config.voteMode === 'secret' ? '🤫 비밀 투표 시작' : '🗳️ 지목 투표 시작'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------- 투표 -------------------------------- */
  if (phase === 'vote') {
    if (config.voteMode === 'open') {
      return (
        <div className="flex min-h-[100dvh] flex-col">
          <TopBar title="가장 의심되는 사람" subtitle="한 명을 지목해 주세요" right={<GameHeaderRight onQuit={onExit} />} />
          <div className="app-body">
            <div className="panel mt-1 px-4 py-4">
              <PlayerChipGrid
                players={config.players}
                selectedId={choice}
                onSelect={(id) => {
                  sfx.tap();
                  setChoice(id);
                }}
                tone="rose"
              />
            </div>
            <div className="sticky bottom-0 mt-5 bg-gradient-to-t from-bg via-bg/95 to-bg/0 pb-3 pt-4">
              <Button
                variant="danger"
                disabled={!choice}
                onClick={() => choice && submitVote(choice)}
              >
                {choice
                  ? `${config.players.find((p) => p.id === choice)?.name} 님을 라이어로 지목`
                  : '지목할 사람을 선택하세요'}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    const voterIsLast = voteIndex + 1 >= config.players.length;
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <TopBar
          title={`비밀 투표 ${voteIndex + 1}/${config.players.length}`}
          subtitle="한 명씩 몰래 투표해요"
          right={<GameHeaderRight onQuit={onExit} />}
        />
        <div className="app-body flex flex-col justify-center pb-10">
          <HoldReveal
            key={`vote-${roundNo}-${voter.id}`}
            name={voter.name}
            kicker="비밀 투표"
            accent="rose"
            doneLabel={voterIsLast ? '투표 마감 · 결과 보기' : '투표 완료 · 다음 사람에게'}
            onDone={() => choice && submitVote(choice, voter.id)}
            sideNote="본인은 지목할 수 없어요. 아무도 보지 않을 때 선택해 주세요."
          >
            <p className="text-[13px] font-bold text-sub">가장 의심되는 사람은?</p>
            <div className="mt-3 w-full">
              <PlayerChipGrid
                players={config.players}
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

  /* ------------------------------ 투표 결과 ------------------------------ */
  if (phase === 'tally') {
    const tie = tallyResult.top.length !== 1;
    const caughtLiar = !tie && tallyResult.top[0] === round.liarId;
    const ranked = Object.entries(tallyResult.counts).sort((a, b) => b[1] - a[1]);
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <TopBar title="투표 결과" subtitle={`총 ${tallyResult.total}표`} right={<GameHeaderRight onQuit={onExit} />} />
        <div className="app-body">
          <div className="panel mt-1 space-y-2 px-4 py-4">
            {ranked.map(([id, count]) => {
              const name = config.players.find((p) => p.id === id)?.name ?? '?';
              const percent = Math.round((count / Math.max(1, tallyResult.total)) * 100);
              return (
                <div key={id} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 truncate text-[13px] font-bold">{name}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-line/60">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-rose to-purple"
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
              tie
                ? 'border-amber/40 bg-amber/10'
                : caughtLiar
                  ? 'border-mint/40 bg-mint/10'
                  : 'border-rose/40 bg-rose/10',
            )}
          >
            <p className="text-[40px]">{tie ? '⚖️' : caughtLiar ? '🎯' : '😈'}</p>
            <p className="mt-2 text-[19px] font-extrabold">
              {tie ? '동률이에요!' : caughtLiar ? '라이어를 잡았습니다!' : '라이어를 놓쳤습니다'}
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-sub">
              {tie
                ? '표가 갈려 아무도 지목되지 않았어요. 이번 판은 라이어의 승리로 넘어갑니다.'
                : caughtLiar
                  ? '하지만 라이어에게 마지막 반전 기회가 남아 있어요.'
                  : '시민들은 엉뚱한 사람을 지목했어요. 라이어의 승리!'}
            </p>
          </div>

          <div className="mt-5 space-y-2 pb-4">
            {caughtLiar ? (
              <Button variant="danger" onClick={() => setPhase('guess')}>
                🎲 라이어의 마지막 기회
              </Button>
            ) : (
              <Button
                variant={tie ? 'ghost' : 'danger'}
                onClick={() => finishRound(true, false, false)}
              >
                결과 보기
              </Button>
            )}
            {tie && (
              <Button
                variant="ghost"
                onClick={() => {
                  setVotes({});
                  setVoteIndex(0);
                  setChoice(null);
                  setPhase('vote');
                }}
              >
                다시 투표하기
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ---------------------------- 라이어 역전 기회 ---------------------------- */
  if (phase === 'guess') {
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <TopBar title="😈 라이어의 마지막 기회" subtitle="정답을 맞히면 라이어 승리!" right={<GameHeaderRight onQuit={onExit} />} />
        <div className="app-body">
          <div className="panel mt-1 px-5 py-6 text-center">
            <p className="text-[13px] font-bold text-rose">{liar.name} 님, 제시어를 맞혀 보세요</p>
            <p className="mt-1 text-[12px] text-sub">
              카테고리는 <b className="text-ink">{round.categoryEmoji} {round.categoryLabel}</b> 이에요.
            </p>
            <input
              autoFocus
              value={guessInput}
              onChange={(event) => setGuessInput(event.target.value)}
              placeholder="제시어를 입력하세요"
              maxLength={20}
              className="mt-5 w-full rounded-2xl border border-line bg-bg/60 px-4 py-4 text-center text-[18px] font-bold placeholder:text-sub/50"
            />
            <div className="mt-4 space-y-2">
              <Button
                variant="danger"
                disabled={!guessInput.trim()}
                onClick={() => {
                  const correct = isCorrectGuess(guessInput, round.word);
                  if (correct) sfx.win();
                  else sfx.lose();
                  finishRound(correct, true, correct);
                }}
              >
                정답 제출
              </Button>
              <Button variant="ghost" onClick={() => finishRound(false, true, false)}>
                포기하고 결과 보기
              </Button>
            </div>
          </div>
          <p className="mt-4 text-center text-[11px] leading-relaxed text-sub/80">
            띄어쓰기는 상관없어요. 맞히면 라이어가 극적으로 역전합니다.
          </p>
        </div>
      </div>
    );
  }

  /* -------------------------------- 결과 -------------------------------- */
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <TopBar title={`${roundNo}라운드 결과`} subtitle={`${round.categoryEmoji} ${round.categoryLabel}`} right={<GameHeaderRight onQuit={onExit} />} />
      <div className="app-body">
        <div
          className={cn(
            'relative overflow-hidden rounded-4xl border px-5 py-7 text-center',
            liarWon ? 'border-rose/40 bg-gradient-to-b from-rose/20 to-surf' : 'border-mint/40 bg-gradient-to-b from-mint/20 to-surf',
          )}
        >
          <p className="text-[52px] leading-none">{liarWon ? '😈' : '🎉'}</p>
          <p className="mt-2 text-[26px] font-black">{liarWon ? '라이어 승리!' : '시민 승리!'}</p>
          <p className="mt-1 text-[12.5px] text-sub">
            라이어는 <b className="text-ink">{liar.name}</b>
            {caught && guessResult === 'correct' && ' · 제시어를 맞혀 역전!'}
            {caught && guessResult === 'wrong' && ' · 지목당했지만 제시어는 못 맞혔어요'}
            {!caught && ' · 끝까지 잡히지 않았어요'}
          </p>
          <div className="mt-4 rounded-2xl border border-line/70 bg-bg/50 px-4 py-3">
            <p className="text-[10px] font-extrabold tracking-[0.18em] text-sub">제시어</p>
            <p className="mt-1 text-[24px] font-black">{round.word}</p>
            <p className="mt-1 text-[11px] text-sub">
              {config.mode === 'fool'
                ? `라이어가 받은 단어 · ${round.liarWord}`
                : '라이어는 제시어를 받지 않았어요'}
            </p>
          </div>
        </div>

        <SectionTitle hint="이 기기에서 누적">누적 점수판</SectionTitle>
        <ScoreRows scores={scores} highlight={highlight} limit={8} />

        <div className="mt-5 space-y-2 pb-4">
          <Button
            onClick={() => {
              if (config) beginRound(config, roundNo + 1);
            }}
          >
            🔁 한 판 더 (같은 멤버)
          </Button>
          <Button variant="ghost" onClick={onExit}>
            홈으로
          </Button>
        </div>
        <p className="pb-2 text-center text-[10.5px] text-sub/70">
          카테고리를 바꾸려면 홈에서 새 게임을 시작하세요.
        </p>
      </div>
    </div>
  );
}

/* ================================ 설정 ================================ */

function LiarSetup({
  onStart,
  onExit,
}: {
  onStart: (config: LiarConfig) => void;
  onExit: () => void;
}) {
  const [count, setCount] = useState(5);
  const [names, setNames] = useState<string[]>(defaultNames(5));
  const [categoryId, setCategoryId] = useState(CATEGORIES[0].id);
  const [mode, setMode] = useState<LiarMode>('normal');
  const [voteMode, setVoteMode] = useState<VoteMode>('secret');
  const [minutes, setMinutes] = useState(3);

  const start = () => {
    onStart({
      players: toPlayers(names),
      categoryId,
      mode,
      voteMode,
      seconds: minutes * 60,
    });
  };

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <TopBar
        title="🕵️ 라이어 게임"
        subtitle={`${count}명 · ${MODE_META[mode].label}`}
        onBack={onExit}
        right={<SoundButton />}
      />
      <div className="app-body">
        <div className="flex flex-wrap gap-2">
          <span className="chip">🎲 제시어 {TOTAL_WORDS}개</span>
          <span className="chip">🗂️ 카테고리 {CATEGORIES.length}개</span>
          <span className="chip">📱 폰 하나면 OK</span>
        </div>

        <SectionTitle hint="3 ~ 12명">인원</SectionTitle>
        <div className="panel px-4 py-3">
          <Stepper
            label="참가자"
            value={count}
            min={3}
            max={12}
            onChange={(next) => {
              setCount(next);
              setNames(resizeNames(names, next));
            }}
          />
        </div>

        <SectionTitle hint="비우면 자동 이름">참가자 이름</SectionTitle>
        <div className="max-h-[232px] overflow-y-auto rounded-2xl">
          <PlayerNameEditor names={names} onChange={setNames} />
        </div>

        <SectionTitle>게임 모드</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(MODE_META) as LiarMode[]).map((key) => {
            const meta = MODE_META[key];
            const active = mode === key;
            return (
              <button
                key={key}
                onClick={() => {
                  sfx.tap();
                  setMode(key);
                }}
                className={cn(
                  'press rounded-2xl border px-3 py-3 text-left',
                  active ? 'border-purple bg-purple/15 shadow-glow' : 'border-line/70 bg-raised/50',
                )}
              >
                <span className="text-[20px]">{meta.emoji}</span>
                <p className="mt-1 text-[14px] font-extrabold">{meta.label}</p>
                <p className="mt-0.5 text-[10.5px] leading-snug text-sub">{meta.blurb}</p>
              </button>
            );
          })}
        </div>

        <SectionTitle hint={`${CATEGORIES.length}개 · 각 18단어`}>카테고리</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          {CATEGORIES.map((category) => {
            const active = category.id === categoryId;
            return (
              <button
                key={category.id}
                onClick={() => {
                  sfx.tap();
                  setCategoryId(category.id);
                }}
                className={cn(
                  'press flex flex-col items-center justify-center gap-1 rounded-2xl border py-2.5',
                  active ? 'border-purple bg-purple/15' : 'border-line/70 bg-raised/40',
                )}
              >
                <span className="text-[18px]">{category.emoji}</span>
                <span className={cn('text-[11px] font-bold', active ? 'text-ink' : 'text-sub')}>
                  {category.label}
                </span>
              </button>
            );
          })}
        </div>

        <SectionTitle>토론 시간</SectionTitle>
        <div className="panel px-4 py-3">
          <Stepper
            label="타이머"
            hint="1~5분, 게임 중 +30초 가능"
            value={minutes}
            min={1}
            max={5}
            onChange={setMinutes}
          />
        </div>

        <SectionTitle>투표 방식</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(VOTE_META) as VoteMode[]).map((key) => {
            const meta = VOTE_META[key];
            const active = voteMode === key;
            return (
              <button
                key={key}
                onClick={() => {
                  sfx.tap();
                  setVoteMode(key);
                }}
                className={cn(
                  'press rounded-2xl border px-3 py-3 text-left',
                  active ? 'border-purple bg-purple/15' : 'border-line/70 bg-raised/50',
                )}
              >
                <span className="text-[20px]">{meta.emoji}</span>
                <p className="mt-1 text-[14px] font-extrabold">{meta.label}</p>
                <p className="mt-0.5 text-[10.5px] leading-snug text-sub">{meta.blurb}</p>
              </button>
            );
          })}
        </div>

        <div className="sticky bottom-0 mt-6 bg-gradient-to-t from-bg via-bg/95 to-bg/0 pb-3 pt-4">
          <Button onClick={start}>🎮 게임 시작</Button>
        </div>
      </div>
    </div>
  );
}
