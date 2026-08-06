/**
 * ROUTER 6 — Audit planner.
 *
 * Defines the scope of the audit from what was actually built, and orders the
 * gates so the blocking ones run first. Deterministic.
 */

import type { Stage, StageContext, StageOutcome } from '../core/contract';
import { addDirectives } from '../core/contract';

export const router6AuditPlanner: Stage = {
  id: 'router-6-audit-planner',
  kind: 'router',
  methodName: 'Router 6 — Planificador de auditoría',
  phaseId: 'build',

  async run({ state }: StageContext): Promise<StageOutcome> {
    const format = state.rawProfile?.preferredFormat || 'both';
    const hasWeb = format === 'web' || format === 'both';
    const hasPdf = format === 'pdf' || format === 'both';

    const scope = [
      ...(hasWeb ? ['accessibility_web', 'performance_lab'] : []),
      ...(hasPdf ? ['document_accessibility'] : []),
      'content',
      'truthfulness',
      'confidentiality',
      'strategy',
    ];

    // Blocking gates first — a truthfulness failure makes performance advice irrelevant.
    const blocking = ['accessibility_web', 'truthfulness', 'confidentiality'].filter((g) =>
      scope.includes(g),
    );

    addDirectives(state, 'agent-7-auditor', [
      `Audit scope for this run: ${scope.join(', ')}.`,
      `Blocking gates: ${blocking.join(', ')}. Report these first.`,
      hasPdf && !hasWeb
        ? 'This person asked for a PDF only. Skip Core Web Vitals entirely and audit document structure, alt text, reading order and declared language instead.'
        : 'Both a website and a printable document were produced; audit both.',
    ]);

    return {
      decision: `Audit scope: ${scope.length} gate(s), ${blocking.length} blocking`,
      reasoning: `Requested format is "${format}".`,
      route: format,
    };
  },
};
