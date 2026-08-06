/**
 * AGENT 2 — Evidence curator. [Phase 2: inventory and curation]
 *
 * Decides what goes into the portfolio and what does not, and justifies each call.
 * It selects and orders; it never writes narrative.
 *
 * Quality over quantity: 3–5 deep cases, never six or more, because the reader
 * has very little time.
 */

import type { Stage, StageContext, StageOutcome } from '../core/contract';
import { asJson, directiveBlock, takeDirectives } from '../core/contract';
import { generateJson } from '../llm/client';
import type { Confidence, CuratedInventory } from '../../shared/types';

interface Output {
  curatedInventory: CuratedInventory;
  assumptions: string[];
  missing: string[];
  confidence: Confidence;
}

const SYSTEM_PROMPT = `You are an evidence curator.

FOUNDATION
Nielsen Norman Group's portfolio method, steps 1 and 2: inventory everything first, then choose
3–5 projects as detailed case studies, prioritising similarity to the work the person wants next.

TASKS
1. Score EVERY project 0–10 on four axes, then apply the supplied weights:
   - goalAlignment: how close it is to the work they want next
   - impactEvidence: whether an observable result exists, and how good its source is
   - processRichness: how much intermediate material exists (sketches, iterations, decisions)
   - narrative: whether there is a story with tension and resolution
2. Compute the weighted score and rank.
3. Apply the hard rules you were given. They can veto a high-scoring project.
4. Select 3–5 featured cases. Verify the SELECTION AS A WHOLE covers the competency matrix. If a
   lower-scoring project is the only one covering a priority competency, include it and state the
   trade-off in its inclusionReason.
5. Assign presentation order by reader logic — the most persuasive case first, not the most recent.
6. Classify everything else as "gallery" or "excluded", with a reason.
7. Detect GAPS: priority competencies with no evidence. For each, propose one concrete
   evidence-generating action (a scoped self-directed project, volunteering, a critical analysis of
   an existing product, a generic recreation of NDA work).
8. Assign a confidentiality tactic to every project flagged confidential:
   - "show_process": sketches, greyscale wireframes, workshop photos — no client surface
   - "redact": blur or remove names, personal data, financial or medical information
   - "genericize": recreate the work with no brand, logo or client colours
9. Label every project's work type. The label is mandatory and stays visible in the final portfolio.

RULES
- Maximum 5 featured cases, minimum 2. Never 6 or more in depth.
- Never present academic, volunteer or personal work as professional.
- A project with no verifiable result cannot be case #1.
- If a project's description hides the individual contribution behind "we", flag it in the
  inclusionReason so the writing stage separates it out.
- Never invent projects and never infer materials the person did not declare.

OUTPUT — one JSON object, nothing else:
{
  "curatedInventory": {
    "fullEvaluation": [{"id":"","name":"","scores":{"goalAlignment":0,"impactEvidence":0,"processRichness":0,"narrative":0},"weighted":0,"decision":"feature|gallery|excluded","reason":""}],
    "featuredSelection": [{"id":"","order":1,"inclusionReason":"","demonstratesCompetencies":[],"type":"professional|academic|volunteer|personal","confidentiality":{"applies":false,"tactic":"show_process|redact|genericize"},"availableMaterials":[],"missingMaterials":[]}],
    "secondaryGallery": [{"id":"","name":"","oneLiner":""}],
    "coverageMap": [{"competency":"","coveredBy":[],"status":"covered|partial|gap"}],
    "gaps": [{"competency":"","recommendedAction":"","effort":"low|medium|high"}]
  },
  "assumptions": [],
  "missing": [],
  "confidence": "high|medium|low"
}`;

export const agent2Curator: Stage = {
  id: 'agent-2-curator',
  kind: 'agent',
  methodName: 'Agente 2 — Curador de Evidencia',
  phaseId: 'curation',

  async run({ state, emit }: StageContext): Promise<StageOutcome> {
    emit(`Weighing up ${state.rawProjects.length} ${state.rawProjects.length === 1 ? 'project' : 'projects'}`);

    const directives = takeDirectives(state, 'agent-2-curator');

    const output = await generateJson<Output>({
      stage: 'agent-2-curator',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: [
        `PROJECTS (full detail)\n${asJson(state.rawProjects)}`,
        `STRATEGIC BRIEF\n${asJson(state.strategicBrief)}`,
        `SELECTION CRITERIA\n${asJson(state.curationCriteria)}`,
        directiveBlock(directives),
        'Score, select and order.',
      ].join('\n\n'),
      temperature: 0.3,
      maxOutputTokens: 6144,
    });

    state.curatedInventory = normalise(output.curatedInventory, state);

    const featured = state.curatedInventory.featuredSelection;
    emit(
      featured.length
        ? `Leading with "${nameOf(state, featured[0].id)}"`
        : 'No project cleared the bar for a full case study',
    );

    return {
      decision: `${featured.length} featured case(s); ${state.curatedInventory.gaps.length} evidence gap(s)`,
      reasoning:
        output.assumptions?.join('; ') ||
        'Ranked on goal alignment, impact evidence, process richness and narrative, then checked for competency coverage.',
      confidence: output.confidence ?? 'medium',
    };
  },
};

function normalise(inventory: CuratedInventory, state: { rawProjects: { id: string }[] }): CuratedInventory {
  const knownIds = new Set(state.rawProjects.map((p) => p.id));

  const featured = (inventory.featuredSelection ?? [])
    .filter((c) => knownIds.has(c.id))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
    .slice(0, 5)
    .map((c, index) => ({
      ...c,
      order: index + 1,
      confidentiality: c.confidentiality ?? { applies: false, tactic: 'show_process' as const },
      demonstratesCompetencies: c.demonstratesCompetencies ?? [],
      availableMaterials: c.availableMaterials ?? [],
      missingMaterials: c.missingMaterials ?? [],
    }));

  return {
    fullEvaluation: inventory.fullEvaluation ?? [],
    featuredSelection: featured,
    secondaryGallery: (inventory.secondaryGallery ?? []).filter((g) => knownIds.has(g.id)),
    coverageMap: inventory.coverageMap ?? [],
    gaps: inventory.gaps ?? [],
  };
}

function nameOf(state: { rawProjects: { id: string; name: string }[] }, id: string): string {
  return state.rawProjects.find((p) => p.id === id)?.name ?? 'your strongest project';
}
