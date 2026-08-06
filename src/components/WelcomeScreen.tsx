import { ArrowRight, MessageSquareText, PenLine, ShieldCheck, Sparkles } from 'lucide-react';

/**
 * The first screen. Three jobs, in order: say what this is, say what it costs
 * you in time, and get out of the way.
 */
export function WelcomeScreen({ onStart, resuming }: { onStart: () => void; resuming: boolean }) {
  return (
    <div className="flex min-h-full items-center justify-center px-6 py-14 sm:py-20">
      <div className="w-full max-w-2xl animate-rise">
        <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium tracking-wide text-muted">
          <Sparkles className="size-3.5 text-accent" aria-hidden />
          Built from your work, not from a template
        </p>

        <h1 className="font-display text-4xl leading-[1.1] font-semibold tracking-tight text-ink balance sm:text-5xl">
          Turn what you&rsquo;ve done into a portfolio worth sending.
        </h1>

        <p className="measure mt-5 text-lg leading-relaxed text-muted">
          Answer a handful of questions about your work — one at a time, nothing technical. You get
          back a finished portfolio: pages you can publish, a version to print, and the text to
          reuse anywhere.
        </p>

        <div className="mt-9 grid gap-3 sm:grid-cols-3">
          <Step
            icon={<MessageSquareText className="size-4" aria-hidden />}
            title="You talk"
            body="Short questions about what you did and what happened. Skip anything you want."
          />
          <Step
            icon={<PenLine className="size-4" aria-hidden />}
            title="We write and design"
            body="Your work becomes case studies, in a look derived from your field — not picked from a catalogue."
          />
          <Step
            icon={<ShieldCheck className="size-4" aria-hidden />}
            title="We check it"
            body="Readable for everyone, no numbers you can't back up, nothing confidential left in."
          />
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3">
          <button
            type="button"
            onClick={onStart}
            className="group inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-[15px] font-medium text-accent-ink transition-colors hover:bg-accent-hover"
          >
            {resuming ? 'Pick up where you left off' : 'Start'}
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </button>
          <p className="text-sm text-faint">About 15&ndash;30 minutes. Nothing to install.</p>
        </div>

        <p className="measure mt-12 border-t border-line pt-5 text-[13px] leading-relaxed text-faint">
          Every number that ends up in your portfolio carries the source you gave it. Anything you
          can&rsquo;t back up gets described in words instead of figures &mdash; an unverifiable
          claim is a liability in an interview, not an advantage.
        </p>
      </div>
    </div>
  );
}

function Step({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      {/* Fixed header height keeps the three bodies on the same baseline when a title wraps. */}
      <div className="mb-2 flex min-h-9 items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent-wash text-accent">
          {icon}
        </span>
        <h2 className="text-sm leading-tight font-semibold text-ink">{title}</h2>
      </div>
      <p className="text-[13px] leading-relaxed text-muted">{body}</p>
    </div>
  );
}
