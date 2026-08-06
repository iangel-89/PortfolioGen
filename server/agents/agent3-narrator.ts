/**
 * AGENT 3 — Case narrator. [Phase 3: narrative construction]
 *
 * Turns raw project data into a complete, scannable, verifiable case study that
 * shows reasoning and impact rather than just the finished product.
 *
 * Parallelised: one model instance per case, each told what the other cases lead
 * with so the set does not repeat itself. Cross-case tone consistency is then
 * verified by the integrity gate, which sends specifics back here if it drifts.
 */

import type { Stage, StageContext, StageOutcome } from '../core/contract';
import { asJson, directiveBlock, takeDirectives } from '../core/contract';
import { generateJson } from '../llm/client';
import type { CaseNarrative, Confidence, RawProject, SelectedCase } from '../../shared/types';

interface Output {
  case: CaseNarrative;
  missing: { block: number; suggestedQuestion: string }[];
  confidence: Confidence;
}

const SYSTEM_PROMPT = `You write professional case studies.

FOUNDATION
You apply the seven-element case study structure documented by Nielsen Norman Group, derived from
what 204 hiring-responsible professionals said they look for. You use STAR (Situation, Task,
Action, Result) for the scannable summary at the top.

The finding that governs your work: hiring people want to see the process, not only the finished
product. They want to know what did NOT make it into the work and why, as much as what did.

MANDATORY BLOCK STRUCTURE (exactly these seven, in this order, numbered 1-7)
  1. THE PROBLEM OR HYPOTHESIS — what was wrong and what was believed to be causing it
  2. ROLE AND COLLABORATION — what this person did, with whom, in what team structure
  3. HOW THE SOLUTION WAS REACHED — the reasoning, the research, the decisions
  4. HOW THE SOLUTION SOLVED THE PROBLEM — the mechanism, not just a description
  5. CHALLENGES AND DISCARDED PATHS — what was tried and did not work, and why
  6. EFFECT ON USERS AND ON THE BUSINESS — impact, with its evidence level stated
  7. WHAT THEY LEARNED — a concrete reflection, not a generic one

Plus, above the blocks: an impact headline (one sentence, the strongest verifiable result) and a
STAR summary of 3-4 lines.

WRITING RULES
- First person singular for their own actions. The team is credited explicitly:
  "the team defined X; I designed Y".
- One heading roughly every 150 words. Paragraphs of at most 4 lines. Key information first.
- Length: featured case 500-800 words. Secondary case 250-400.
- No filler: "in today's world", "now more than ever", "passionate about".
- No self-evaluating adjectives applied to their own work ("excellent", "innovative",
  "successful"). The result speaks; the adjective does not.
- Tone calibrated to the formality index supplied. If a writing sample is supplied, match its
  rhythm and vocabulary without copying its phrases.

TRUTHFULNESS RULE — INVIOLABLE
- Every numeric claim carries its source label.
- If the source is "unsourced": REWRITE the claim in qualitative terms with no number.
  "increased sales 40%" (unsourced) becomes "the client reported a rise in sales after launch",
  or is deleted if not even that is supportable.
- NEVER infer, estimate or round up a number the person did not give.
- NEVER invent quotes from users, clients or colleagues.
- If a block has insufficient information, do NOT pad it: shorten it honestly and write a
  concrete question for the person into "missing".

CONFIDENTIALITY RULE
Apply the tactic you were given:
- "show_process": do not describe the final interface or client data; centre the narrative on
  method and decisions.
- "redact": replace names with descriptors ("a regional fintech of roughly 200 people").
- "genericize": remove every brand reference, identifiable sector and proper noun.

VISUAL SCRIPT
For each block, specify which image accompanies it, what it must show, and its alt text written
out properly — not "project image", but a real functional description. If the material does not
exist, mark it "to_capture" with an instruction the person can act on.

OUTPUT — one JSON object, nothing else:
{
  "case": {
    "id":"", "title":"", "impactHeadline":"",
    "starSummary": {"situation":"","task":"","action":"","result":""},
    "blocks": [{"n":1,"heading":"","text":"","words":0}],
    "assertions": [{"text":"","kind":"numeric|qualitative","source":"measured|estimated|client_reported|unsourced","actionApplied":"kept|rewritten_qualitative|removed"}],
    "visualScript": [{"block":1,"kind":"sketch|wireframe|process_photo|before_after|final_screen|diagram","mustShow":"","altText":"","status":"available|to_capture","userInstruction":""}],
    "workType":"professional|academic|volunteer|personal",
    "confidentialityApplied":"",
    "totalWords":0
  },
  "missing": [{"block":0,"suggestedQuestion":""}],
  "confidence":"high|medium|low"
}`;

