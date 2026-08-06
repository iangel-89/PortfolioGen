/**
 * ROUTER 0 — Intake gate.
 *
 * Decides whether there is enough to start. Fully deterministic: the sufficiency
 * criteria in the method are a checklist, and a checklist does not need a model.
 *
 * Common rule for every router: a router never rewrites content. It selects,
 * filters, chooses a route and writes instructions. When content has to change,
 * it hands control back to the stage that owns it.
 */

import type { Stage, StageContext, StageOutcome } from '../core/contract';
import { usableProjects } from '../agents/agent0-interviewer';
import type { UserNotice } from '../../shared/types';

export const router0IntakeGate: Stage = {
  id: 'router-0-intake-gate',
  kind: 'router',
  methodName: 'Router 0 — Compuerta de ingesta',
  phaseId: 'framing',

  async run({ state }: StageContext): Promise<StageOutcome> {
    const profile = state.rawProfile;
    const usable = usableProjects(state.rawProjects);
    const notices: UserNotice[] = [];

    const hasProfession = Boolean(profile?.profession);
    const hasGoal = Boolean(profile?.goal);

    if (!hasProfession || !hasGoal || state.rawProjects.length === 0) {
      return {
        decision: 'Cannot start',
        reasoning: 'Profession, goal or any project is missing.',
        route: 'back_to_intake',
        escalate:
          "We don't have enough to work with yet. Tell me what you do and walk me through at least " +
          'one piece of work — what the problem was, what you did, and what happened.',
      };
    }

    // Fewer than two usable projects switches the whole run to the capabilities structure.
    if (usable.length < 2) {
      state.mode = 'minimal_evidence';
      state.flags.insufficientEvidence = true;
      notices.push({
        kind: 'evidence',
        message:
          'You have one project we can build a full case study around. Rather than stretch it, we are ' +
          'building a capabilities piece: what you can do and what backs that up, plus three specific ' +
          'projects that would give you the evidence you are missing.',
      });
    } else {
      state.mode = 'standard';
    }

    if (state.flags.regulatedProfession) {
      notices.push({
        kind: 'legal',
        message:
          'Your field has rules on professional advertising and client confidentiality that differ by ' +
          'jurisdiction. Check the finished portfolio against your professional body’s guidance before ' +
          'publishing. We cannot give legal advice.',
      });
    }

    if (state.flags.nda) {
      notices.push({
        kind: 'confidentiality',
        message:
          'Confidential work is handled by showing your process instead of the client’s material, removing ' +
          'identifying details, or describing the work generically. What is safe to publish is ultimately your call.',
      });
    }

    return {
      decision: state.mode === 'minimal_evidence' ? 'Continue in capabilities mode' : 'Continue',
      reasoning: `${usable.length} usable project(s) of ${state.rawProjects.length} captured.`,
      route: state.mode === 'minimal_evidence' ? 'minimal_evidence' : 'continue',
      notices,
    };
  },
};
