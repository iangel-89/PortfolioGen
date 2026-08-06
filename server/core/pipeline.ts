/**
 * The orchestrator.
 *
 * A flat, ordered list of stages plus backward jumps. That is the whole machine.
 *
 * Every stage implements the same interface, so this file contains no knowledge
 * of what any individual stage does. To change the method — reorder a phase, drop
 * a gate, add a new one, replace a model-backed stage with a deterministic one —
 * edit `STAGES` below and the stage's own file. Nothing else needs to know.
 *
 * Loops: when a gate returns `retry`, execution jumps back to the named stage and
 * everything after it runs again against the corrected input. Each gate owns its
 * own retry budget (two, per the method) and escalates to the user rather than
 * looping when it runs out. `MAX_TRANSITIONS` is a backstop against a gate that
 * forgets to count.
 */

import type { PhaseDescriptor, PipelineEvent, SessionState, TraceEntry } from '../../shared/types';
import type { Stage, StageContext } from './contract';
import { addDirectives } from './contract';
import { errorMessage } from '../llm/client';

import { router0IntakeGate } from '../routers/router0-intake-gate';
import { agent1Strategist } from '../agents/agent1-strategist';
import { router1StrategyGate } from '../routers/router1-strategy-gate';
import { agent2Curator } from '../agents/agent2-curator';
import { router2EvidenceGate } from '../routers/router2-evidence-gate';
import { agent3Narrator } from '../agents/agent3-narrator';
import { router3IntegrityGate } from '../routers/router3-integrity-gate';
import { agent4Architect } from '../agents/agent4-architect';
import { router4ArchetypeSelector } from '../routers/router4-archetype-selector';
import { agent5ArtDirector } from '../agents/agent5-art-director';
import { router5VisualGate } from '../routers/router5-visual-gate';
import { agent6Builder } from '../agents/agent6-builder';
import { router6AuditPlanner } from '../routers/router6-audit-planner';
import { agent7Auditor } from '../agents/agent7-auditor';
import { router7QualityGate } from '../routers/router7-quality-gate';
import { agent8Packager } from '../agents/agent8-packager';

/* ------------------------------------------------------------------ */
/* Phases — the only vocabulary the user ever sees                     */
/* ------------------------------------------------------------------ */

export const PHASES: PhaseDescriptor[] = [
  { id: 'framing', label: 'Finding your angle', blurb: 'Working out who this has to convince, and what it should say.' },
  { id: 'curation', label: 'Choosing what to show', blurb: 'Picking the work that makes the strongest case, and dropping the rest.' },
  { id: 'writing', label: 'Writing your case studies', blurb: 'Turning each project into a story with a problem, a decision and a result.' },
  { id: 'structure', label: 'Ordering it for the reader', blurb: 'Deciding what comes first, second and never.' },
  { id: 'design', label: 'Designing the look', blurb: 'Building a look from your field and your work — not from a template.' },
  { id: 'build', label: 'Building your files', blurb: 'Assembling pages you can publish today.' },
  { id: 'review', label: 'Checking everything', blurb: 'Readability, honest numbers, confidentiality, and whether the point lands.' },
];

/* ------------------------------------------------------------------ */
/* The pipeline                                                        */
/* ------------------------------------------------------------------ */

/** Execution order. This list is the method. */
export const STAGES: Stage[] = [
  router0IntakeGate,
  agent1Strategist,
  router1StrategyGate,
  agent2Curator,
  router2EvidenceGate,
  agent3Narrator,
  router3IntegrityGate,
  agent4Architect,
  router4ArchetypeSelector,
  agent5ArtDirector,
  router5VisualGate,
  agent6Builder,
  router6AuditPlanner,
  agent7Auditor,
  router7QualityGate,
  agent8Packager,
];

const MAX_TRANSITIONS = STAGES.length * 4;

export type Emit = (event: PipelineEvent) => void;