export const agent3Narrator: Stage = {
  id: 'agent-3-narrator',
  kind: 'agent',
  methodName: 'Agente 3 — Narrador de Casos',
  phaseId: 'writing',

  async run({ state, emit }: StageContext): Promise<StageOutcome> {
    const selection = state.curatedInventory?.featuredSelection ?? [];
    if (!selection.length) {
      state.caseNarratives = [];
      return {
        decision: 'No case studies written',
        reasoning: 'Curation returned no featured selection.',
        confidence: 'low',
      };
    }

    const directives = takeDirectives(state, 'agent-3-narrator');
    emit(`Writing ${selection.length} case ${selection.length === 1 ? 'study' : 'studies'}`);

    // Each writer sees the other cases' headlines so the set does not repeat itself.
    const siblingHeadlines = selection.map((s) => nameOf(state, s.id));

    const results = await Promise.all(
      selection.map((selected) => writeOne(state, selected, siblingHeadlines, directives)),
    );

    state.caseNarratives = results
      .map((r, index) => normalise(r.case, selection[index], state))
      .filter((c): c is CaseNarrative => Boolean(c));

    const rewritten = state.caseNarratives.flatMap((c) =>
      c.assertions.filter((a) => a.actionApplied !== 'kept'),
    );
    if (rewritten.length) {
      emit(`Rewrote ${rewritten.length} claim(s) that had no source behind them`);
    }

    const toCapture = state.caseNarratives.flatMap((c) =>
      c.visualScript.filter((v) => v.status === 'to_capture'),
    );

    return {
      decision: `${state.caseNarratives.length} case(s) written; ${toCapture.length} image(s) still to capture`,
      reasoning:
        'Seven-element structure per case with a STAR summary; every numeric claim carries a declared source.',
      confidence: worstConfidence(results.map((r) => r.confidence ?? 'medium')),
    };
  },
};

async function writeOne(
  state: StageContext['state'],
  selected: SelectedCase,
  siblingHeadlines: string[],
  directives: string[],
): Promise<Output> {
  const project = state.rawProjects.find((p) => p.id === selected.id);
  const isLead = selected.order === 1;

  return generateJson<Output>({
    stage: 'agent-3-narrator',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: [
      `PROJECT\n${asJson(project)}`,
      `CURATION NOTES FOR THIS CASE\n${asJson(selected)}`,
      `STRATEGIC BRIEF\n${asJson(state.strategicBrief)}`,
      `CONFIDENTIALITY TACTIC: ${
        selected.confidentiality?.applies ? selected.confidentiality.tactic : 'none required'
      }`,
      `LENGTH TARGET: ${isLead ? '500-800 words (featured case)' : '250-400 words (secondary case)'}`,
      `THE OTHER CASES IN THIS PORTFOLIO: ${siblingHeadlines.join(' · ') || 'none'} — do not repeat their framing or phrasing.`,
      state.mode === 'minimal_evidence'
        ? 'MODE: this portfolio has thin evidence. Be especially rigorous about what is and is not demonstrated. Do not compensate with stronger language.'
        : '',
      `THEIR OWN WRITING SAMPLE (match the rhythm, never copy phrases)\n${
        state.rawProfile?.voiceSample || '(none supplied — use a plain, direct register)'
      }`,
      directiveBlock(directives),
      'Write the case.',
    ]
      .filter(Boolean)
      .join('\n\n'),
    temperature: 0.5,
    maxOutputTokens: 8192,
  });
}

function normalise(
  narrative: CaseNarrative,
  selected: SelectedCase,
  state: StageContext['state'],
): CaseNarrative | null {
  if (!narrative) return null;
  const project = state.rawProjects.find((p) => p.id === selected.id);

  const blocks = (narrative.blocks ?? [])
    .filter((b) => b && b.text)
    .map((b) => ({ ...b, words: b.words || countWords(b.text) }));

  return {
    ...narrative,
    id: selected.id,
    title: narrative.title || project?.name || 'Case study',
    blocks,
    assertions: narrative.assertions ?? [],
    visualScript: narrative.visualScript ?? [],
    workType: narrative.workType ?? selected.type ?? 'professional',
    confidentialityApplied:
      narrative.confidentialityApplied ||
      (selected.confidentiality?.applies ? selected.confidentiality.tactic : 'none'),
    totalWords: narrative.totalWords || blocks.reduce((sum, b) => sum + b.words, 0),
  };
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function nameOf(state: { rawProjects: RawProject[] }, id: string): string {
  return state.rawProjects.find((p) => p.id === id)?.name ?? id;
}

function worstConfidence(values: Confidence[]): Confidence {
  if (values.includes('low')) return 'low';
  if (values.includes('medium')) return 'medium';
  return 'high';
}
