/**
 * AGENT 7 — Quality auditor. [Phase 7: quality control and validation]
 *
 * Diagnoses and prioritises. It does not fix anything, and — importantly — it does
 * not measure anything either. Contrast ratios, file weights, attribute presence
 * and heading hierarchy arrive already computed by `server/checks`. The auditor's
 * job is judgement: what the numbers mean, how serious each finding is, which
 * stage has to fix it, and what a human still has to look at.
 */

import type { Stage, StageContext, StageOutcome } from '../core/contract';
import { asJson, directiveBlock, takeDirectives } from '../core/contract';
import { generateJson } from '../llm/client';
import { auditHtml, checkBudgets } from '../checks/html';
import { verifyTokenContrast, verifyTypography } from '../checks/contrast';
import type { Confidence, MachineFindings, QualityReport } from '../../shared/types';

interface Output {
  qualityReport: QualityReport;
  confidence: Confidence;
}

/** Fixed limitation statements from section A.4. These ship with every report. */
export const LIMITATION_STATEMENTS = [
  'The evidence behind this method is strongest in UX and digital design — it comes from a survey of 204 people who hire in that field. Applying it to other professions is a reasonable extension, not a proven one.',
  'The narrative structure used here (situation, task, action, result) is used because it forces completeness and makes claims checkable. It is not a guarantee of a hiring outcome, and nothing here should be read as one.',
  'There is no causal evidence that having a portfolio increases the chance of being hired across professions. What the evidence covers is what reviewers prefer when a portfolio already exists.',
  'Loading speed can only be confirmed with real visitors. Everything reported here is a lab proxy: page weight, image dimensions, blocking resources. Treat it as "passed in the lab, pending real-world confirmation".',
  'Automated accessibility checks catch only part of what matters. Reading order, alt-text quality and plain language need a human. What you have is assisted conformance, not certified conformance.',
  'Nothing here can verify that your achievements are true. Every number in the portfolio carries the source you gave it, and anything without a source was rewritten without the number.',
  'Regulated professions — medicine, law, accounting, psychology among others — have rules about professional advertising and client confidentiality that vary by jurisdiction. This is not legal advice.',
  'If any of your work is under a confidentiality agreement, the legal responsibility for what you publish is yours. We applied the standard mitigations; we cannot read your contracts.',
];

const SYSTEM_PROMPT = `You are a quality auditor. You verify a portfolio against objective criteria
and produce an actionable report. You diagnose and prioritise; you do not correct.

FOUNDATION
WCAG 2.2 level AA, the level most accessibility regulations reference. Core Web Vitals thresholds
(LCP 2.5s, INP 200ms, CLS 0.1) evaluated at the 75th percentile of real visits.

WHAT YOU ARE GIVEN
"machineFindings" are computed measurements, not opinions. Treat them as ground truth. Do not
re-derive them, do not second-guess them, and do not report a contrast ratio or a file size that
differs from what is there.

GATE 1 — ACCESSIBILITY (BLOCKING, WCAG 2.2 AA)
Report per criterion: 1.1.1 alt text, 1.3.1 semantic structure and heading order, 1.4.1 colour is
not the only carrier of meaning, 1.4.3 text contrast, 1.4.10 reflow at 320px, 1.4.11 non-text
contrast, 2.1.1 keyboard operability, 2.1.2 no keyboard traps, 2.4.3 focus order, 2.4.7 visible
focus, 2.4.11 focus not obscured, 2.5.8 target size, 3.1.1 page language, 3.3.2 form labels if any.
MANDATORY DECLARATION: end this gate by listing which criteria you verified from the machine
findings and which need a human (real alt-text quality, logical reading order, language clarity,
rendered target sizes). Never declare full WCAG conformance. Declare assisted conformance pending
human review.

GATE 2 — PERFORMANCE (WARNING, lab only)
Page weight against budget, explicit image dimensions, the LCP resource, blocking scripts or fonts.
MANDATORY DECLARATION: report "passed in the lab; pending field verification".

GATE 3 — CONTENT (WARNING)
All seven elements present in each featured case; a heading roughly every 150 words; paragraphs
short; length in range (500-800 featured, 250-400 secondary); no filler; no self-evaluating
adjectives; consistent tone; spelling and grammar.

GATE 4 — TRUTHFULNESS (BLOCKING)
No numeric claim with source "unsourced" still carrying a number; no third-party quotes that were
not in the original data; the work-type label visible on each case; own role separated from the
team's.

GATE 5 — CONFIDENTIALITY (BLOCKING)
No client, person or brand name that should have been protected; no personal, financial or health
data in text or alt text; the assigned tactic actually applied.

GATE 6 — STRATEGY (WARNING)
The 90-second test: reading only headings, impact headlines and the hero block, are the brief's
three takeaways recoverable? Simulate that reading and report what you actually recovered.

VERDICT
- "rejected" if any blocking gate fails
- "approved_with_warnings" if only warning gates fail
- "approved" if everything passes

Each finding names the stage responsible for fixing it, using exactly one of these ids:
"agent-3-narrator" (writing, truthfulness, confidentiality of wording),
"agent-4-architect" (structure, metadata, alt-text inventory),
"agent-5-art-director" (colour, typography, spacing, states),
"agent-6-builder" (stylesheet and page composition).

OUTPUT — one JSON object, nothing else:
{
  "qualityReport": {
    "verdict": "approved|approved_with_warnings|rejected",
    "gates": [{"gate":"accessibility|performance|content|truthfulness|confidentiality|strategy","blocking":true,"status":"pass|fail","findings":[{"criterion":"","severity":"critical|high|medium|low","detail":"","location":"","correction":"","responsibleStage":""}],"machineVerified":[],"requiresHumanJudgement":[]}],
    "ninetySecondTest": {"takeawaysRecovered":[],"takeawaysLost":[],"diagnosis":""},
    "prioritizedActions": [{"priority":1,"action":"","responsibleStage":"","impact":""}],
    "limitationStatements": []
  },
  "confidence": "high|medium|low"
}`;

