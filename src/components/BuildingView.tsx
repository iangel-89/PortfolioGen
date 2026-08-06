import { Check, Loader2 } from 'lucide-react';
import type { PhaseDescriptor } from '../../shared/types';
import type { BuildProgress } from '../hooks/useSession';

/**
 * What the user watches while the pipeline runs.
 *
 * Honest progress: the phase list is the real execution order, the detail line is
 * the real stage output, and when a gate sends work back the phase reopens rather
 * than the bar pretending to keep moving.
 */
export function BuildingView({
  phases,
  build,
}: {
  phases: PhaseDescriptor[];
  build: BuildProgress;
}) {
  const doneCount = phases.filter((p) => build.status[p.id] === 'done').length;
  const active = phases.find((p) => p.id === build.activePhase);
  const percent = Math.round((doneCount / Math.max(phases.length, 1)) * 100);

  return (
    <div className="flex min-h-full items-center justify-center px-6 py-14">
      <div className="w-full max-w-xl">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Building your portfolio
          </h1>
          <p className="mt-2 text-[15px] text-muted">
            This takes a few minutes. You can leave this tab open and come back.
          </p>
        </div>

        <div
          className="mb-8 h-1.5 overflow-hidden rounded-full bg-sunken"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Build progress"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
            style={{ width: `${Math.max(percent, 3)}%` }}
          />
        </div>

        <ol className="space-y-3">
          {phases.map((phase) => {
            const status = build.status[phase.id] ?? 'pending';
            return (
              <li
                key={phase.id}
                className={`flex gap-3 rounded-xl border p-3.5 transition-colors ${
                  status === 'active'
                    ? 'border-accent/50 bg-surface card-shadow'
                    : 'border-transparent'
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${
                    status === 'done'
                      ? 'bg-accent text-accent-ink'
                      : status === 'active'
                        ? 'text-accent'
                        : 'border border-line'
                  }`}
                >
                  {status === 'done' ? (
                    <Check className="size-3" strokeWidth={3} />
                  ) : status === 'active' ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                </span>

                <div className="min-w-0 flex-1">
                  <p
                    className={`text-[14.5px] leading-6 ${
                      status === 'pending' ? 'text-faint' : status === 'active' ? 'font-semibold text-ink' : 'text-ink'
                    }`}
                  >
                    {phase.label}
                  </p>
                  {status === 'active' && (
                    <p className="mt-0.5 text-[13px] leading-5 text-muted" aria-live="polite">
                      {build.detail || phase.blurb}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {active && (
          <div className="relative mt-8 h-px overflow-hidden bg-line" aria-hidden>
            <span className="animate-sweep absolute inset-y-0 left-0 w-1/3 bg-accent" />
          </div>
        )}

        <p className="mt-8 text-[13px] leading-relaxed text-faint">
          If something doesn&rsquo;t hold up &mdash; a number without a source, a client name that
          shouldn&rsquo;t be public &mdash; we go back and fix it before finishing. That&rsquo;s
          usually what the longer pauses are.
        </p>
      </div>
    </div>
  );
}
