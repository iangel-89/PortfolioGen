/**
 * The common contract every pipeline stage implements.
 *
 * This is what makes the pipeline modular: the orchestrator knows nothing about
 * any particular stage beyond this interface, so a stage can be rewritten,
 * swapped for a deterministic implementation, or removed by editing one file
 * plus the registry.
 *
 * Encodes section C.3 of the method ("Contrato común de agentes"):
 *   1. returns structured output conforming to its schema
 *   2. never invents missing information — it records the gap instead
 *   3. never asserts facts about the user that are not in the state
 *   4. declares confidence and assumptions
 *   5. writes a traceability entry
 *   6. never writes outside its own slice of the state
 */

import type { Confidence, SessionState, UserNotice } from '../../shared/types';

export interface StageContext {
  state: SessionState;
  /** Streams a plain-language progress line to the user. Never mentions internals. */
  emit(detail: string): void;
}

export interface StageRetry {
  /** Stage id to jump back to. Everything after it re-runs. */
  stageId: string;
  /** Precise, imperative instructions for the stage being re-run. */
  instructions: string[];
  reason: string;
}

export interface StageOutcome {
  /** One line for the trace: what this stage decided. */
  decision: string;
  /** One line for the trace: why. */
  reasoning: string;
  confidence?: Confidence;
  /** Named branch taken, for routers. */
  route?: string;
  /** Plain-language warnings to show the user. */
  notices?: UserNotice[];
  /** Ask the orchestrator to jump backwards and re-run from an earlier stage. */
  retry?: StageRetry;
  /** Stop the run and hand the decision to the user, in plain language. */
  escalate?: string;
}

export interface Stage {
  /** Stable identifier. Used by routers to target retries and by the model table. */
  id: string;
  kind: 'agent' | 'router' | 'checker' | 'renderer';
  /** The name this stage carries in the method document. Trace only, never shown. */
  methodName: string;
  /** The user-visible phase this stage belongs to. */
  phaseId: string;
  run(ctx: StageContext): Promise<StageOutcome>;
}

/* ------------------------------------------------------------------ */
/* Helpers shared by stage implementations                             */
/* ------------------------------------------------------------------ */

/** Reads and clears the directives a router left for this stage. */
export function takeDirectives(state: SessionState, stageId: string): string[] {
  const directives = state.directives[stageId] ?? [];
  delete state.directives[stageId];
  return directives;
}

export function addDirectives(state: SessionState, stageId: string, instructions: string[]): void {
  if (!instructions.length) return;
  state.directives[stageId] = [...(state.directives[stageId] ?? []), ...instructions];
}

/** Renders router directives as a prompt section, or an empty string when there are none. */
export function directiveBlock(directives: string[]): string {
  if (!directives.length) return '';
  return [
    '',
    'MANDATORY CORRECTIONS FROM THE PREVIOUS REVIEW.',
    'Your output is rejected again unless every one of these is addressed:',
    ...directives.map((d, i) => `${i + 1}. ${d}`),
    '',
  ].join('\n');
}

/** Compact JSON for prompt embedding — keeps token spend down. */
export function asJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}