export const agent7Auditor: Stage = {
  id: 'agent-7-auditor',
  kind: 'agent',
  methodName: 'Agente 7 — Auditor de Calidad',
  phaseId: 'review',

  async run({ state, emit }: StageContext): Promise<StageOutcome> {
    emit('Running the checks');

    const findings = collectMachineFindings(state);
    state.machineFindings = findings;

    const failingContrast = findings.contrast.filter((c) => !c.passes);
    emit(
      failingContrast.length
        ? `${failingContrast.length} colour pair(s) below the readability threshold`
        : 'Colour contrast clears WCAG AA on every pair',
    );

    const directives = takeDirectives(state, 'agent-7-auditor');

    const output = await generateJson<Output>({
      stage: 'agent-7-auditor',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: [
        `MACHINE FINDINGS (measured — treat as ground truth)\n${asJson(findings)}`,
        `STRATEGIC BRIEF\n${asJson(state.strategicBrief)}`,
        `ASSERTIONS ACROSS ALL CASES\n${asJson(
          state.caseNarratives.map((c) => ({ case: c.title, workType: c.workType, assertions: c.assertions })),
        )}`,
        `CASE STRUCTURE\n${asJson(
          state.caseNarratives.map((c) => ({
            case: c.title,
            blocks: c.blocks.map((b) => ({ n: b.n, heading: b.heading, words: b.words })),
            totalWords: c.totalWords,
            confidentialityApplied: c.confidentialityApplied,
          })),
        )}`,
        `CASE TEXT (for tone, filler and the 90-second test)\n${asJson(
          state.caseNarratives.map((c) => ({
            case: c.title,
            impactHeadline: c.impactHeadline,
            blocks: c.blocks.map((b) => `${b.heading}: ${b.text}`),
          })),
        )}`,
        `HERO BLOCK\n${asJson(state.contentModel?.heroBlock)}`,
        `ARTIFACT MANIFEST\n${asJson(state.artifact?.manifest)}`,
        `BUDGET OVERRUNS ALREADY DETECTED\n${asJson(state.artifact?.budgetOverruns ?? [])}`,
        `CONFIDENTIALITY FLAGS: nda=${state.flags.nda}, regulatedProfession=${state.flags.regulatedProfession}`,
        directiveBlock(directives),
        'Produce the quality report.',
      ].join('\n\n'),
      temperature: 0.2,
      maxOutputTokens: 8192,
    });

    const report = reconcile(output.qualityReport, findings);
    state.qualityReport = report;

    emit(
      report.verdict === 'rejected'
        ? 'Found problems worth fixing before this goes out'
        : 'Checks complete',
    );

    return {
      decision: `Verdict: ${report.verdict}`,
      reasoning: report.gates
        .filter((g) => g.status === 'fail')
        .map((g) => `${g.gate} failed`)
        .join('; ') || 'All gates passed.',
      confidence: output.confidence ?? 'medium',
    };
  },
};

