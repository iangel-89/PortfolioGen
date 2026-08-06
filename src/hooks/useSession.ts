/**
 * The single source of truth for the client.
 *
 * Owns the session, the transcript, the interview progress and the build stream.
 * Components below this are presentational — they receive data and callbacks.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../lib/api';
import type {
  ChatMessage,
  InterviewProgress,
  PhaseDescriptor,
  PipelineEvent,
  SessionState,
  UserNotice,
} from '../../shared/types';

const STORAGE_KEY = 'portfoliogen.sessionId';

export type View = 'welcome' | 'interview' | 'building' | 'result';

export type PhaseStatus = 'pending' | 'active' | 'done';

export interface BuildProgress {
  status: Record<string, PhaseStatus>;
  activePhase: string | null;
  detail: string;
  /** Every detail line seen so far, newest last — the build log. */
  log: { phaseId: string; detail: string }[];
}

const emptyBuild = (): BuildProgress => ({ status: {}, activePhase: null, detail: '', log: [] });

export function useSession() {
  const [view, setView] = useState<View>('welcome');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [phases, setPhases] = useState<PhaseDescriptor[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<SessionState | null>(null);
  const [progress, setProgress] = useState<InterviewProgress | null>(null);
  const [notices, setNotices] = useState<UserNotice[]>([]);
  const [build, setBuild] = useState<BuildProgress>(emptyBuild);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [configured, setConfigured] = useState(true);

  const closeStream = useRef<(() => void) | null>(null);

  const adopt = useCallback((payload: api.SessionPayload, nextView?: View) => {
    setSessionId(payload.sessionId);
    setMessages(payload.messages);
    setState(payload.state);
    setPhases(payload.phases);
    setNotices(payload.state.notices ?? []);
    if (payload.configured !== undefined) setConfigured(payload.configured);
    localStorage.setItem(STORAGE_KEY, payload.sessionId);
    if (nextView) setView(nextView);
  }, []);

  /* Resume an interrupted session rather than throwing the answers away. */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        setBooting(false);
        return;
      }
      try {
        const payload = await api.loadSession(stored);
        if (cancelled) return;
        adopt(payload);
        const hasAnswered = payload.messages.some((m) => m.role === 'user');
        if (payload.state.status === 'complete' || payload.state.delivery) {
          setBuild(allDone(payload.phases));
          setView('result');
        } else if (hasAnswered) {
          setView('interview');
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();

    return () => {
      cancelled = true;
      closeStream.current?.();
    };
  }, [adopt]);

  const start = useCallback(async () => {
    setError(null);
    if (sessionId && messages.length) {
      setView('interview');
      return;
    }
    try {
      adopt(await api.createSession(), 'interview');
    } catch (err) {
      setError(message(err));
    }
  }, [adopt, messages.length, sessionId]);

  const send = useCallback(
    async (text: string) => {
      if (!sessionId || thinking) return;
      setError(null);
      setThinking(true);
      setMessages((current) => [...current, { role: 'user', content: text, at: new Date().toISOString() }]);

      try {
        const response = await api.sendMessage(sessionId, text);
        setMessages((current) => [...current, response.message]);
        setProgress(response.progress);
        if (response.notices.length) {
          setNotices((current) => mergeNotices(current, response.notices));
        }
      } catch (err) {
        setError(message(err));
        setMessages((current) => current.slice(0, -1));
      } finally {
        setThinking(false);
      }
    },
    [sessionId, thinking],
  );

  const buildPortfolio = useCallback(() => {
    if (!sessionId) return;
    setError(null);
    setBuild(emptyBuild());
    setView('building');

    closeStream.current?.();
    closeStream.current = api.streamBuild(sessionId, (event: PipelineEvent) => {
      setBuild((current) => reduceBuild(current, event));

      if (event.type === 'notice') {
        setNotices((current) => mergeNotices(current, [event.notice]));
      }
      if (event.type === 'complete') {
        setState(event.state);
        setNotices((current) => mergeNotices(current, event.state.notices ?? []));
        setView('result');
      }
      if (event.type === 'error') {
        setError(event.message);
        setView('interview');
      }
    });
  }, [sessionId]);

  const restart = useCallback(async () => {
    closeStream.current?.();
    setError(null);
    setProgress(null);
    setNotices([]);
    setBuild(emptyBuild());
    try {
      if (sessionId) {
        adopt(await api.resetSession(sessionId), 'welcome');
      } else {
        adopt(await api.createSession(), 'welcome');
      }
    } catch (err) {
      setError(message(err));
    }
  }, [adopt, sessionId]);

  return {
    view,
    setView,
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
    start,
    send,
    buildPortfolio,
    restart,
    dismissError: () => setError(null),
  };
}

/* ------------------------------------------------------------------ */
/* Reducers                                                            */
/* ------------------------------------------------------------------ */

function reduceBuild(current: BuildProgress, event: PipelineEvent): BuildProgress {
  switch (event.type) {
    case 'phase_start':
      return {
        ...current,
        activePhase: event.phaseId,
        detail: '',
        status: { ...current.status, [event.phaseId]: 'active' },
      };

    case 'phase_detail':
      return {
        ...current,
        detail: event.detail,
        log: [...current.log, { phaseId: event.phaseId, detail: event.detail }].slice(-40),
      };

    case 'phase_done':
      return { ...current, status: { ...current.status, [event.phaseId]: 'done' } };

    // A gate sending work back re-opens an earlier phase; reflect that honestly
    // rather than showing a bar that only ever moves forwards.
    case 'retry':
      return { ...current, status: { ...current.status, [event.phaseId]: 'active' } };

    default:
      return current;
  }
}

function allDone(phases: PhaseDescriptor[]): BuildProgress {
  return {
    status: Object.fromEntries(phases.map((p) => [p.id, 'done' as PhaseStatus])),
    activePhase: null,
    detail: '',
    log: [],
  };
}

function mergeNotices(existing: UserNotice[], incoming: UserNotice[]): UserNotice[] {
  const seen = new Set(existing.map((n) => `${n.kind}:${n.message}`));
  const merged = [...existing];
  for (const notice of incoming) {
    const key = `${notice.kind}:${notice.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(notice);
    }
  }
  return merged;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}
