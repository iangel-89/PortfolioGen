/**
 * AGENT 8 — Packager and delivery.
 *
 * The only stage whose output the user reads directly. It translates everything
 * the system did into something a person with no knowledge of the method can
 * understand, use and maintain.
 *
 * Master rule: the user never sees the method. No phases, no agents, no routers,
 * no "curation", no "design tokens", no WCAG success-criterion numbers. Results
 * and actions only.
 *
 * The model writes the content of each section; the Markdown document itself is
 * assembled here in code, so the delivered format is exactly the mandated one
 * every time rather than usually.
 */

import type { Stage, StageContext, StageOutcome } from '../core/contract';
import { asJson } from '../core/contract';
import { generateJson } from '../llm/client';
import { LIMITATION_STATEMENTS } from './agent7-auditor';
import type { Confidence, DeliveryPackage, SessionState } from '../../shared/types';

type PackagerFields = Omit<DeliveryPackage, 'markdown'>;

interface Output extends PackagerFields {
  confidence: Confidence;
}

const SYSTEM_PROMPT = `You hand the finished work back to the person who asked for it.

MASTER RULE
They must never see the method. Never mention phases, agents, routers, curation, content models,
design tokens, archetypes, or accessibility criteria by their code numbers. Talk about results and
about actions they can take.

TONE
Direct, warm, no flattery. Never promise hiring outcomes. Never say "your portfolio is amazing".
Say what it does well and what it is missing. Short sentences. Second person.

WHAT TO WRITE
1. summary — at most 200 words: what was built, what it focuses on, and why that focus.
2. fileGuide — one line per file explaining what it is for, in ordinary words.
3. publishing — step-by-step instructions assuming zero technical knowledge. At least two options,
   at least one free. Keep the ones you were given if they are good; improve them if they are not.
4. qualityInPlainLanguage — translate each check into plain English. Instead of "WCAG 1.4.3
   insufficient contrast", write "grey text on a light background is hard for some people to read,
   so we darkened it". Cover what passed as well as what did not.
5. improvementPlan — what is missing and what would make it stronger, each rated by impact and
   effort. Include the evidence gaps that were found and the images marked as still to capture.
6. iterationPlan — who to ask for feedback, exactly three questions to ask them, what to write down
   after each interview, how often to update, and what to save from every new project so the next
   case is easy to write.
7. limitations — what was checked, what could not be checked before publishing, and what depends
   on them. Honest, not alarming.

OUTPUT — one JSON object, nothing else:
{
  "summary": "",
  "fileGuide": [{"path":"","whatItIsFor":""}],
  "publishing": [{"title":"","steps":[],"free":true}],
  "qualityInPlainLanguage": [{"checked":"","result":""}],
  "improvementPlan": [{"action":"","impact":"high|medium|low","effort":"low|medium|high"}],
  "iterationPlan": {"whoToAsk":[],"threeQuestions":["","",""],"whatToRecordAfterEachInterview":[],"updateCadence":"","captureTemplate":[]},
  "limitations": [],
  "confidence": "high|medium|low"
}`;

export const agent8Packager: Stage = {
  id: 'agent-8-packager',
  kind: 'agent',
  methodName: 'Agente 8 — Empaquetador y Entrega',
  phaseId: 'review',

  async run({ state, emit }: StageContext): Promise<StageOutcome> {
    emit('Writing up what you got and what to do next');

    const output = await generateJson<Output>({
      stage: 'agent-8-packager',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: [
        `WHO THIS IS FOR\n${asJson(state.rawProfile)}`,
        `THE FOCUS THAT WAS CHOSEN\n${asJson({
          thesis: state.strategicBrief?.thesis,
          takeaways: state.strategicBrief?.takeaways,
          primaryReader: state.strategicBrief?.primaryReader,
          positioningRisks: state.strategicBrief?.positioningRisks,
        })}`,
        `FILES PRODUCED\n${asJson(
          (state.artifact?.files ?? []).map((f) => ({ path: f.path, purpose: f.purpose, kb: Math.round(f.bytes / 102.4) / 10 })),
        )}`,
        `PUBLISHING OPTIONS DRAFTED DURING THE BUILD\n${asJson(state.artifact?.publishingInstructions ?? [])}`,
        `QUALITY REPORT\n${asJson(state.qualityReport)}`,
        `EVIDENCE GAPS\n${asJson(state.curatedInventory?.gaps ?? [])}`,
        `IMAGES STILL TO CAPTURE\n${asJson(
          state.caseNarratives.flatMap((c) =>
            c.visualScript
              .filter((v) => v.status === 'to_capture')
              .map((v) => ({ case: c.title, mustShow: v.mustShow, how: v.userInstruction })),
          ),
        )}`,
        `MODE: ${state.mode}${state.mode === 'minimal_evidence' ? ' (a capabilities piece, not a case-led portfolio)' : ''}`,
        `FLAGS: nda=${state.flags.nda}, regulatedProfession=${state.flags.regulatedProfession}, weakCoverage=${state.flags.weakCoverage}`,
        state.escalation ? `UNRESOLVED PROBLEM THEY MUST DECIDE ON\n${state.escalation}` : '',
        `THE FIXED LIMITATIONS THAT MUST BE INCLUDED, REWRITTEN IN YOUR OWN PLAIN LANGUAGE\n${asJson(
          LIMITATION_STATEMENTS,
        )}`,
        'Write the delivery.',
      ]
        .filter(Boolean)
        .join('\n\n'),
      temperature: 0.4,
      maxOutputTokens: 8192,
    });

    const delivery: DeliveryPackage = {
      ...normalise(output, state),
      markdown: '',
    };
    delivery.markdown = assembleMarkdown(delivery, state);
    state.delivery = delivery;

    return {
      decision: 'Delivery written',
      reasoning: 'Quality report translated into plain language; improvement and iteration plans attached.',
      confidence: output.confidence ?? 'medium',
    };
  },
};

