import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Monitor,
  RotateCcw,
} from 'lucide-react';
import type { SessionState } from '../../shared/types';
import * as api from '../lib/api';
import { Markdown } from '../lib/markdown';

type Tab = 'summary' | 'preview' | 'files';

/**
 * The finished result.
 *
 * Three views of the same thing: the written delivery (the format the method
 * mandates), a live preview of the site, and the files themselves. Copy, export
 * and restart sit in the header where they stay reachable from all three.
 */
export function ResultView({
  sessionId,
  state,
  onRestart,
}: {
  sessionId: string;
  state: SessionState;
  onRestart: () => void;
}) {
  const [tab, setTab] = useState<Tab>('summary');
  const [copied, setCopied] = useState(false);
  const [files, setFiles] = useState<api.FileSummary[]>([]);

  const markdown = state.delivery?.markdown ?? '';

  useEffect(() => {
    api
      .listFiles(sessionId)
      .then((response) => setFiles(response.files))
      .catch(() => setFiles([]));
  }, [sessionId]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard permission denied — the download button still works.
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-5 py-3 sm:px-8">
          <div className="mr-auto flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden
              className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-accent-ink"
            >
              <Check className="size-4" strokeWidth={3} />
            </span>
            <p className="truncate font-display text-[17px] font-semibold tracking-tight text-ink">
              Your portfolio is ready
            </p>
          </div>

          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:border-line-strong"
          >
            {copied ? <Check className="size-3.5 text-accent" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
            {copied ? 'Copied' : 'Copy summary'}
          </button>

          <a
            href={api.exportUrl(sessionId)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-medium text-accent-ink transition-colors hover:bg-accent-hover"
          >
            <Download className="size-3.5" aria-hidden />
            Download all
          </a>

          <button
            type="button"
            onClick={onRestart}
            title="Start over"
            className="grid size-8 place-items-center rounded-lg border border-line bg-surface text-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            <span className="sr-only">Start over</span>
          </button>
        </div>

        <div className="mx-auto max-w-4xl px-5 sm:px-8">
          <div role="tablist" aria-label="Result views" className="-mb-px flex gap-1">
            <TabButton id="summary" active={tab} onSelect={setTab} icon={<FileText className="size-3.5" />}>
              What you got
            </TabButton>
            <TabButton id="preview" active={tab} onSelect={setTab} icon={<Monitor className="size-3.5" />}>
              Preview
            </TabButton>
            <TabButton id="files" active={tab} onSelect={setTab} icon={<Download className="size-3.5" />}>
              Files{files.length ? ` (${files.length})` : ''}
            </TabButton>
          </div>
        </div>
      </header>

      <div className="flex-1">
        {tab === 'summary' && <Summary state={state} markdown={markdown} />}
        {tab === 'preview' && <Preview sessionId={sessionId} />}
        {tab === 'files' && <Files sessionId={sessionId} files={files} />}
      </div>
    </div>
  );
}

function TabButton({
  id,
  active,
  onSelect,
  icon,
  children,
}: {
  id: Tab;
  active: Tab;
  onSelect: (tab: Tab) => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const selected = active === id;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={() => onSelect(id)}
      className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors ${
        selected
          ? 'border-accent text-ink'
          : 'border-transparent text-muted hover:border-line-strong hover:text-ink'
      }`}
    >
      <span aria-hidden>{icon}</span>
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */

function Summary({ state, markdown }: { state: SessionState; markdown: string }) {
  const report = state.qualityReport;
  const brief = state.strategicBrief;

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
      {state.escalation && (
        <div className="mb-8 rounded-xl border border-warn/40 bg-warn-wash p-4">
          <div className="flex gap-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
            <div className="min-w-0 text-[14px] leading-relaxed whitespace-pre-wrap text-ink">
              {state.escalation}
            </div>
          </div>
        </div>
      )}

      {brief && (
        <div className="mb-8 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-surface p-4 sm:col-span-2">
            <h2 className="mb-1.5 text-[11px] font-semibold tracking-widest text-faint uppercase">
              What it says about you
            </h2>
            <p className="font-display text-[17px] leading-snug text-ink balance">{brief.thesis}</p>
          </div>
          <div className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-1.5 text-[11px] font-semibold tracking-widest text-faint uppercase">
              Written for
            </h2>
            <p className="text-[13.5px] leading-relaxed text-ink">{brief.primaryReader?.profile}</p>
          </div>
        </div>
      )}

      {brief?.takeaways?.length ? (
        <div className="mb-8 rounded-xl border border-line bg-surface p-4">
          <h2 className="mb-3 text-[11px] font-semibold tracking-widest text-faint uppercase">
            What a reader should walk away with
          </h2>
          <ul className="grid gap-2.5 sm:grid-cols-3">
            {brief.takeaways.map((takeaway, index) => (
              <li key={index} className="flex gap-2 text-[13.5px] leading-relaxed text-ink">
                <span
                  aria-hidden
                  className="mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full bg-accent-wash text-[10px] font-semibold text-accent"
                >
                  {index + 1}
                </span>
                {takeaway}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report && <GateStrip report={report} />}

      <article className="measure mt-10">
        {markdown ? (
          <Markdown source={withoutLeadingTitle(markdown)} />
        ) : (
          <p className="text-muted">The written summary is not available for this run.</p>
        )}
      </article>
    </div>
  );
}

/**
 * The delivered document opens with "# Your portfolio is ready", which the page
 * header already says. Dropped for display only — the exported file keeps the
 * mandated format intact.
 */
function withoutLeadingTitle(markdown: string): string {
  return markdown.replace(/^\s*#\s+.*\n+/, '');
}

function GateStrip({ report }: { report: NonNullable<SessionState['qualityReport']> }) {
  const label: Record<string, string> = {
    accessibility: 'Readable for everyone',
    performance: 'Loads fast',
    content: 'Well written',
    truthfulness: 'Claims you can back up',
    confidentiality: 'Nothing confidential leaked',
    strategy: 'The point lands',
  };

  return (
    <div className="flex flex-wrap gap-2">
      {report.gates.map((gate) => {
        const passed = gate.status === 'pass';
        return (
          <span
            key={gate.gate}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] ${
              passed
                ? 'border-accent/30 bg-accent-wash text-ink'
                : 'border-warn/40 bg-warn-wash text-ink'
            }`}
          >
            <span aria-hidden className={`size-1.5 rounded-full ${passed ? 'bg-accent' : 'bg-warn'}`} />
            {label[gate.gate] ?? gate.gate}
            <span className="sr-only">{passed ? ' — passed' : ' — needs attention'}</span>
          </span>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Preview({ sessionId }: { sessionId: string }) {
  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted">
          This is your actual site. Links work — click through to a case study.
        </p>
        <a
          href={api.previewUrl(sessionId, 'index.html')}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline"
        >
          Open in a new tab
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface card-shadow">
        <div className="flex items-center gap-1.5 border-b border-line bg-sunken px-3 py-2">
          <span aria-hidden className="size-2.5 rounded-full bg-line-strong" />
          <span aria-hidden className="size-2.5 rounded-full bg-line-strong" />
          <span aria-hidden className="size-2.5 rounded-full bg-line-strong" />
        </div>
        <iframe
          title="Portfolio preview"
          src={api.previewUrl(sessionId, 'index.html')}
          sandbox="allow-same-origin allow-popups"
          className="h-[70vh] min-h-100 w-full bg-white"
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Files({ sessionId, files }: { sessionId: string; files: api.FileSummary[] }) {
  if (!files.length) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
        <p className="text-muted">No files were produced for this run.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {files.map((file) => (
          <li key={file.path} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-[13px] text-ink">{file.path}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{file.purpose}</p>
            </div>
            <span className="shrink-0 text-[12px] tabular-nums text-faint">
              {Math.max(1, Math.round(file.bytes / 1024))} KB
            </span>
            <div className="flex shrink-0 gap-1">
              {file.kind === 'html' && (
                <a
                  href={api.previewUrl(sessionId, file.path)}
                  target="_blank"
                  rel="noreferrer"
                  className="grid size-8 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-line-strong hover:text-ink"
                  title={`Open ${file.path}`}
                >
                  <ExternalLink className="size-3.5" aria-hidden />
                  <span className="sr-only">Open {file.path}</span>
                </a>
              )}
              <a
                href={api.downloadUrl(sessionId, file.path)}
                className="grid size-8 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-line-strong hover:text-ink"
                title={`Download ${file.path}`}
              >
                <Download className="size-3.5" aria-hidden />
                <span className="sr-only">Download {file.path}</span>
              </a>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-5 text-[13px] leading-relaxed text-faint">
        To get a PDF: open <span className="font-mono text-muted">portfolio-print.html</span> and
        print it, choosing &ldquo;Save as PDF&rdquo;. The page is already laid out for print.
      </p>
    </div>
  );
}
