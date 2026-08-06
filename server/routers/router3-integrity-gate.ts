/**
 * ROUTER 3 — Integrity gate. BLOCKING.
 *
 * No narrative moves past this point without approval. This is the most important
 * check in the pipeline: it protects the person from publishing claims they cannot
 * stand behind, and from breaking a confidentiality agreement.
 *
 * Two layers, in this order:
 *   1. Deterministic — any numeric assertion still labelled "unsourced" and still
 *      carrying a number is a violation. That is a string check, not a judgement.
 *   2. Model-assisted — hallucination against the original data, invented quotes,
 *      attribution, confidentiality leakage, cross-case consistency.
 */

import type { Stage, StageContext, StageOutcome } from '../core/contract';
import { asJson } from '../core/contract';
import { generateJson } from '../llm/client';

const MAX_RETURNS = 2;

interface Violation {
  caseId: string;
  kind: 'hallucination' | 'invented_quote' | 'confidentiality_leak' | 'unsourced_number' | 'attribution';
  detail: string;
  requiredCorrection: string;
}

interface Output {
  criticalViolations: Violation[];
  minorCorrections: { caseId: string; detail: string; suggestedCorrection: string }[];
  takeawaysSupported: boolean;
  repeatedPhrasing: string[];
  reasoning: string;
}

const SYSTEM_PROMPT = `You are the integrity gate. Nothing advances without your approval. You do not
rewrite anything — you identify exactly what is wrong and what the correction must achieve.

CHECK 1 — TRUTHFULNESS
For every assertion in every case:
  a) Does it exist in the person's original data? A fact that is not in the source data is a
     HALLUCINATION and a critical violation.
  b) Does every numeric assertion have a source other than "unsourced"? If not, was it rewritten
     qualitatively or removed? A number with no source still present in the text is a violation.
  c) Are there self-evaluating adjectives about their own work? Minor correction.
  d) Are there third-party quotes? Are they in the original data? If not, critical violation.

CHECK 2 — ATTRIBUTION
  a) Is their own role distinguished from the team's in every case?
  b) Is there a "we" that hides who did what? Correction.
  c) Is the work-type label present and does it match the original data?

CHECK 3 — CONFIDENTIALITY
  a) Where a project is flagged confidential, was the assigned tactic actually applied?
  b) Does any client, person, brand or identifiable detail appear that should be protected?
  c) Is there personal, financial or health data in the text or the alt text?

CHECK 4 — CROSS-CASE CONSISTENCY
  a) Is the tone consistent across cases?
  b) Are phrases or structures repeated verbatim? Flag them for variation.
  c) Do the cases together support the brief's three takeaways?

Be strict about hallucination and confidentiality. Be proportionate about everything else — a
slightly stiff sentence is not a violation.

OUTPUT — one JSON object, nothing else:
{
  "criticalViolations": [{"caseId":"","kind":"hallucination|invented_quote|confidentiality_leak|unsourced_number|attribution","detail":"","requiredCorrection":""}],
  "minorCorrections": [{"caseId":"","detail":"","suggestedCorrection":""}],
  "takeawaysSupported": true,
  "repeatedPhrasing": [],
  "reasoning": ""
}`;

