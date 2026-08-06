/**
 * AGENT 6 — Builder. [Phase 6: production and assembly]
 *
 * Split deliberately in two:
 *
 *   - This stage (a model) writes the stylesheet from the design tokens and makes
 *     the page-level composition calls that need judgement: nav labels, the
 *     supporting hero copy, the card blurb for each case, the call to action, and
 *     the publishing instructions.
 *
 *   - `server/render/renderer.ts` (plain code) emits the actual HTML from the
 *     content model plus this plan.
 *
 * The split exists because everything the accessibility gate checks in markup —
 * one h1, unskipped heading levels, landmarks, lang, alt text, explicit image
 * dimensions, a skip link, no third-party requests — is guaranteed by construction
 * when code emits the markup, and merely likely when a model does. It also means
 * the content can be re-rendered after an edit without regenerating anything.
 */

import type { Stage, StageContext, StageOutcome } from '../core/contract';
import { asJson, directiveBlock, takeDirectives } from '../core/contract';
import { generateJson } from '../llm/client';
import { renderSite } from '../render/renderer';
import type { Confidence } from '../../shared/types';

export interface BuildPlan {
  stylesheet: string;
  navLabels: { home: string; work: string; about: string; contact: string };
  siteTitle: string;
  heroSupportingLine: string;
  ctaLabel: string;
  caseCards: { id: string; blurb: string }[];
  footerLine: string;
  publishingInstructions: { title: string; steps: string[]; free: boolean }[];
  buildNotes: string[];
  confidence: Confidence;
}

const SYSTEM_PROMPT = `You are a front-end developer. You are handed a finished design system and a
finished content model, and you produce the stylesheet plus the page-level composition decisions.
You do not invent content and you do not revisit design decisions: you execute the specification.

THE STYLESHEET
Write one complete, production-ready CSS file. Requirements, all mandatory:
- Start with :root and declare every design token as a custom property. Every later rule must use
  the custom properties, never a hard-coded value, so the content can be re-themed without
  touching structure.
- No @import, no remote fonts, no third-party anything. Font stacks must be self-contained,
  ending in a generic family.
- Style exactly these hooks, which the renderer emits:
    .skip-link, .site-header, .site-nav, .site-nav a, .site-nav a[aria-current="page"],
    main, .hero, .hero__name, .hero__role, .hero__thesis, .hero__proof, .hero__support,
    .cta, .takeaways, .takeaways li, .case-grid, .case-card, .case-card__type,
    .case-card__title, .case-card__headline, .case-card__blurb, .case-card a,
    .case-header, .case-header__type, .case-star, .case-star dt, .case-star dd,
    .case-block, .case-block h2, .visual-placeholder, .evidence-note, .prose,
    .about, .contact, .contact ul, .site-footer, .disclosure, .gallery, .gallery li
- Layout with flexbox and grid. It must reflow to 320px with no horizontal scrolling.
- Line length capped with a max-width in ch on reading columns.
- :focus-visible must be clearly visible against both background and surface, using a 2px outline
  plus an offset. Never remove outlines.
- Every interactive target at least 24x24 CSS pixels.
- Include @media (prefers-reduced-motion: reduce) that disables transitions and animations.
- Include a @media print block: hide nav and the skip link, use black on white, show link URLs
  after the link text with content: " (" attr(href) ")", avoid breaking inside a case block.
- Keep it under 45KB. No unused rules. Comment each major section in one line.

COMPOSITION DECISIONS
- navLabels: standard sector vocabulary. Never invented or playful.
- heroSupportingLine: one sentence, at most 25 words, that sits under the thesis and makes the
  proof land. It must only state things present in the content model.
- caseCards: one blurb per case, at most 20 words, drawn from that case's own STAR summary.
  Never add facts.
- ctaLabel: short, concrete, e.g. "Read the case studies" or "Get in touch".
- footerLine: one line. Include the work-type disclosure convention if any case is academic,
  volunteer or personal.
- publishingInstructions: two options minimum, at least one free, written for someone with zero
  technical knowledge, each a numbered list of concrete steps.

OUTPUT — one JSON object, nothing else. The stylesheet goes in a single JSON string with \\n escapes:
{
  "stylesheet": "...",
  "navLabels": {"home":"","work":"","about":"","contact":""},
  "siteTitle": "",
  "heroSupportingLine": "",
  "ctaLabel": "",
  "caseCards": [{"id":"","blurb":""}],
  "footerLine": "",
  "publishingInstructions": [{"title":"","steps":[],"free":true}],
  "buildNotes": [],
  "confidence": "high|medium|low"
}`;

export const agent6Builder: Stage = {
  id: 'agent-6-builder',
  kind: 'agent',
  methodName: 'Agente 6 — Constructor',
  phaseId: 'build',

  async run({ state, emit }: StageContext): Promise<StageOutcome> {
    emit('Building your files');

    const directives = takeDirectives(state, 'agent-6-builder');

    const plan = await generateJson<BuildPlan>({
      stage: 'agent-6-builder',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: [
        `DESIGN TOKENS\n${asJson(state.visualSystem?.tokens)}`,
        `ARCHETYPE: ${state.visualSystem?.archetype}`,
        `GRID\n${asJson(state.visualSystem?.grid)}`,
        `COMPONENT INVENTORY\n${asJson(state.visualSystem?.components)}`,
        `INTERACTION STATES\n${asJson(state.visualSystem?.states)}`,
        `CONTENT MODEL\n${asJson(state.contentModel)}`,
        `CASES (titles, headlines, STAR summaries and work types)\n${asJson(
          state.caseNarratives.map((c) => ({
            id: c.id,
            title: c.title,
            impactHeadline: c.impactHeadline,
            starSummary: c.starSummary,
            workType: c.workType,
          })),
        )}`,
        `TARGET FORMAT: ${state.rawProfile?.preferredFormat || 'both'}`,
        directiveBlock(directives),
        'Produce the stylesheet and the composition decisions.',
      ].join('\n\n'),
      temperature: 0.3,
      maxOutputTokens: 16384,
    });

    // Deterministic emission — the markup contract is guaranteed here, not hoped for.
    const artifact = renderSite(state, plan);
    state.artifact = artifact;

    emit(
      `${artifact.files.length} files ready · homepage ${Math.round(artifact.homepageBytes / 1024)}KB`,
    );

    return {
      decision: `${artifact.files.length} file(s) produced; homepage ${Math.round(
        artifact.homepageBytes / 1024,
      )}KB`,
      reasoning:
        (plan.buildNotes ?? []).join('; ') ||
        'Stylesheet generated from tokens; markup emitted from the content model by the renderer.',
      confidence: plan.confidence ?? 'medium',
    };
  },
};
