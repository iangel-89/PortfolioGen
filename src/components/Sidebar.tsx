import { Check, Loader2, RotateCcw } from 'lucide-react';
import type { InterviewProgress, PhaseDescriptor } from '../../shared/types';
import type { BuildProgress, View } from '../hooks/useSession';

/**
 * The progress rail.
 *
 * Shows the interview as step one and the seven build phases after it, in plain
 * language. The internal machinery — agents, gates, retries — never surfaces
 * here; a phase that gets sent back simply becomes active again.
 */
/**
 * Shown before the first answer comes back, so the checklist is visible from the
 * start rather than appearing out of nowhere on turn two.
 */
const INITIAL_PROGRESS: InterviewProgress = {
  questionsAsked: 0,
  maxQuestions: 18,
  block: 'identity',
  blockLabel: 'Getting to know you',
  readyToBuild: false,
  collected: [
    { label: 'What you do', done: false },
    { label: "What it's for", done: false },
    { label: 'Who it needs to convince', done: false },
    { label: 'Your work', done: false },
    { label: 'What sets you apart', done: false },
    { label: 'Format and look', done: false },
  ],
};

export function Sidebar({
  view,
  phases,
  progress,
  build,
  onRestart,
}: {
  view: View;
  phases: PhaseDescriptor[];
  progress: InterviewProgress | null;
  build: BuildProgress;
  onRestart: () => void;
}) {
  const interviewDone = view === 'building' || view === 'result';
  const interview = progress ?? INITIAL_PROGRESS;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-6 pt-6 pb-7">
        <span
          aria-hidden
          className="grid size-8 place-items-center rounded-lg bg-accent font-display text-sm font-semibold text-accent-ink"
        >
          P
        </span>
        <span className="font-display text-[17px] font-semibold tracking-tight text-ink">
          PortfolioGen
        </span>
      </div>

      <nav aria-label="Progress" className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        <h2 className="mb-4 text-[11px] font-semibold tracking-widest text-faint uppercase">
          Where we are
        </h2>

        <ol className="space-y-1">
          <Row
            index={0}
            label="Your story"
            status={interviewDone ? 'done' : 'active'}
            detail={view === 'interview' ? interview.blockLabel : undefined}
            isLast={false}
          >
            {view === 'interview' && <Checklist progress={interview} />}
          </Row>

          {phases.map((phase, index) => {
            const status =
              view === 'result'
                ? 'done'
                : (build.status[phase.id] ?? (interviewDone ? 'pending' : 'pending'));
            return (
              <Row
                key={phase.id}
                index={index + 1}
                label={phase.label}
                status={status}
                detail={status === 'active' ? build.detail || phase.blurb : undefined}
                isLast={index === phases.length - 1}
              />
            );
          })}
        </ol>
      </nav>

      <div className="border-t border-line px-6 py-4">
        <button
          type="button"
          onClick={onRestart}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium text-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Start over
        </button>
      </div>
    </div>
  );
}

function Row({
  index,
  label,
  status,
  detail,
  isLast,
  children,
}: {
  index: number;
  label: string;
  status: 'pending' | 'active' | 'done';
  detail?: string;
  isLast: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li className="relative pb-1">
      {!isLast && (
        <span
          aria-hidden
          className={`absolute top-7 bottom-0 left-[11px] w-px ${status === 'done' ? 'bg-accent/40' : 'bg-line'}`}
        />
      )}

      <div className="flex gap-3">
        <span
          aria-hidden
          className={`relative z-10 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-[10px] font-semibold transition-colors ${
            status === 'done'
              ? 'border-accent bg-accent text-accent-ink'
              : status === 'active'
                ? 'border-accent bg-canvas text-accent'
                : 'border-line bg-canvas text-faint'
          }`}
        >
          {status === 'done' ? (
            <Check className="size-3.5" strokeWidth={3} />
          ) : status === 'active' ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            index + 1
          )}
        </span>

        <div className="min-w-0 flex-1 pb-3">
          <p
            className={`text-[13.5px] leading-6 ${
              status === 'pending' ? 'text-faint' : status === 'active' ? 'font-semibold text-ink' : 'text-ink'
            }`}
          >
            {label}
            <span className="sr-only">
              {status === 'done' ? ' — done' : status === 'active' ? ' — in progress' : ' — not started'}
            </span>
          </p>
          {detail && <p className="mt-0.5 text-[12px] leading-5 text-muted">{detail}</p>}
          {children}
        </div>
      </div>
    </li>
  );
}

function Checklist({ progress }: { progress: InterviewProgress }) {
  const done = progress.collected.filter((c) => c.done).length;

  return (
    <div className="mt-3 rounded-lg border border-line bg-surface p-3">
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-wide text-faint uppercase">Collected</span>
        <span className="text-[11px] tabular-nums text-faint">
          {done}/{progress.collected.length}
        </span>
      </div>

      <div
        className="mb-3 h-1 overflow-hidden rounded-full bg-sunken"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={progress.collected.length}
        aria-label="Information collected"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${(done / Math.max(progress.collected.length, 1)) * 100}%` }}
        />
      </div>

      <ul className="space-y-1.5">
        {progress.collected.map((item) => (
          <li key={item.label} className="flex items-start gap-2 text-[12px] leading-5">
            <span
              aria-hidden
              className={`mt-[5px] size-1.5 shrink-0 rounded-full ${item.done ? 'bg-accent' : 'bg-line-strong'}`}
            />
            <span className={item.done ? 'text-ink' : 'text-faint'}>
              {item.label}
              <span className="sr-only">{item.done ? ' — collected' : ' — still needed'}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