export async function runPipeline(state: SessionState, emit: Emit): Promise<void> {
  state.status = 'building';
  state.escalation = null;

  let cursor = 0;
  let transitions = 0;
  let currentPhase = '';

  const openPhase = (phaseId: string) => {
    if (phaseId === currentPhase) return;
    currentPhase = phaseId;
    const index = PHASES.findIndex((p) => p.id === phaseId);
    emit({ type: 'phase_start', phaseId, index, total: PHASES.length });
  };

  const closePhase = (phaseId: string) => {
    const index = PHASES.findIndex((p) => p.id === phaseId);
    emit({ type: 'phase_done', phaseId, index, total: PHASES.length });
  };

  while (cursor < STAGES.length) {
    if (++transitions > MAX_TRANSITIONS) {
      state.status = 'failed';
      emit({
        type: 'error',
        message: 'The build kept going back and forth without settling. Nothing was lost — try again, or restart with a bit more detail.',
      });
      return;
    }

    const stage = STAGES[cursor];
    openPhase(stage.phaseId);

    const ctx: StageContext = {
      state,
      emit: (detail: string) => emit({ type: 'phase_detail', phaseId: stage.phaseId, detail }),
    };

    const startedAt = Date.now();
    let outcome;
    try {
      outcome = await stage.run(ctx);
    } catch (error) {
      state.status = 'failed';
      trace(state, {
        at: new Date().toISOString(),
        stageId: stage.id,
        stageKind: stage.kind,
        decision: 'Failed',
        reasoning: errorMessage(error),
        durationMs: Date.now() - startedAt,
      });
      emit({ type: 'error', message: friendlyError(error) });
      return;
    }

    trace(state, {
      at: new Date().toISOString(),
      stageId: stage.id,
      stageKind: stage.kind,
      decision: outcome.decision,
      reasoning: outcome.reasoning,
      confidence: outcome.confidence,
      route: outcome.route,
      durationMs: Date.now() - startedAt,
    });

    for (const notice of outcome.notices ?? []) {
      if (!state.notices.some((n) => n.kind === notice.kind && n.message === notice.message)) {
        state.notices.push(notice);
      }
      emit({ type: 'notice', notice });
    }

    if (outcome.escalate) {
      state.escalation = outcome.escalate;
      state.status = 'needs_user_input';
      emit({ type: 'escalate', message: outcome.escalate });

      // A truthfulness or confidentiality escalation stops the run; a late-stage
      // one still hands over whatever was finished, with the problem written down.
      const canStillDeliver = Boolean(state.artifact);
      if (!canStillDeliver) return;

      cursor = STAGES.findIndex((s) => s.id === 'agent-8-packager');
      continue;
    }

    if (outcome.retry) {
      const target = STAGES.findIndex((s) => s.id === outcome.retry!.stageId);
      if (target === -1) {
        // A gate asked for a stage that does not exist. Treat it as a pass rather
        // than stalling; the trace records what was asked for.
        cursor += 1;
        continue;
      }
      addDirectives(state, outcome.retry.stageId, outcome.retry.instructions);
      emit({
        type: 'retry',
        phaseId: STAGES[target].phaseId,
        attempt: transitions,
        reason: outcome.retry.reason,
      });
      currentPhase = '';
      cursor = target;
      continue;
    }

    const next = STAGES[cursor + 1];
    if (!next || next.phaseId !== stage.phaseId) closePhase(stage.phaseId);

    cursor += 1;
  }

  state.status = state.escalation ? 'needs_user_input' : 'complete';
  state.updatedAt = new Date().toISOString();
  emit({ type: 'complete', state });
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function trace(state: SessionState, entry: TraceEntry): void {
  state.trace.push(entry);
  state.updatedAt = entry.at;
}

/** Never leak a stack trace or an internal stage name into the interface. */
function friendlyError(error: unknown): string {
  const message = errorMessage(error);
  if (message.includes('GEMINI_API_KEY')) {
    return 'The service is missing its API key, so it cannot generate anything. Whoever set this up needs to add it.';
  }
  if (/quota|rate|429|resource.?exhausted/i.test(message)) {
    return 'The AI service is rate-limiting us right now. Wait a minute and try building again — your answers are saved.';
  }
  if (/timeout|ETIMEDOUT|ECONNRESET|fetch failed/i.test(message)) {
    return 'We lost the connection partway through. Your answers are saved — try building again.';
  }
  return 'Something went wrong while building. Your answers are saved, so you can try again without starting over.';
}
