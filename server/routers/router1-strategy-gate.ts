/**
 * ROUTER 1 — Strategy gate.
 *
 * Judges the framing before curation is allowed to start, and translates the
 * approved brief into operational selection rules for the curator.
 *
 * Model-assisted, because the central check is a judgement call: the swap test.
 * Substitute the person's name for any peer in the same field — if the thesis is
 * still true, it says nothing and has to be rewritten.
 */

import type { Stage, StageContext, StageOutcome } from '../core/contract';
import { asJson } from '../core/contract';
import { generateJson } from '../llm/client';

const MAX_REFRAMES = 2;

interface Output {
  route: 'continue' | 'reformulate_thesis' | 'reformulate_takeaways' | 'split_variants';
  swapTestPasses: boolean;
  swapTestReasoning: string;
  unsupportedTakeaways: string[];
  corrections: string[];
  curationCriteria: {
    weights: { goalAlignment: number; impactEvidence: number; processRichness: number; narrative: number };
    hardRules: string[];
    mandatoryCoverage: string[];
  };
  reasoning: string;
}

const SYSTEM_PROMPT = `You are a gate. You do not converse with the user and you do not write content.
You evaluate a strategic brief and decide a route.

CHECKS
V1. THESIS SPECIFICITY. Apply the swap test: replace this person's name with any colleague in the
    same field. If the sentence is still true, the thesis FAILS. Generic virtue claims
    ("passionate", "results-driven", "detail-oriented") fail automatically.
V2. SUPPORTABILITY. Each takeaway must be backed by at least one of the supplied projects. List
    any that are not.
V3. COVERAGE. Does the competency matrix have at least 3 entries with evidenceAvailable = "yes"?
V4. GOAL UNIQUENESS. If recommendedVariants has more than one entry, the run should be split.

ROUTE
- V1 fails -> "reformulate_thesis"
- V2 fails for 2 or more takeaways -> "reformulate_takeaways"
- V3 fails -> "continue", but say so in reasoning (informative, not blocking)
- V4 active -> "split_variants"
- Otherwise -> "continue"

SELECTION CRITERIA YOU MUST PRODUCE
Translate the brief into operational selection rules. Weights must sum to 1. Example hard rules:
"Prefer projects where this person defined the problem, not only executed it." / "Penalise projects
with no observable result." / "Require at least one project demonstrating [priority-1 competency]."

You never rewrite the thesis or the takeaways yourself. If they need changing you say precisely
what is wrong and what the rewrite must achieve.

OUTPUT — one JSON object, nothing else:
{
  "route": "continue|reformulate_thesis|reformulate_takeaways|split_variants",
  "swapTestPasses": true,
  "swapTestReasoning": "",
  "unsupportedTakeaways": [],
  "corrections": [],
  "curationCriteria": {"weights":{"goalAlignment":0.4,"impactEvidence":0.25,"processRichness":0.2,"narrative":0.15},"hardRules":[],"mandatoryCoverage":[]},
  "reasoning": ""
}`;

export const router1StrategyGate: Stage = {
  id: 'router-1-strategy-gate',
  kind: 'router',
  methodName: 'Router 1 — Compuerta estratégica',
  phaseId: 'framing',

  async run({ state, emit }: StageContext): Promise<StageOutcome> {
    const attempts = state.flags.briefRetries;

    const output = await generateJson<Output>({
      stage: 'router-1-strategy-gate',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: [
        `STRATEGIC BRIEF\n${asJson(state.strategicBrief)}`,
        `PROJECT METADATA\n${asJson(
          state.rawProjects.map((p) => ({
            id: p.id,
            name: p.name,
            problem: p.problem,
            ownRole: p.ownRole,
            outcome: p.outcome,
            metrics: p.metrics,
          })),
        )}`,
        'Evaluate and route.',
      ].join('\n\n'),
      temperature: 0.2,
      maxOutputTokens: 3072,
    });

    state.curationCriteria = normaliseCriteria(output.curationCriteria);

    const needsRework =
      output.route === 'reformulate_thesis' || output.route === 'reformulate_takeaways';

    // Cap the loop: a brief that will not converge is not worth three model calls.
    if (needsRework && attempts < MAX_REFRAMES) {
      state.flags.briefRetries = attempts + 1;
      emit('Sharpening the focus');

      const instructions =
        output.route === 'reformulate_thesis'
          ? [
              `The thesis fails the swap test. ${output.swapTestReasoning}`,
              'Rewrite it so it could only be signed by this person, using the specific evidence they actually have.',
              ...output.corrections,
            ]
          : [
              `These takeaways are not supported by the declared evidence: ${output.unsupportedTakeaways.join('; ')}.`,
              'Replace them with claims the projects can actually back, and move anything aspirational into the aspirational field.',
              ...output.corrections,
            ];

      return {
        decision: `Sent the framing back: ${output.route.replace(/_/g, ' ')}`,
        reasoning: output.reasoning || output.swapTestReasoning,
        route: output.route,
        retry: {
          stageId: 'agent-1-strategist',
          instructions,
          reason: output.route,
        },
      };
    }

    if (output.route === 'split_variants' && state.strategicBrief?.recommendedVariants?.length) {
      // The method's rule is one audience per portfolio. We build the first variant and say so
      // rather than silently averaging two audiences into a portfolio that persuades neither.
      const [first, ...rest] = state.strategicBrief.recommendedVariants;
      return {
        decision: 'Building one variant',
        reasoning: `Multiple materially different goals detected; building for "${first}".`,
        route: 'split_variants',
        notices: [
          {
            kind: 'quality',
            message:
              `You are aiming at more than one kind of role. A portfolio that tries to cover both persuades ` +
              `neither, so we are building for "${first}". When you want the other one — ${rest.join(', ')} — ` +
              'start again and say so up front; most of your answers will carry over.',
          },
        ],
      };
    }

    if (!output.swapTestPasses) {
      state.flags.weakCoverage = true;
    }

    return {
      decision: 'Framing approved',
      reasoning: output.reasoning || 'Thesis is specific and takeaways are supportable.',
      route: 'continue',
    };
  },
};

function normaliseCriteria(criteria: Output['curationCriteria']) {
  const weights = criteria?.weights ?? {
    goalAlignment: 0.4,
    impactEvidence: 0.25,
    processRichness: 0.2,
    narrative: 0.15,
  };
  const total = Object.values(weights).reduce((sum, w) => sum + (Number(w) || 0), 0) || 1;
  return {
    weights: {
      goalAlignment: weights.goalAlignment / total,
      impactEvidence: weights.impactEvidence / total,
      processRichness: weights.processRichness / total,
      narrative: weights.narrative / total,
    },
    hardRules: criteria?.hardRules ?? [],
    mandatoryCoverage: criteria?.mandatoryCoverage ?? [],
  };
}
