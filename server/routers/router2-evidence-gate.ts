/**
 * ROUTER 2 — Evidence gate.
 *
 * Sets the operating mode for the rest of the run from the quantity and quality
 * of the curated evidence. Deterministic: the method states this as counts.
 *
 * Also performs context reduction — the writing stage receives only the selected
 * cases, never the full inventory, because discarded material contaminates the
 * writing.
 */

import type { Stage, StageContext, StageOutcome } from '../core/contract';
import type { UserNotice } from '../../shared/types';

const MAX_FEATURED = 5;

export const router2EvidenceGate: Stage = {
  id: 'router-2-evidence-gate',
  kind: 'router',
  methodName: 'Router 2 — Compuerta de evidencia',
  phaseId: 'curation',

  async run({ state, emit }: StageContext): Promise<StageOutcome> {
    const inventory = state.curatedInventory;
    const featured = inventory?.featuredSelection ?? [];
    const notices: UserNotice[] = [];

    if (featured.length > MAX_FEATURED) {
      // Curation is the stage that owns the selection; the router only asks for a trim.
      return {
        decision: 'Selection too broad',
        reasoning: `${featured.length} featured cases exceeds the maximum of ${MAX_FEATURED}.`,
        route: 'trim',
        retry: {
          stageId: 'agent-2-curator',
          instructions: [
            `Cut the featured selection to at most ${MAX_FEATURED} cases.`,
            'Drop the lowest weighted scores first, unless one of them is the only cover for a priority-1 competency.',
            'Move everything you cut into the secondary gallery rather than excluding it outright.',
          ],
          reason: 'too_many_cases',
        },
      };
    }

    const criticalGaps = (inventory?.gaps ?? []).filter((gap) => {
      const priority = state.strategicBrief?.competencyMatrix?.find(
        (c) => c.competency === gap.competency,
      )?.priority;
      return priority !== undefined && priority <= 2;
    });

    if (criticalGaps.length) {
      state.flags.weakCoverage = true;
      notices.push({
        kind: 'evidence',
        message:
          `The work you have does not yet show ${criticalGaps
            .map((g) => g.competency)
            .join(' or ')}, and that matters for what you are aiming at. ` +
          'We will build with what you have and include a concrete plan for closing that gap.',
      });
    }

    if (featured.length < 2) {
      state.mode = 'minimal_evidence';
      state.flags.insufficientEvidence = true;
      notices.push({
        kind: 'evidence',
        message:
          'There is enough here for one solid case study rather than a set. We are building a capabilities ' +
          'piece around it: what you can do, what backs that up, and three scoped projects that would ' +
          'give you the rest.',
      });
      emit('Building a capabilities piece around your strongest work');
      return {
        decision: 'Switched to capabilities mode',
        reasoning: `${featured.length} featured case(s) is below the two-case minimum for a case-led portfolio.`,
        route: 'minimal_evidence',
        notices,
      };
    }

    if (featured.length === 2) {
      // Two cases still work, but each has to carry more weight.
      state.directives['agent-3-narrator'] = [
        ...(state.directives['agent-3-narrator'] ?? []),
        'This portfolio has only two cases, so both are load-bearing. Write both at featured length ' +
          '(500-800 words) and go deeper on reasoning and discarded paths than you otherwise would.',
      ];
    }

    emit(`Leading with ${featured.length} case ${featured.length === 1 ? 'study' : 'studies'}`);

    return {
      decision: `Standard mode with ${featured.length} case(s)`,
      reasoning: criticalGaps.length
        ? `Coverage gap on ${criticalGaps.map((g) => g.competency).join(', ')}; proceeding with an evidence plan.`
        : 'Selection covers the priority competencies.',
      route: 'continue',
      notices,
    };
  },
};