export const router3IntegrityGate: Stage = {
  id: 'router-3-integrity-gate',
  kind: 'router',
  methodName: 'Router 3 — Compuerta de integridad (BLOQUEANTE)',
  phaseId: 'writing',

  async run({ state, emit }: StageContext): Promise<StageOutcome> {
    emit('Checking every claim against what you actually told us');

    const machineViolations = findUnsourcedNumbers(state);

    const output = await generateJson<Output>({
      stage: 'router-3-integrity-gate',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: [
        `THE CASES AS WRITTEN\n${asJson(state.caseNarratives)}`,
        `THE ORIGINAL DATA THEY MUST NOT EXCEED\n${asJson(state.rawProjects)}`,
        `CONFIDENTIALITY ASSIGNMENTS\n${asJson(
          state.curatedInventory?.featuredSelection?.map((s) => ({
            id: s.id,
            applies: s.confidentiality?.applies,
            tactic: s.confidentiality?.tactic,
          })) ?? [],
        )}`,
        `THE THREE TAKEAWAYS THE CASES MUST SUPPORT\n${asJson(state.strategicBrief?.takeaways ?? [])}`,
        `ALREADY DETECTED BY AUTOMATED CHECK (do not repeat, but do account for)\n${asJson(machineViolations)}`,
        'Evaluate and route.',
      ].join('\n\n'),
      temperature: 0.1,
      maxOutputTokens: 4096,
    });

    const critical = [...machineViolations, ...(output.criticalViolations ?? [])];
    const minor = output.minorCorrections ?? [];
    state.flags.unsourcedAssertions = critical
      .filter((v) => v.kind === 'unsourced_number')
      .map((v) => v.detail);

    const attempts = state.flags.narrativeRetries;

    if (critical.length && attempts >= MAX_RETURNS) {
      const escalation = plainLanguageEscalation(critical);
      state.escalation = escalation;
      return {
        decision: 'Escalated to the user',
        reasoning: `${critical.length} critical violation(s) survived ${MAX_RETURNS} rewrites.`,
        route: 'escalate',
        escalate: escalation,
      };
    }

    if (critical.length || minor.length >= 3) {
      state.flags.narrativeRetries = attempts + 1;
      emit('Tightening the wording');

      const instructions = [
        ...critical.map((v) => `[${v.caseId}] ${v.detail} — ${v.requiredCorrection}`),
        ...minor.map((m) => `[${m.caseId}] ${m.detail} — ${m.suggestedCorrection}`),
        ...(output.repeatedPhrasing?.length
          ? [`Vary this repeated phrasing across cases: ${output.repeatedPhrasing.join(' / ')}`]
          : []),
      ];

      return {
        decision: `Sent ${critical.length} critical and ${minor.length} minor correction(s) back`,
        reasoning: output.reasoning || 'Integrity checks did not pass.',
        route: 'return_to_writing',
        retry: { stageId: 'agent-3-narrator', instructions, reason: 'integrity' },
      };
    }

    if (minor.length) {
      // Fewer than three minor points: carry them forward as notes rather than re-running the stage.
      state.directives['agent-4-architect'] = [
        ...(state.directives['agent-4-architect'] ?? []),
        ...minor.map((m) => `Keep in mind while structuring: ${m.detail}`),
      ];
    }

    return {
      decision: 'Integrity approved',
      reasoning:
        output.reasoning ||
        'Every claim traces back to the original data; confidentiality tactics applied where required.',
      route: 'continue',
      notices: output.takeawaysSupported
        ? []
        : [
            {
              kind: 'quality',
              message:
                'One of the three things we wanted a reader to take away is not fully carried by the work ' +
                'shown. It is in the improvement plan at the end.',
            },
          ],
    };
  },
};

/**
 * Deterministic half of the truthfulness check. A numeric claim that is still
 * labelled "kept" while its source is "unsourced" — or whose text still contains
 * digits after supposedly being rewritten qualitatively — has slipped through.
 */
function findUnsourcedNumbers(state: StageContext['state']): Violation[] {
  const violations: Violation[] = [];
  const hasDigits = /\d/;

  for (const narrative of state.caseNarratives) {
    for (const assertion of narrative.assertions) {
      if (assertion.source !== 'unsourced') continue;
      if (assertion.actionApplied === 'removed') continue;

      const stillNumeric =
        assertion.actionApplied === 'kept' || (assertion.kind === 'numeric' && hasDigits.test(assertion.text));

      if (stillNumeric) {
        violations.push({
          caseId: narrative.id,
          kind: 'unsourced_number',
          detail: `"${assertion.text}" carries a number with no source.`,
          requiredCorrection:
            'Rewrite it qualitatively with no figure, or remove it. Do not estimate the number.',
        });
      }
    }
  }
  return violations;
}

function plainLanguageEscalation(violations: Violation[]): string {
  const byKind = new Map<Violation['kind'], Violation[]>();
  for (const violation of violations) {
    byKind.set(violation.kind, [...(byKind.get(violation.kind) ?? []), violation]);
  }

  const parts: string[] = [
    'There is something in the write-up we could not resolve on our own, and it needs your call before this goes anywhere.',
    '',
  ];

  if (byKind.has('unsourced_number')) {
    parts.push(
      'Some numbers do not have a source behind them:',
      ...byKind.get('unsourced_number')!.map((v) => `- ${v.detail}`),
      '',
      'Either tell us where each figure came from — measured, estimated, or the client told you — or we take the number out and describe the result in words. An unverifiable figure is a liability in an interview, not an advantage.',
      '',
    );
  }
  if (byKind.has('confidentiality_leak')) {
    parts.push(
      'Something identifiable about a client may still be visible:',
      ...byKind.get('confidentiality_leak')!.map((v) => `- ${v.detail}`),
      '',
      'Confirm what you are allowed to name, and we will rework it.',
      '',
    );
  }
  if (byKind.has('hallucination') || byKind.has('invented_quote')) {
    parts.push(
      'Some statements do not trace back to anything you told us:',
      ...[...(byKind.get('hallucination') ?? []), ...(byKind.get('invented_quote') ?? [])].map(
        (v) => `- ${v.detail}`,
      ),
      '',
      'Confirm whether they are accurate. Anything you cannot confirm comes out.',
      '',
    );
  }

  return parts.join('\n').trim();
}