function normalise(output: Output, state: SessionState): PackagerFields {
  const files = state.artifact?.files ?? [];
  const guide = output.fileGuide?.length
    ? output.fileGuide
    : files.map((f) => ({ path: f.path, whatItIsFor: f.purpose }));

  return {
    summary: output.summary ?? '',
    fileGuide: guide,
    publishing: output.publishing?.length ? output.publishing : state.artifact?.publishingInstructions ?? [],
    qualityInPlainLanguage: output.qualityInPlainLanguage ?? [],
    improvementPlan: output.improvementPlan ?? [],
    iterationPlan: output.iterationPlan ?? {
      whoToAsk: [],
      threeQuestions: [],
      whatToRecordAfterEachInterview: [],
      updateCadence: '',
      captureTemplate: [],
    },
    limitations: output.limitations?.length ? output.limitations : LIMITATION_STATEMENTS,
  };
}

/* ------------------------------------------------------------------ */
/* The delivered document                                              */
/* ------------------------------------------------------------------ */

/**
 * The mandated final output format. Section headings are fixed; only the content
 * inside them varies. Assembled here rather than asked for, so the contract holds.
 */
export function assembleMarkdown(delivery: DeliveryPackage, state: SessionState): string {
  const out: string[] = [];

  out.push('# Your portfolio is ready', '');

  out.push('## What we built', '');
  out.push(delivery.summary.trim() || 'A portfolio built around your strongest evidence.', '');

  out.push('## Your files', '');
  if (delivery.fileGuide.length) {
    for (const file of delivery.fileGuide) {
      out.push(`- **${file.path}** — ${file.whatItIsFor}`);
    }
  } else {
    out.push('_No files were produced._');
  }
  out.push('');

  out.push('## How to publish it', '');
  if (delivery.publishing.length) {
    for (const option of delivery.publishing) {
      out.push(`### ${option.title}${option.free ? ' (free)' : ''}`, '');
      option.steps.forEach((step, index) => out.push(`${index + 1}. ${step}`));
      out.push('');
    }
  } else {
    out.push('_No publishing instructions were produced._', '');
  }

  out.push('## What we checked for you', '');
  if (delivery.qualityInPlainLanguage.length) {
    for (const item of delivery.qualityInPlainLanguage) {
      out.push(`- **${item.checked}** — ${item.result}`);
    }
  } else {
    out.push('_No checks were recorded._');
  }
  out.push('');

  const humanReview = (state.qualityReport?.gates ?? []).flatMap((g) => g.requiresHumanJudgement ?? []);
  if (humanReview.length) {
    out.push('Still worth a human eye:', '');
    for (const item of humanReview) out.push(`- ${item}`);
    out.push('');
  }

  out.push('## What you still need to make it stronger', '');
  if (delivery.improvementPlan.length) {
    const sorted = [...delivery.improvementPlan].sort(
      (a, b) => rank(b.impact) - rank(a.impact) || rank(a.effort) - rank(b.effort),
    );
    for (const item of sorted) {
      out.push(`- ${item.action} _(impact: ${item.impact} · effort: ${item.effort})_`);
    }
  } else {
    out.push('_Nothing outstanding was identified._');
  }
  out.push('');

  out.push('## How to keep it alive', '');
  const plan = delivery.iterationPlan;
  if (plan.whoToAsk?.length) {
    out.push('**Who to show it to**', '');
    for (const who of plan.whoToAsk) out.push(`- ${who}`);
    out.push('');
  }
  if (plan.threeQuestions?.length) {
    out.push('**What to ask them**', '');
    plan.threeQuestions.forEach((q, i) => out.push(`${i + 1}. ${q}`));
    out.push('');
  }
  if (plan.whatToRecordAfterEachInterview?.length) {
    out.push('**What to write down afterwards**', '');
    for (const item of plan.whatToRecordAfterEachInterview) out.push(`- ${item}`);
    out.push('');
  }
  if (plan.updateCadence) out.push(`**How often to update:** ${plan.updateCadence}`, '');
  if (plan.captureTemplate?.length) {
    out.push('**Save this from every new project, while it is fresh**', '');
    for (const item of plan.captureTemplate) out.push(`- ${item}`);
    out.push('');
  }

  out.push("## What we couldn't verify", '');
  for (const limitation of delivery.limitations) {
    out.push(`- ${limitation}`);
  }
  out.push('');

  if (state.escalation) {
    out.push('---', '', '**One thing needs your decision**', '', state.escalation, '');
  }

  return out.join('\n');
}

function rank(value: string): number {
  return value === 'high' ? 3 : value === 'medium' ? 2 : 1;
}