/* ------------------------------------------------------------------ */
/* Machine findings                                                    */
/* ------------------------------------------------------------------ */

export function collectMachineFindings(state: StageContext['state']): MachineFindings {
  const files = state.artifact?.files ?? [];
  const html = files
    .filter((f) => f.kind === 'html')
    .map((f) => auditHtml(f.path, f.contents));

  const sizes: Record<string, number> = {
    'Homepage HTML': files.find((f) => f.path === 'index.html')?.bytes ?? 0,
    Stylesheet: files.find((f) => f.path === 'styles.css')?.bytes ?? 0,
    'Homepage total weight': state.artifact?.homepageBytes ?? 0,
  };

  const tokens = state.visualSystem?.tokens;

  return {
    contrast: tokens ? verifyTokenContrast(tokens) : [],
    html,
    budgets: checkBudgets(sizes),
    typography: tokens ? verifyTypography(tokens) : [],
  };
}

/* ------------------------------------------------------------------ */
/* Reconciliation                                                      */
/* ------------------------------------------------------------------ */

/**
 * The measurements win. If a machine check failed, the corresponding gate fails
 * and the verdict is rejected, whatever the model concluded — a model that talks
 * itself into approving a 2.9:1 contrast ratio must not be able to ship it.
 */
function reconcile(report: QualityReport, findings: MachineFindings): QualityReport {
  const gates = (report?.gates ?? []).map((gate) => ({
    ...gate,
    findings: gate.findings ?? [],
    machineVerified: gate.machineVerified ?? [],
    requiresHumanJudgement: gate.requiresHumanJudgement ?? [],
  }));

  const hardFailures: string[] = [];

  const failingContrast = findings.contrast.filter((c) => !c.passes);
  for (const check of failingContrast) {
    hardFailures.push(
      `Contrast for ${check.pair} is ${check.ratio}:1, below the required ${check.required}:1.`,
    );
  }

  for (const page of findings.html) {
    if (!page.hasLangAttribute) hardFailures.push(`${page.file} does not declare a page language.`);
    if (page.h1Count !== 1) hardFailures.push(`${page.file} has ${page.h1Count} top-level headings; it needs exactly one.`);
    if (page.headingSkips.length) hardFailures.push(`${page.file} skips heading levels: ${page.headingSkips.join(', ')}.`);
    if (page.imagesMissingAlt > 0) hardFailures.push(`${page.file} has ${page.imagesMissingAlt} image(s) with no alt text.`);
    if (!page.landmarks.main) hardFailures.push(`${page.file} has no main landmark.`);
    if (page.externalResources.length) {
      hardFailures.push(`${page.file} loads third-party resources: ${page.externalResources.join(', ')}.`);
    }
  }

  let accessibility = gates.find((g) => g.gate === 'accessibility');
  if (!accessibility) {
    accessibility = {
      gate: 'accessibility',
      blocking: true,
      status: 'pass',
      findings: [],
      machineVerified: [],
      requiresHumanJudgement: [],
    };
    gates.unshift(accessibility);
  }
  accessibility.blocking = true;

  if (hardFailures.length) {
    accessibility.status = 'fail';
    for (const detail of hardFailures) {
      const isContrast = detail.startsWith('Contrast');
      accessibility.findings.push({
        criterion: isContrast ? '1.4.3 / 1.4.11 contrast' : '1.3.1 / 3.1.1 structure',
        severity: 'critical',
        detail,
        location: 'generated files',
        correction: isContrast ? 'Adjust the palette until every pair clears its threshold.' : 'Correct the markup.',
        responsibleStage: isContrast ? 'agent-5-art-director' : 'agent-6-builder',
      });
    }
  }

  const blockingFailed = gates.some((g) => g.blocking && g.status === 'fail');
  const anyFailed = gates.some((g) => g.status === 'fail');

  return {
    ...report,
    gates,
    verdict: blockingFailed ? 'rejected' : anyFailed ? 'approved_with_warnings' : 'approved',
    ninetySecondTest:
      report?.ninetySecondTest ?? { takeawaysRecovered: [], takeawaysLost: [], diagnosis: '' },
    prioritizedActions: report?.prioritizedActions ?? [],
    limitationStatements: LIMITATION_STATEMENTS,
  };
}
