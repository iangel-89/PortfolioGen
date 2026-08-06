/**
 * HTTP surface.
 *
 * Thin by design: every route reads or writes the session state and delegates to
 * the interviewer or the orchestrator. No method logic lives here.
 */

import { Router } from 'express';
import type { ChatResponse, PipelineEvent } from '../shared/types';
import { runInterviewTurn } from './agents/agent0-interviewer';
import { PHASES, runPipeline } from './core/pipeline';
import { createSession, getSession, resetSession, toClientState } from './core/state';
import { assembleMarkdown } from './agents/agent8-packager';
import { createZip } from './output/zip';
import { errorMessage, isConfigured } from './llm/client';

export function createApiRouter(): Router {
  const api = Router();

  api.get('/health', (_req, res) => {
    res.json({ status: 'ok', configured: isConfigured(), phases: PHASES });
  });

  /* ---------------- session lifecycle ---------------- */

  api.post('/session', (_req, res) => {
    const session = createSession();
    res.json({
      sessionId: session.state.sessionId,
      messages: session.messages,
      state: toClientState(session.state),
      phases: PHASES,
      configured: isConfigured(),
    });
  });

  api.get('/session/:sessionId', (req, res) => {
    const session = getSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found.' });
    res.json({
      sessionId: session.state.sessionId,
      messages: session.messages,
      state: toClientState(session.state),
      phases: PHASES,
    });
  });

  api.post('/session/:sessionId/reset', (req, res) => {
    const session = resetSession(req.params.sessionId) ?? createSession();
    res.json({
      sessionId: session.state.sessionId,
      messages: session.messages,
      state: toClientState(session.state),
      phases: PHASES,
    });
  });

  /* ---------------- the interview ---------------- */

  api.post('/session/:sessionId/chat', async (req, res) => {
    const session = getSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found.' });

    const text = String(req.body?.message ?? '').trim();
    if (!text) return res.status(400).json({ error: 'Empty message.' });

    session.messages.push({ role: 'user', content: text, at: new Date().toISOString() });

    try {
      const { message, progress, notices } = await runInterviewTurn(session.state, session.messages);
      session.messages.push(message);

      const payload: ChatResponse = {
        message,
        progress,
        projectsCaptured: session.state.rawProjects.map((p) => ({ id: p.id, name: p.name })),
        notices,
      };
      res.json(payload);
    } catch (error) {
      // Roll the user's turn back out of history so a retry is not double-counted.
      session.messages.pop();
      res.status(502).json({ error: friendly(error) });
    }
  });

  /* ---------------- the build ---------------- */

  /**
   * Server-sent events. The build takes minutes, and a progress bar that only
   * moves at the end is not a progress bar.
   */
  api.get('/session/:sessionId/build', async (req, res) => {
    const session = getSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found.' });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    let open = true;
    req.on('close', () => {
      open = false;
    });

    const send = (event: PipelineEvent) => {
      if (!open) return;
      res.write(`data: ${JSON.stringify(sanitise(event))}\n\n`);
    };

    // Keeps intermediaries from closing an idle connection during a long stage.
    const heartbeat = setInterval(() => open && res.write(': keep-alive\n\n'), 15000);

    try {
      await runPipeline(session.state, send);
    } catch (error) {
      send({ type: 'error', message: friendly(error) });
    } finally {
      clearInterval(heartbeat);
      if (open) res.end();
    }
  });

  /* ---------------- deliverables ---------------- */

  api.get('/session/:sessionId/files', (req, res) => {
    const session = getSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found.' });
    res.json({
      files: (session.state.artifact?.files ?? []).map((f) => ({
        path: f.path,
        kind: f.kind,
        purpose: f.purpose,
        bytes: f.bytes,
      })),
      manifest: session.state.artifact?.manifest ?? null,
    });
  });

  /** Serves one generated file. `?preview=1` renders it; otherwise it downloads. */
  api.get('/session/:sessionId/files/:path', (req, res) => {
    const session = getSession(req.params.sessionId);
    if (!session) return res.status(404).send('Session not found.');

    const file = session.state.artifact?.files.find((f) => f.path === req.params.path);
    if (!file) return res.status(404).send('File not found.');

    const contentType =
      file.kind === 'html'
        ? 'text/html; charset=utf-8'
        : file.kind === 'css'
          ? 'text/css; charset=utf-8'
          : 'text/plain; charset=utf-8';

    res.setHeader('Content-Type', contentType);
    if (!req.query.preview) {
      res.setHeader('Content-Disposition', `attachment; filename="${file.path}"`);
    }
    res.send(file.contents);
  });

  /**
   * Preview rewrites relative links so the whole site browses inside the iframe.
   * The generated files themselves are untouched — they ship with plain relative
   * paths, which is what a static host needs.
   */
  api.get('/session/:sessionId/preview/:path', (req, res) => {
    const session = getSession(req.params.sessionId);
    if (!session) return res.status(404).send('Session not found.');

    const file = session.state.artifact?.files.find((f) => f.path === req.params.path);
    if (!file) return res.status(404).send('File not found.');

    const base = `/api/session/${session.state.sessionId}/preview/`;
    const rewritten = file.contents.replace(
      /(href|src)="(?!https?:|#|mailto:|tel:|data:|\/)([^"]+)"/g,
      (_match, attribute: string, target: string) => {
        const [path, hash] = target.split('#');
        return `${attribute}="${base}${encodeURIComponent(path)}${hash ? `#${hash}` : ''}"`;
      },
    );

    res.setHeader('Content-Type', file.kind === 'css' ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8');
    res.send(rewritten);
  });

  api.get('/session/:sessionId/export.zip', (req, res) => {
    const session = getSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found.' });

    const artifact = session.state.artifact;
    if (!artifact) return res.status(409).json({ error: 'Nothing has been built yet.' });

    const entries = artifact.files.map((f) => ({ path: f.path, contents: f.contents }));
    if (session.state.delivery) {
      entries.unshift({
        path: 'README.md',
        contents: session.state.delivery.markdown || assembleMarkdown(session.state.delivery, session.state),
      });
    }

    const zip = createZip(entries);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="portfolio.zip"');
    res.setHeader('Content-Length', String(zip.length));
    res.end(zip);
  });

  return api;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** The completion event carries the whole state; strip the file bodies out of it. */
function sanitise(event: PipelineEvent): PipelineEvent {
  if (event.type !== 'complete') return event;
  return { ...event, state: toClientState(event.state) };
}

function friendly(error: unknown): string {
  const message = errorMessage(error);
  if (message.includes('GEMINI_API_KEY')) {
    return 'The service is missing its API key. Whoever set this up needs to add it before it can generate anything.';
  }
  if (/quota|rate|429|resource.?exhausted/i.test(message)) {
    return 'The AI service is rate-limiting us. Give it a minute and try again — nothing was lost.';
  }
  return 'Something went wrong on our side. Your answers are saved, so try again.';
}
