/**
 * API client. One function per endpoint, no state.
 */

import type {
  ChatResponse,
  PhaseDescriptor,
  PipelineEvent,
  ChatMessage,
  SessionState,
} from '../../shared/types';

export interface SessionPayload {
  sessionId: string;
  messages: ChatMessage[];
  state: SessionState;
  phases: PhaseDescriptor[];
  configured?: boolean;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}) as { error?: string });
    throw new Error(body.error || `Request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export function createSession(): Promise<SessionPayload> {
  return request<SessionPayload>('/api/session', { method: 'POST' });
}

export function loadSession(sessionId: string): Promise<SessionPayload> {
  return request<SessionPayload>(`/api/session/${sessionId}`);
}

export function resetSession(sessionId: string): Promise<SessionPayload> {
  return request<SessionPayload>(`/api/session/${sessionId}/reset`, { method: 'POST' });
}

export function sendMessage(sessionId: string, message: string): Promise<ChatResponse> {
  return request<ChatResponse>(`/api/session/${sessionId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export interface FileSummary {
  path: string;
  kind: string;
  purpose: string;
  bytes: number;
}

export function listFiles(sessionId: string): Promise<{ files: FileSummary[] }> {
  return request<{ files: FileSummary[] }>(`/api/session/${sessionId}/files`);
}

export const downloadUrl = (sessionId: string, path: string) =>
  `/api/session/${sessionId}/files/${encodeURIComponent(path)}`;

export const previewUrl = (sessionId: string, path: string) =>
  `/api/session/${sessionId}/preview/${encodeURIComponent(path)}`;

export const exportUrl = (sessionId: string) => `/api/session/${sessionId}/export.zip`;

/**
 * Opens the build stream. Returns a closer so a component can unsubscribe on
 * unmount without leaving the connection hanging.
 */
export function streamBuild(sessionId: string, onEvent: (event: PipelineEvent) => void): () => void {
  const source = new EventSource(`/api/session/${sessionId}/build`);

  source.onmessage = (message) => {
    try {
      const event = JSON.parse(message.data) as PipelineEvent;
      onEvent(event);
      if (event.type === 'complete' || event.type === 'error') source.close();
    } catch {
      // A malformed frame is not worth tearing the stream down for.
    }
  };

  source.onerror = () => {
    // EventSource fires this on normal server close too, so only report it if the
    // stream never reached a terminal event.
    if (source.readyState === EventSource.CLOSED) return;
    source.close();
    onEvent({
      type: 'error',
      message: 'The connection dropped while building. Your answers are saved — try again.',
    });
  };

  return () => source.close();
}
