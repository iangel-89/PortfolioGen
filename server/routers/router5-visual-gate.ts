/**
 * ROUTER 5 — Visual gate.
 *
 * Verifies the design system before anything is built, because correcting a token
 * is cheap and correcting a finished site is not.
 *
 * Entirely deterministic. Contrast and typography rules are arithmetic, and the
 * art-direction stage does not get to grade its own work.
 *
 * After two failed attempts the palette is repaired in code rather than blocking
 * delivery: WCAG AA is non-negotiable, but the way to honour that is to ship a
 * compliant colour, not to ship nothing.
 */

import type { Stage, StageContext, StageOutcome } from '../core/contract';
import { forceContrast, verifyTokenContrast, verifyTypography } from '../checks/contrast';
import type { ColorTokens } from '../../shared/types';

const MAX_RETURNS = 2;

export const router5VisualGate: Stage = {
  id: 'router-5-visual-gate',
  kind: 'router',
  methodName: 'Router 5 — Compuerta visual',
  phaseId: 'design',

  async run({ state, emit }: StageContext): Promise<StageOutcome> {
    const system = state.visualSystem;
    if (!system) {
      return { decision: 'No visual system', reasoning: 'Nothing to verify.', route: 'continue' };
    }

    const contrast = verifyTokenContrast(system.tokens);
    const typography = verifyTypography(system.tokens);
    system.contrastChecks = contrast;

    const failingContrast = contrast.filter((c) => !c.passes);
    const failingType = typography.filter((t) => !t.passes);
    const attempts = state.flags.visualRetries;

    if (!failingContrast.length && !failingType.length) {
      return {
        decision: 'Visual system approved',
        reasoning: `All ${contrast.length} colour pairs and ${typography.length} typography rules pass.`,
        route: 'continue',
      };
    }

    if (attempts < MAX_RETURNS) {
      state.flags.visualRetries = attempts + 1;
      emit('Adjusting colours for readability');

      const instructions = [
        ...failingContrast.map(
          (c) =>
            `Contrast failure — "${c.pair}": ${c.foreground} on ${c.background} measures ${c.ratio}:1 and ` +
            `must reach ${c.required}:1. Change the foreground, the background, or both.`,
        ),
        ...failingType.map(
          (t) => `Typography rule "${t.rule}" is ${t.actual} and must be ${t.required}.`,
        ),
        'Keep the archetype and the overall character. Fix the measurements, not the concept.',
      ];

      return {
        decision: `${failingContrast.length} contrast and ${failingType.length} typography failure(s)`,
        reasoning: 'Sent back with the exact failing pairs.',
        route: 'return_to_design',
        retry: { stageId: 'agent-5-art-director', instructions, reason: 'wcag_thresholds' },
      };
    }

    // Retry budget spent. Repair the palette in code so an accessible page still ships.
    const repaired = { ...system.tokens.color };
    for (const check of failingContrast) {
      const key = foregroundKeyFor(check.pair);
      if (!key) continue;
      repaired[key] = forceContrast(check.foreground, check.background, check.required);
    }
    system.tokens.color = repaired;
    system.contrastChecks = verifyTokenContrast(system.tokens);

    const stillFailing = system.contrastChecks.filter((c) => !c.passes);
    emit('Corrected the colours automatically');

    return {
      decision: 'Palette repaired automatically',
      reasoning:
        `Two rounds did not converge, so ${failingContrast.length} colour(s) were darkened or lightened ` +
        `until they cleared the threshold. ${stillFailing.length} pair(s) remain out of range.`,
      route: 'continue',
      notices: stillFailing.length
        ? [
            {
              kind: 'quality',
              message:
                'We adjusted a couple of colours so the text stays readable for everyone. The palette is ' +
                'slightly different from the first draft, and that trade is deliberate.',
            },
          ]
        : [],
    };
  },
};

/** Maps a pair label from the contrast checker back to the token it should adjust. */
function foregroundKeyFor(pair: string): keyof ColorTokens | null {
  if (pair.startsWith('body text')) return 'textPrimary';
  if (pair.startsWith('secondary text')) return 'textSecondary';
  if (pair.startsWith('accent text')) return 'accent';
  if (pair.startsWith('text on accent')) return 'accentText';
  if (pair.startsWith('border')) return 'border';
  if (pair.startsWith('accent as interface')) return 'accent';
  return null;
}
