/**
 * AGENT 1 — Audience strategist. [Phase 1: strategic framing]
 *
 * Turns a person and their goal into the framing that governs every later
 * decision in the portfolio. This is the highest-leverage decision in the system:
 * without it, curation has no criterion to select against.
 */

import type { Stage, StageContext, StageOutcome } from '../core/contract';
import { asJson, directiveBlock, takeDirectives } from '../core/contract';
import { generateJson } from '../llm/client';
import type { Confidence, StrategicBrief } from '../../shared/types';

interface Output {
  strategicBrief: StrategicBrief;
  assumptions: string[];
  missing: string[];
  confidence: Confidence;
}

const SYSTEM_PROMPT = `You are a professional communication strategist.

FOUNDATION
You work from Nielsen Norman Group's survey of 204 hiring-responsible professionals, and from
the Double Diamond principle of defining the problem properly before solving it.

Central principle: someone reviewing a portfolio is making a business decision under
uncertainty — "will this person solve my problem?". They are looking for evidence of
reasoning and of impact, not accumulated aesthetics.

TASKS
1. Identify the primary and secondary reader. Be specific: not "recruiters" but
   "product design manager at a 50-200 person software company in Latin America".
2. Infer what that reader evaluates, and in what order. If reference postings exist, pull the
   required competencies and their literal vocabulary out of them.
3. Build the target competency matrix, prioritised, maximum 6 entries.
4. Formulate the THESIS: "I am the person who [differentiating capability] for [type of
   problem or organisation], demonstrated by [type of evidence this person actually has]".
5. Derive 3 TAKEAWAYS: what the reader should remember ten minutes after closing the tab.
6. Compute the sector formality index (1 = highly expressive, 5 = highly conservative) and justify it.
7. Declare positioning risks (e.g. experience thin for the level targeted, field change with no
   bridging evidence).

RULES
- The thesis must be FALSIFIABLE. Apply the swap test: if any peer in the same field could sign
  it, rewrite it. Banned constructions: "passionate about", "results-oriented", "creative and
  proactive", "detail-oriented".
- Takeaways must be supportable by the evidence actually declared in the projects. Anything that
  is not goes in "aspirational", never in takeaways.
- The target sector's vocabulary beats the person's own vocabulary.
- If you detect more than one materially different goal, do NOT average them: list the variants
  that would be needed in recommendedVariants.
- Never promise hiring outcomes in any field.
- Never assert anything about this person that is not present in the input.

OUTPUT — one JSON object, nothing else:
{
  "strategicBrief": {
    "primaryReader": {"profile":"", "evaluates":[], "timeSpent":""},
    "secondaryReader": {"profile":"", "evaluates":[]},
    "portfolioGoal": "",
    "thesis": "",
    "takeaways": ["","",""],
    "competencyMatrix": [{"competency":"","priority":1,"evidenceAvailable":"yes|partial|no","sectorVocabulary":""}],
    "formalityIndex": 3,
    "formalityRationale": "",
    "targetTone": "",
    "keyVocabulary": [],
    "positioningRisks": [],
    "recommendedVariants": [],
    "aspirational": []
  },
  "assumptions": [],
  "missing": [],
  "confidence": "high|medium|low"
}`;

export const agent1Strategist: Stage = {
  id: 'agent-1-strategist',
  kind: 'agent',
  methodName: 'Agente 1 — Estratega de Audiencia',
  phaseId: 'framing',

  async run({ state, emit }: StageContext): Promise<StageOutcome> {
    emit('Working out who this needs to convince');

    const directives = takeDirectives(state, 'agent-1-strategist');

    // Context control: the strategist sees project metadata, not full project detail.
    const projectMetadata = state.rawProjects.map((p) => ({
      id: p.id,
      name: p.name,
      year: p.year,
      type: p.type,
      problem: p.problem,
      outcomeExists: Boolean(p.outcome),
      hasMetrics: p.metrics.length > 0,
      materialCount: p.materials.length,
      confidential: p.confidential,
    }));

    const output = await generateJson<Output>({
      stage: 'agent-1-strategist',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: [
        `PROFILE\n${asJson(state.rawProfile)}`,
        `PROJECT METADATA (no detail — you are framing, not curating)\n${asJson(projectMetadata)}`,
        `REFERENCE POSTINGS\n${asJson(state.rawProfile?.referencePostings ?? [])}`,
        directiveBlock(directives),
        'Produce the strategic brief.',
      ].join('\n\n'),
      temperature: 0.4,
      maxOutputTokens: 4096,
    });

    state.strategicBrief = normalise(output.strategicBrief);
    emit(`Focus: ${truncate(state.strategicBrief.thesis, 90)}`);

    return {
      decision: `Thesis set; primary reader "${state.strategicBrief.primaryReader.profile}"; formality ${state.strategicBrief.formalityIndex}/5`,
      reasoning:
        output.assumptions?.join('; ') ||
        'Derived from the stated goal, the target role and the evidence declared in the interview.',
      confidence: output.confidence ?? 'medium',
    };
  },
};

function normalise(brief: StrategicBrief): StrategicBrief {
  return {
    ...brief,
    takeaways: (brief.takeaways ?? []).filter(Boolean).slice(0, 3),
    competencyMatrix: (brief.competencyMatrix ?? []).slice(0, 6),
    formalityIndex: clamp(brief.formalityIndex ?? 3, 1, 5),
    keyVocabulary: brief.keyVocabulary ?? [],
    positioningRisks: brief.positioningRisks ?? [],
    recommendedVariants: brief.recommendedVariants ?? [],
    aspirational: brief.aspirational ?? [],
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function truncate(text: string, max: number): string {
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
