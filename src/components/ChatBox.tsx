import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';
import { sfx } from '../lib/sound';
import type { ChatMessage } from '../lib/onlineTypes';

export function ChatBox({
  messages,
  onSend,
  placeholder = '메시지를 입력하세요',
  className,
  disabled = false,
  height = 'h-[200px]',
}: {
  messages: ChatMessage[];
  onSend: (body: string) => Promise<void> | void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  height?: string;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length]);

  async function submit() {
    const body = text.trim();
    if (!body || sending || disabled) return;
    setSending(true);
    setText('');
    try {
      await onSend(body);
      sfx.tap();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={cn('flex flex-col overflow-hidden rounded-3xl border border-line/70 bg-surf/70', className)}>
      <div ref={listRef} className={cn('space-y-1.5 overflow-y-auto px-3.5 py-3', height)}>
        {messages.length === 0 && (
          <p className="py-8 text-center text-[11.5px] leading-relaxed text-sub/70">
            아직 대화가 없어요.
            <br />
            먼저 인사를 건네 보세요 👋
          </p>
        )}
        {messages.map((message) =>
          message.kind === 'system' ? (
            <p key={message.id} className="py-0.5 text-center text-[10.5px] leading-relaxed text-sub/70">
              {message.body}
            </p>
          ) : (
            <div key={message.id} className="text-[12.5px] leading-snug">
              <span className="font-extrabold text-purple">{message.nickname}</span>
              <span className="ml-1.5 break-words align-top text-ink/90">{message.body}</span>
            </div>
          ),
        )}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="flex items-center gap-2 border-t border-line/60 px-2.5 py-2"
      >
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={disabled ? '지금은 채팅을 보낼 수 없어요' : placeholder}
          maxLength={200}
          disabled={disabled}
          className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-bg/60 px-3 text-[13px] placeholder:text-sub/50 focus:border-purple/60 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || !text.trim() || sending}
          className="press h-9 shrink-0 rounded-xl bg-gradient-to-br from-violet to-purple px-3.5 text-[12.5px] font-extrabold text-white disabled:opacity-30"
        >
          전송
        </button>
      </form>
    </div>
  );
}
