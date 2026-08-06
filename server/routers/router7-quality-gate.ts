/**
 * ROUTER 7 — Quality gate.
 *
 * Decides whether the work ships or goes back, and caps the retry count so the
 * pipeline cannot loop forever.
 *
 * Partial-delivery rule from the method: after two retries, if only warning gates
 * are still failing, ship it with the outstanding improvements written down.
 * A good portfolio delivered beats a perfect portfolio never delivered. If a
 * BLOCKING gate is still failing, nothing ships — it goes to the user in plain
 * language instead.
 */

import type { Stage, StageContext, StageOutcome } from '../core/contract';
import type { GateFinding } from '../../shared/types';

const MAX_RETRIES = 2;

/** Where a fix has to start. Earlier stages first: everything downstream re-runs anyway. */
const STAGE_ORDER = [
  'agent-3-narrator',
  'agent-4-architect',
  'agent-5-art-director',
  'agent-6-builder',
];

export const router7QualityGate: Stage = {
  id: 'router-7-quality-gate',
  kind: 'router',
  methodName: 'Router 7 — Compuerta de calidad',
  phaseId: 'review',

  async run({ state, emit }: StageContext): Promise<StageOutcome> {
    const report = state.qualityReport;
    if (!report) {
      return { decision: 'No report', reasoning: 'Nothing to gate on.', route: 'deliver' };
    }

    if (report.verdict !== 'rejected') {
      return {
        decision: 'Approved for delivery',
        reasoning:
          report.verdict === 'approved'
            ? 'Every gate passed.'
            : 'Blocking gates passed; warnings recorded in the improvement plan.',
        route: 'deliver',
      };
    }

    const attempts = state.flags.qaRetries;
    const failingGates = report.gates.filter((g) => g.status === 'fail');
    const blockingFailures = failingGates.filter((g) => g.blocking);

    if (attempts >= MAX_RETRIES) {
      if (!blockingFailures.length) {
        return {
          decision: 'Partial delivery',
          reasoning: 'Only warning gates remain after two rounds; shipping with the improvement plan.',
          route: 'deliver',
        };
      }
      const escalation = escalationMessage(blockingFailures.flatMap((g) => g.findings));
      state.escalation = escalation;
      return {
        decision: 'Escalated to the user',
        reasoning: `${blockingFailures.length} blocking gate(s) unresolved after ${MAX_RETRIES} rounds.`,
        route: 'escalate',
        escalate: escalation,
      };
    }

    // Group the findings by the stage that has to act on them, then jump back to
    // the earliest one — everything after it re-runs on the corrected input.
    const findings = failingGates.flatMap((g) => g.findings ?? []);
    const byStage = new Map<string, GateFinding[]>();
    for (const finding of findings) {
      const stage = STAGE_ORDER.includes(finding.responsibleStage)
        ? finding.responsibleStage
        : 'agent-6-builder';
      byStage.set(stage, [...(byStage.get(stage) ?? []), finding]);
    }

    for (const [stageId, stageFindings] of byStage) {
      state.directives[stageId] = [
        ...(state.directives[stageId] ?? []),
        ...stageFindings.map((f) => `${f.criterion}: ${f.detail} — ${f.correction}`),
      ];
    }

    const earliest = STAGE_ORDER.find((id) => byStage.has(id)) ?? 'agent-6-builder';
    state.flags.qaRetries = attempts + 1;
    emit('Fixing what the checks turned up');

    return {
      decision: `Directed retry from ${earliest}`,
      reasoning: `${findings.length} finding(s) across ${byStage.size} stage(s); attempt ${attempts + 1} of ${MAX_RETRIES}.`,
      route: 'directed_retry',
      retry: {
        stageId: earliest,
        // Directives were written into state above; the stage picks up its own.
        instructions: [],
        reason: 'quality',
      },
    };
  },
};

function escalationMessage(findings: GateFinding[]): string {
  const lines = [
    'We could not get one part of this to a standard we would put your name on, and it needs a decision from you.',
    '',
  ];
  for (const finding of findings.slice(0, 6)) {
    lines.push(`- ${finding.detail}`);
  }
  lines.push(
    '',
    'Everything else is finished and downloadable. Tell us how you want to handle the point above — ' +
      'or start again and give us the missing piece — and we will rebuild that part only.',
  );
  return lines.join('\n');
}
