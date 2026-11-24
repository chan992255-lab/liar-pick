import { sfx } from '../lib/sound';
import { SoundButton } from './SoundButton';

/** 게임 중 상단 우측: 효과음 토글 + 게임 그만하기 */
export function GameHeaderRight({ onQuit }: { onQuit: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <SoundButton />
      <button
        aria-label="게임 그만하기"
        onClick={() => {
          sfx.tap();
          const leave = window.confirm('게임을 그만하고 홈으로 돌아갈까요?\n진행 중인 판은 사라져요.');
          if (leave) {
            sfx.pass();
            onQuit();
          }
        }}
        className="press flex h-10 w-10 items-center justify-center rounded-full border border-line/80 bg-surf text-[15px] text-sub"
      >
        ✕
      </button>
    </div>
  );
}
