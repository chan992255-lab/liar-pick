import { useState } from 'react';
import { loadScores } from '../lib/storage';
import { CATEGORIES, TOTAL_WORDS } from '../lib/words';
import { sfx } from '../lib/sound';
import { ScoreRows } from '../components/ScoreBoard';
import { SoundButton } from '../components/SoundButton';
import { useOnlineAuth } from '../lib/onlineAuth';
import { cn } from '../lib/utils';

export default function Home({
  onLiar,
  onMafia,
  onOnline,
  onScores,
}: {
  onLiar: () => void;
  onMafia: () => void;
  onOnline: () => void;
  onScores: () => void;
}) {
  const [scores] = useState(() => loadScores());
  const { profile } = useOnlineAuth();

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <div
        className="px-5 pb-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet to-purple text-[19px] shadow-glow">
              🕵️
            </span>
            <div>
              <p className="text-[17px] font-black leading-none tracking-tight">라이어픽</p>
              <p className="mt-1 text-[10px] font-bold tracking-[0.22em] text-sub">LIARPICK</p>
            </div>
          </div>
          <SoundButton />
        </div>
      </div>

      <div className="app-body pb-10">
        <div className="relative mt-3 overflow-hidden rounded-4xl border border-line/70 bg-gradient-to-b from-surf to-bg px-5 pb-6 pt-7">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-purple/25 blur-3xl" />
          <p className="text-[11px] font-extrabold tracking-[0.2em] text-purple">PARTY GAME · PASS THE PHONE</p>
          <h1 className="mt-2 text-[30px] font-black leading-[1.15]">
            폰 하나로,
            <br />
            <span className="bg-gradient-to-r from-purple via-violet to-rose bg-clip-text text-transparent">
              지금 바로 시작
            </span>
          </h1>
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-sub">
            카드 뽑기 없이, 앱 설치 없이. 친구들 폰을 돌려 가며 역할을 확인하고 바로 즐겨요.
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            <span className="chip">🎲 제시어 {TOTAL_WORDS}개</span>
            <span className="chip">🗂️ {CATEGORIES.length}개 카테고리</span>
            <span className="chip">🏆 누적 점수판</span>
          </div>
        </div>

        <button
          onClick={() => {
            sfx.tap();
            onOnline();
          }}
          className="press relative mt-4 w-full overflow-hidden rounded-4xl border border-purple/40 bg-gradient-to-br from-[#1B1240] via-[#241554] to-[#120A28] px-5 py-5 text-left shadow-glow"
        >
          <div className="pointer-events-none absolute -bottom-8 -right-4 text-[110px] leading-none opacity-15">🌐</div>
          <div className="relative">
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-extrabold tracking-wide text-white/90">
              NEW · 실시간 온라인
            </span>
            <div className="mt-2.5 flex items-center gap-2">
              <span className="text-[22px]">🌐</span>
              <p className="text-[21px] font-black">온라인 매칭</p>
            </div>
            <p className="mt-1 max-w-[250px] text-[12px] leading-relaxed text-white/75">
              로그인하고 모르는 사람과 바로 플레이. 방 코드로 친구와도 들어올 수 있어요.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-[11.5px] font-extrabold">
                시작하기 →
              </span>
              {profile && (
                <span className="truncate rounded-full bg-black/30 px-2.5 py-1 text-[10.5px] font-bold text-white/80">
                  {profile.nickname} · {profile.games}판 {profile.wins}승
                </span>
              )}
            </div>
          </div>
        </button>

        <div className="mb-2 mt-6 flex items-end justify-between">
          <h3 className="text-[13px] font-extrabold tracking-wide text-sub">📱 폰 하나로 같이하기</h3>
          <span className="text-[10.5px] text-sub/70">로그인 없이 바로</span>
        </div>

        <div className="space-y-3">
          <ModeCard
            emoji="🕵️"
            title="라이어 게임"
            subtitle="3~12명 · 같은 제시어 사이 숨은 한 명을 찾아라"
            tag="추리 · 순발력"
            gradient="from-violet/90 via-[#5B3BD6] to-[#2A1A5E]"
            onClick={() => {
              sfx.tap();
              onLiar();
            }}
          />
          <ModeCard
            emoji="🔫"
            title="마피아 게임"
            subtitle="4~12명 · 밤과 낮을 오가며 마피아를 잡아라"
            tag="토론 · 심리전"
            gradient="from-rose/90 via-[#B32A4B] to-[#3A1220]"
            onClick={() => {
              sfx.tap();
              onMafia();
            }}
          />
        </div>

        <div className="mb-2 mt-6 flex items-end justify-between">
          <h3 className="text-[13px] font-extrabold tracking-wide text-sub">누적 점수판</h3>
          <button
            onClick={() => {
              sfx.tap();
              onScores();
            }}
            className="text-[11.5px] font-bold text-purple"
          >
            전체 보기 →
          </button>
        </div>
        <ScoreRows scores={scores} limit={3} />

        <h3 className="mb-2 mt-6 text-[13px] font-extrabold tracking-wide text-sub">이렇게 즐겨요</h3>
        <div className="space-y-2">
          {[
            { step: '1', title: '인원과 모드 선택', body: '이름을 넣고 카테고리·타이머를 고르면 끝.' },
            { step: '2', title: '폰을 돌려 역할 확인', body: '가림 화면에서 한 명씩만 몰래 확인해요.' },
            { step: '3', title: '토론 · 투표 · 결과', body: '타이머가 끝나면 지목하고, 승패와 점수가 기록돼요.' },
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-3 rounded-2xl border border-line/60 bg-surf/60 px-4 py-3">
              <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple/20 text-[11px] font-extrabold text-purple">
                {item.step}
              </span>
              <div>
                <p className="text-[13.5px] font-bold">{item.title}</p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-sub">{item.body}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-6 text-center text-[10.5px] leading-relaxed text-sub/60">
          LiarPick · 폰 한 대로 즐기는 파티 게임
          <br />
          점수는 이 기기에만 저장돼요.
        </p>
      </div>
    </div>
  );
}

function ModeCard({
  emoji,
  title,
  subtitle,
  tag,
  gradient,
  onClick,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  tag: string;
  gradient: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'press relative w-full overflow-hidden rounded-4xl border border-white/10 bg-gradient-to-br px-5 py-5 text-left shadow-card',
        gradient,
      )}
    >
      <div className="pointer-events-none absolute -bottom-8 -right-6 text-[120px] leading-none opacity-15">
        {emoji}
      </div>
      <div className="relative">
        <span className="rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-extrabold tracking-wide text-white/90">
          {tag}
        </span>
        <div className="mt-2.5 flex items-center gap-2">
          <span className="text-[22px]">{emoji}</span>
          <p className="text-[21px] font-black">{title}</p>
        </div>
        <p className="mt-1 max-w-[240px] text-[12px] leading-relaxed text-white/75">{subtitle}</p>
        <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-[11.5px] font-extrabold">
          시작하기 →
        </span>
      </div>
    </button>
  );
}
