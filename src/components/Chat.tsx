import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, SkipForward } from 'lucide-react';
import type { ChatMessage } from '../../shared/types';

/**
 * The interview surface.
 *
 * One question at a time, with tappable answers when the question allows them.
 * The transcript is a live region so a screen-reader user hears each new reply
 * without having to go looking for it.
 */
export function Chat({
  messages,
  thinking,
  disabled,
  onSend,
}: {
  messages: ChatMessage[];
  thinking: boolean;
  disabled: boolean;
  onSend: (text: string) => void;
}) {
  const bottom = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, thinking]);

  const last = messages[messages.length - 1];
  const quickReplies = !thinking && last?.role === 'assistant' ? (last.quickReplies ?? []) : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scroller}
        className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8"
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-5">
          <div aria-live="polite" aria-atomic="false" className="contents">
            {messages.map((message, index) => (
              <Bubble key={index} message={message} />
            ))}
          </div>
          {thinking && <Thinking />}
          <div ref={bottom} />
        </div>
      </div>

      <Composer
        quickReplies={quickReplies}
        disabled={disabled || thinking}
        onSend={onSend}
      />
    </div>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="animate-rise flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-accent-ink">
          {message.content}
        </p>
      </div>
    );
  }

  return (
    <div className="animate-rise flex gap-3">
      <span
        aria-hidden
        className="mt-1 grid size-7 shrink-0 place-items-center rounded-full border border-line bg-surface font-display text-[11px] font-semibold text-accent"
      >
        P
      </span>
      <div className="min-w-0 flex-1 pt-0.5 text-[15px] leading-relaxed whitespace-pre-wrap text-ink">
        {message.content}
      </div>
    </div>
  );
}

function Thinking() {
  return (
    <div className="flex gap-3" aria-label="Thinking" role="status">
      <span aria-hidden className="mt-1 size-7 shrink-0 rounded-full border border-line bg-surface" />
      <span className="mt-2 flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 rounded-full bg-accent"
            style={{ animation: 'pulse-dot 1.1s ease-in-out infinite', animationDelay: `${i * 0.16}s` }}
          />
        ))}
      </span>
    </div>
  );
}

function Composer({
  quickReplies,
  disabled,
  onSend,
}: {
  quickReplies: string[];
  disabled: boolean;
  onSend: (text: string) => void;
}) {
  const [value, setValue] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);

  // Grow with the content instead of scrolling a two-line box.
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [value]);

  useEffect(() => {
    if (!disabled) field.current?.focus();
  }, [disabled]);

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  };

  return (
    <div className="shrink-0 border-t border-line bg-canvas px-4 pt-3 pb-4 sm:px-8">
      <div className="mx-auto max-w-2xl">
        {quickReplies.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {quickReplies.map((reply) => (
              <button
                key={reply}
                type="button"
                onClick={() => submit(reply)}
                disabled={disabled}
                className="rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-[13px] font-medium text-ink transition-colors hover:border-accent hover:bg-accent-wash disabled:opacity-50"
              >
                {reply}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit(value);
          }}
          className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 focus-within:border-accent"
        >
          <label htmlFor="answer" className="sr-only">
            Your answer
          </label>
          <textarea
            id="answer"
            ref={field}
            rows={1}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit(value);
              }
            }}
            disabled={disabled}
            placeholder="Type your answer…"
            className="max-h-44 min-h-9 flex-1 resize-none bg-transparent px-2.5 py-1.5 text-[15px] leading-relaxed text-ink placeholder:text-faint focus:outline-none disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => submit("I'd rather skip this one")}
            disabled={disabled}
            title="Skip this question"
            className="grid size-9 shrink-0 place-items-center rounded-xl text-faint transition-colors hover:bg-sunken hover:text-ink disabled:opacity-40"
          >
            <SkipForward className="size-4" aria-hidden />
            <span className="sr-only">Skip this question</span>
          </button>
          <button
            type="submit"
            disabled={disabled || !value.trim()}
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-40"
          >
            <ArrowUp className="size-4" aria-hidden />
            <span className="sr-only">Send</span>
          </button>
        </form>

        <p className="mt-2 text-center text-[11px] text-faint">
          Enter to send &middot; Shift + Enter for a new line
        </p>
      </div>
    </div>
  );
}
