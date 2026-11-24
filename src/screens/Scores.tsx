import { useState } from 'react';
import { loadScores, resetScores } from '../lib/storage';
import type { ScoreEntry } from '../lib/types';
import { sfx } from '../lib/sound';
import { ScoreRows } from '../components/ScoreBoard';
import { Button, Modal, TopBar } from '../components/ui';
import { SoundButton } from '../components/SoundButton';

export default function Scores({ onBack }: { onBack: () => void }) {
  const [scores, setScores] = useState<ScoreEntry[]>(() => loadScores());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const totalGames = scores.reduce((sum, entry) => sum + entry.games, 0);
  const top = scores[0];

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <TopBar title="🏆 누적 점수판" subtitle="이 기기에 저장된 기록" onBack={onBack} right={<SoundButton />} />
      <div className="app-body">
        <div className="mt-1 grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-line/70 bg-surf px-4 py-4">
            <p className="text-[11px] font-bold text-sub">플레이한 판</p>
            <p className="num mt-1 text-[24px] font-black">{totalGames}판</p>
          </div>
          <div className="rounded-2xl border border-line/70 bg-surf px-4 py-4">
            <p className="text-[11px] font-bold text-sub">최다 승리</p>
            <p className="mt-1 truncate text-[18px] font-black">{top ? top.name : '—'}</p>
            <p className="text-[10.5px] text-sub">{top ? `${top.wins}승` : '기록 없음'}</p>
          </div>
        </div>

        <h3 className="mb-2 mt-5 text-[13px] font-extrabold tracking-wide text-sub">전체 순위</h3>
        <ScoreRows scores={scores} />

        <div className="mt-6 pb-4">
          <Button variant="ghost" onClick={() => setConfirmOpen(true)} className="text-rose">
            기록 초기화
          </Button>
        </div>
        <p className="pb-4 text-center text-[10.5px] leading-relaxed text-sub/70">
          참가자 이름별로 승리·참가 판 수가 쌓여요.
          <br />
          브라우저 저장 공간(localStorage)에만 보관됩니다.
        </p>
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="기록을 지울까요?">
        <p className="text-[12.5px] leading-relaxed text-sub">
          이 기기의 모든 누적 점수가 사라져요. 되돌릴 수 없습니다.
        </p>
        <div className="mt-4 space-y-2">
          <Button
            variant="danger"
            onClick={() => {
              sfx.tap();
              setScores(resetScores());
              setConfirmOpen(false);
            }}
          >
            모두 지우기
          </Button>
          <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
            취소
          </Button>
        </div>
      </Modal>
    </div>
  );
}
