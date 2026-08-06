/**
 * Session state factory and the in-memory store.
 *
 * One state object per session, exactly as section C.2 of the method describes.
 * Swap this module for a database-backed one and nothing else has to change —
 * the rest of the system only ever calls `getSession` / `createSession`.
 */

import { randomUUID } from 'crypto';
import type { ChatMessage, SessionState } from '../../shared/types';
import { OPENING_MESSAGE } from '../agents/agent0-interviewer';

export function createSessionState(sessionId: string = randomUUID()): SessionState {
  const now = new Date().toISOString();
  return {
    sessionId,
    createdAt: now,
    updatedAt: now,
    language: 'en',
    mode: 'standard',
    status: 'intake',

    rawProfile: null,
    rawProjects: [],
    strategicBrief: null,
    curationCriteria: null,
    curatedInventory: null,
    caseNarratives: [],
    contentModel: null,
    archetypeDecision: null,
    visualSystem: null,
    machineFindings: null,
    artifact: null,
    qualityReport: null,
    delivery: null,

    flags: {
      nda: false,
      regulatedProfession: false,
      insufficientEvidence: false,
      weakCoverage: false,
      unsourcedAssertions: [],
      briefRetries: 0,
      narrativeRetries: 0,
      visualRetries: 0,
      qaRetries: 0,
    },
    notices: [],
    trace: [],
    directives: {},
    escalation: null,
  };
}

export interface Session {
  state: SessionState;
  messages: ChatMessage[];
  lastTouched: number;
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const sessions = new Map<string, Session>();

export function createSession(): Session {
  const session: Session = {
    state: createSessionState(),
    messages: [{ ...OPENING_MESSAGE, at: new Date().toISOString() }],
    lastTouched: Date.now(),
  };
  sessions.set(session.state.sessionId, session);
  evictStale();
  return session;
}

export function getSession(sessionId: string): Session | undefined {
  const session = sessions.get(sessionId);
  if (session) session.lastTouched = Date.now();
  return session;
}

export function resetSession(sessionId: string): Session | undefined {
  if (!sessions.has(sessionId)) return undefined;
  const fresh: Session = {
    state: createSessionState(sessionId),
    messages: [{ ...OPENING_MESSAGE, at: new Date().toISOString() }],
    lastTouched: Date.now(),
  };
  sessions.set(sessionId, fresh);
  return fresh;
}

function evictStale(): void {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, session] of sessions) {
    if (session.lastTouched < cutoff) sessions.delete(id);
  }
}

/**
 * The client never needs the generated file contents in the session payload —
 * they are fetched per file — and shipping them doubles the response for nothing.
 */
export function toClientState(state: SessionState): SessionState {
  if (!state.artifact) return state;
  return {
    ...state,
    artifact: {
      ...state.artifact,
      files: state.artifact.files.map((f) => ({ ...f, contents: '' })),
    },
  };
}
