import { ArrowRight, KeyRound, X } from 'lucide-react';
import { useSession } from './hooks/useSession';
import { WelcomeScreen } from './components/WelcomeScreen';
import { Chat } from './components/Chat';
import { Sidebar } from './components/Sidebar';
import { BuildingView } from './components/BuildingView';
import { ResultView } from './components/ResultView';
import { Notices } from './components/Notices';

/**
 * Application shell.
 *
 * Four views — welcome, interview, building, result — with the progress rail
 * alongside the two that have progress to show.
 */
export default function App() {
  const session = useSession();
  const {
    view,
    sessionId,
    phases,
    messages,
    state,
    progress,
    notices,
    build,
    thinking,
    error,
    booting,
    configured,
  } = session;

  if (booting) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas">
        <span className="sr-only">Loading</span>
        <span aria-hidden className="size-6 animate-spin rounded-full border-2 border-line border-t-accent" />
      </div>
    );
  }

  const showRail = view === 'interview' || view === 'building';
  const readyToBuild = Boolean(progress?.readyToBuild);

  // The interview manages its own scrolling (transcript scrolls, composer pinned);
  // every other view is a normal document.
  const mainOverflow = view === 'interview' ? 'overflow-hidden' : 'overflow-y-auto scrollbar-slim';

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas text-ink">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-ink"
      >
        Skip to main content
      </a>

      {!configured && (
        <div className="flex items-center gap-2 border-b border-warn/40 bg-warn-wash px-4 py-2 text-[13px] text-ink">
          <KeyRound className="size-3.5 shrink-0 text-warn" aria-hidden />
          <span>
            No API key is configured, so nothing can be generated yet. Add{' '}
            <code className="font-mono text-[12px]">GEMINI_API_KEY</code> to the environment.
          </span>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {showRail && (
          <aside className="hidden w-72 shrink-0 overflow-hidden border-r border-line bg-sunken lg:block">
            <Sidebar
              view={view}
              phases={phases}
              progress={progress}
              build={build}
              onRestart={session.restart}
            />
          </aside>
        )}

        <main id="content" className={`flex min-h-0 min-w-0 flex-1 flex-col ${mainOverflow}`}>
          {view === 'welcome' && (
            <WelcomeScreen
              onStart={session.start}
              resuming={messages.some((m) => m.role === 'user')}
            />
          )}

          {view === 'interview' && (
            <>
              <MobileHeader
                title={progress?.blockLabel ?? 'Your story'}
                onRestart={session.restart}
              />
              {error && <ErrorBanner message={error} onDismiss={session.dismissError} />}
              <Notices notices={notices} />
              <Chat
                messages={messages}
                thinking={thinking}
                disabled={!configured}
                onSend={session.send}
              />
              {readyToBuild && (
                <BuildBar onBuild={session.buildPortfolio} disabled={thinking || !configured} />
              )}
            </>
          )}

          {view === 'building' && <BuildingView phases={phases} build={build} />}

          {view === 'result' && sessionId && state && (
            <ResultView sessionId={sessionId} state={state} onRestart={session.restart} />
          )}
        </main>
      </div>
    </div>
  );
}

function MobileHeader({ title, onRestart }: { title: string; onRestart: () => void }) {
  return (
    <header className="flex items-center gap-3 border-b border-line px-4 py-3 lg:hidden">
      <span
        aria-hidden
        className="grid size-7 place-items-center rounded-lg bg-accent font-display text-[13px] font-semibold text-accent-ink"
      >
        P
      </span>
      <p className="mr-auto truncate text-[14px] font-medium text-ink">{title}</p>
      <button
        type="button"
        onClick={onRestart}
        className="text-[13px] font-medium text-muted underline-offset-2 hover:text-ink hover:underline"
      >
        Start over
      </button>
    </header>
  );
}

/**
 * Appears once there is enough to work with. Building stays the user's decision —
 * they may well have more to say.
 */
function BuildBar({ onBuild, disabled }: { onBuild: () => void; disabled: boolean }) {
  return (
    <div className="animate-rise shrink-0 border-t border-line bg-accent-wash px-4 py-3 sm:px-8">
      <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-x-4 gap-y-2">
        <p className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-ink">
          There&rsquo;s enough here to build something. Keep going if you have more to add &mdash;
          more detail makes it stronger.
        </p>
        <button
          type="button"
          onClick={onBuild}
          disabled={disabled}
          className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-[14px] font-medium text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          Build my portfolio
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div role="alert" className="border-b border-warn/40 bg-warn-wash px-4 py-2.5 sm:px-8">
      <div className="mx-auto flex max-w-2xl items-start gap-3">
        <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink">{message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded p-0.5 text-muted hover:text-ink"
        >
          <X className="size-4" aria-hidden />
          <span className="sr-only">Dismiss</span>
        </button>
      </div>
    </div>
  );
}
