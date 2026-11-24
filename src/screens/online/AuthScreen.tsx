import { useState } from 'react';
import { Button, TopBar } from '../../components/ui';
import { useOnlineAuth } from '../../lib/onlineAuth';
import { sfx } from '../../lib/sound';
import { cn } from '../../lib/utils';

export default function AuthScreen({ onExit }: { onExit: () => void }) {
  const { signIn, signUp } = useOnlineAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setError('');
    if (!email.trim()) return setError('이메일을 입력해 주세요.');
    if (password.length < 6) return setError('비밀번호는 6자 이상으로 입력해 주세요.');
    if (mode === 'signup' && !nickname.trim()) return setError('닉네임을 입력해 주세요.');

    setBusy(true);
    const result =
      mode === 'signin' ? await signIn(email, password) : await signUp(email, password, nickname);
    setBusy(false);
    if (!result.ok) setError(result.error ?? '문제가 생겼어요.');
    else sfx.reveal();
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <TopBar title="🌐 온라인 매칭" subtitle="로그인하고 모르는 사람과 함께" onBack={onExit} />
      <div className="app-body">
        <div className="panel mt-1 px-5 py-6">
          <div className="flex rounded-2xl border border-line/70 bg-bg/50 p-1">
            {(['signin', 'signup'] as const).map((key) => (
              <button
                key={key}
                onClick={() => {
                  sfx.tap();
                  setMode(key);
                  setError('');
                }}
                className={cn(
                  'h-10 flex-1 rounded-xl text-[13px] font-extrabold transition',
                  mode === key ? 'bg-gradient-to-br from-violet to-purple text-white shadow-glow' : 'text-sub',
                )}
              >
                {key === 'signin' ? '로그인' : '회원가입'}
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-3">
            <label className="block">
              <span className="text-[11.5px] font-bold text-sub">이메일</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="mt-1.5 w-full rounded-2xl border border-line bg-bg/60 px-4 py-3.5 text-[14px] placeholder:text-sub/40 focus:border-purple/60 focus:outline-none"
              />
            </label>

            {mode === 'signup' && (
              <label className="block">
                <span className="text-[11.5px] font-bold text-sub">닉네임 (최대 12자)</span>
                <input
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  placeholder="게임에서 보일 이름"
                  maxLength={12}
                  className="mt-1.5 w-full rounded-2xl border border-line bg-bg/60 px-4 py-3.5 text-[14px] placeholder:text-sub/40 focus:border-purple/60 focus:outline-none"
                />
              </label>
            )}

            <label className="block">
              <span className="text-[11.5px] font-bold text-sub">비밀번호 (6자 이상)</span>
              <input
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••"
                className="mt-1.5 w-full rounded-2xl border border-line bg-bg/60 px-4 py-3.5 text-[14px] placeholder:text-sub/40 focus:border-purple/60 focus:outline-none"
              />
            </label>
          </div>

          {error && (
            <p className="mt-3 rounded-xl border border-rose/40 bg-rose/10 px-3.5 py-2.5 text-[12px] leading-relaxed text-rose">
              {error}
            </p>
          )}

          <div className="mt-4">
            <Button onClick={() => void submit()} disabled={busy}>
              {busy ? '처리 중…' : mode === 'signin' ? '로그인' : '가입하고 시작'}
            </Button>
          </div>

          <p className="mt-4 text-center text-[11px] leading-relaxed text-sub/70">
            {mode === 'signin' ? '처음이신가요? 위에서 ' : '이미 계정이 있나요? 위에서 '}
            <b className="text-sub">{mode === 'signin' ? '회원가입' : '로그인'}</b>
            {mode === 'signin' ? '을 골라 주세요.' : '을 골라 주세요.'}
            <br />
            가입 즉시 바로 플레이할 수 있어요.
          </p>
        </div>

        <div className="panel-tight mt-4 px-4 py-3">
          <p className="text-[11.5px] leading-relaxed text-sub">
            📱 오프라인(폰 하나로 같이하기)은 로그인 없이 그대로 쓸 수 있어요. 온라인은 닉네임·전적을 저장하려고
            계정을 만들어요.
          </p>
        </div>
      </div>
    </div>
  );
}
