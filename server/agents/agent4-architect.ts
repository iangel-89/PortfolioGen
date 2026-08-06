/**
 * AGENT 4 — Content architect. [Phase 4: content model and information architecture]
 *
 * Structures everything as data rather than as pages, so it can be ordered,
 * prioritised, reused across web and PDF, and updated without redoing the design.
 *
 * Makes no layout, colour or typography decisions. That is the next stage's job,
 * and doing it here would invert the content-first sequence the method depends on.
 */

import type { Stage, StageContext, StageOutcome } from '../core/contract';
import { asJson, directiveBlock, takeDirectives } from '../core/contract';
import { generateJson } from '../llm/client';
import type { Confidence, ContentModel } from '../../shared/types';

interface Output {
  contentModel: ContentModel;
  assumptions: string[];
  missing: string[];
  confidence: Confidence;
}

const SYSTEM_PROMPT = `You are an information architect and content strategist.

FOUNDATION
Content-first method (Atherton & Hane, Designing Connected Content): domain model → content model
→ interface. Never the reverse. Priority guides (van Nues & Overkamp) instead of wireframes:
decide what content matters and in what order, before deciding how it looks.

TASKS
1. DOMAIN MODEL. Concepts and relations:
   Professional —has→ Case —demonstrates→ Competency
   Case —produced→ Result · Case —contains→ Artifact · Case —for→ Organisation · Case —used→ Tool
2. CONTENT TYPES. Each type with required and optional fields:
   professional, case, visual_artifact, competency, result, contact.
3. PRIORITY GUIDES. For each template (home, case, about, contact), list the content in ORDER OF
   IMPORTANCE with no visual decisions: [priority, content type, purpose for the reader, actual
   content or a reference to it].
4. NAVIGATION ARCHITECTURE. Site map, routes, menu labels.
5. HERO BLOCK. In this order: who they are + what they do + thesis + immediate proof (the
   strongest impact headline) + next action.
6. CASE ORDER by reader logic, respecting the order assigned during curation.
7. METADATA: title (60 characters or fewer), meta description (155 or fewer), Open Graph, and
   schema.org/Person structured data with whatever properties apply.
8. ALT TEXT: consolidate the visual scripts into one inventory; mark decorative images with an
   empty alt.
9. OUTPUT VARIANTS: what goes into the website, the full PDF, and the one-page short version.
10. ABOUT and CONTACT sections written out in full, from what the person actually told us. If
    contact details were never supplied, use a single placeholder line saying so — never invent an
    email address, phone number or URL.

RULES
- No layout, colour or typography decisions. That is not your job.
- Maximum depth: 2 clicks from the home page to any case.
- Navigation labels in the target sector's standard vocabulary. Banned: creative labels the
  reader has to decode ("My universe", "The lab"). Use "Work", "Case studies", "About", "Contact".
- Every content type must render in web and PDF without rewriting.
- Every informative image needs functional alt text: what the image does in its context, not
  what it looks like.
- If the mode is minimal evidence, use a capabilities-document structure instead of a case-led
  one: thesis and takeaways, one deep case if it exists, a competencies section backed by indirect
  evidence (training, certifications, tools, processes they know), and an explicit plan of three
  scoped projects that would generate the missing evidence.

OUTPUT — one JSON object, nothing else:
{
  "contentModel": {
    "domainModel": {"entities":[],"relations":[]},
    "contentTypes": [{"type":"","requiredFields":[],"optionalFields":[],"cardinality":""}],
    "priorityGuides": [{"template":"home","blocks":[{"priority":1,"type":"","readerPurpose":"","contentRef":""}]}],
    "siteMap": [{"route":"","template":"","menuLabel":"","depth":0}],
    "heroBlock": {"who":"","whatTheyDo":"","thesis":"","proof":"","action":""},
    "caseOrder": [],
    "metadata": {"title":"","description":"","openGraph":{},"schemaPerson":{}},
    "altTextInventory": [{"ref":"","alt":"","decorative":false}],
    "outputVariants": {"web":[],"fullPdf":[],"onePager":[]},
    "aboutSection": {"heading":"About","paragraphs":[]},
    "contactSection": {"heading":"Contact","lines":[]}
  },
  "assumptions": [],
  "missing": [],
  "confidence": "high|medium|low"
}`;

export const agent4Architect: Stage = {
  id: 'agent-4-architect',
  kind: 'agent',
  methodName: 'Agente 4 — Arquitecto de Contenido',
  phaseId: 'structure',

  async run({ state, emit }: StageContext): Promise<StageOutcome> {
    emit('Deciding what the reader sees first');

    const directives = takeDirectives(state, 'agent-4-architect');

    // The architect needs headlines and structure, not the full body text of every case.
    const caseSummaries = state.caseNarratives.map((c) => ({
      id: c.id,
      title: c.title,
      impactHeadline: c.impactHeadline,
      starSummary: c.starSummary,
      workType: c.workType,
      headings: c.blocks.map((b) => b.heading),
      totalWords: c.totalWords,
      visuals: c.visualScript.map((v) => ({ ref: `${c.id}-block-${v.block}`, alt: v.altText, status: v.status })),
    }));

    const output = await generateJson<Output>({
      stage: 'agent-4-architect',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: [
        `CASES\n${asJson(caseSummaries)}`,
        `STRATEGIC BRIEF\n${asJson(state.strategicBrief)}`,
        `PROFILE\n${asJson(state.rawProfile)}`,
        `PREFERRED FORMAT: ${state.rawProfile?.preferredFormat || 'both'}`,
        `MODE: ${state.mode}`,
        `EVIDENCE GAPS\n${asJson(state.curatedInventory?.gaps ?? [])}`,
        directiveBlock(directives),
        'Produce the content model.',
      ].join('\n\n'),
      temperature: 0.3,
      maxOutputTokens: 6144,
    });

    state.contentModel = normalise(output.contentModel, state);

    return {
      decision: `${state.contentModel.siteMap.length} route(s); hero leads with "${truncateSafe(
        state.contentModel.heroBlock.proof,
        60,
      )}"`,
      reasoning:
        output.assumptions?.join('; ') ||
        'Content modelled before layout; case order follows reader logic, not chronology.',
      confidence: output.confidence ?? 'medium',
    };
  },
};

function normalise(model: ContentModel, state: StageContext['state']): ContentModel {
  const knownIds = state.caseNarratives.map((c) => c.id);
  const order = (model.caseOrder ?? []).filter((id) => knownIds.includes(id));
  const missing = knownIds.filter((id) => !order.includes(id));

  return {
    ...model,
    domainModel: model.domainModel ?? { entities: [], relations: [] },
    contentTypes: model.contentTypes ?? [],
    priorityGuides: model.priorityGuides ?? [],
    siteMap: model.siteMap ?? [],
    caseOrder: [...order, ...missing],
    metadata: {
      title: clip(model.metadata?.title ?? '', 60),
      description: clip(model.metadata?.description ?? '', 155),
      openGraph: model.metadata?.openGraph ?? {},
      schemaPerson: model.metadata?.schemaPerson ?? {},
    },
    altTextInventory: model.altTextInventory ?? [],
    outputVariants: model.outputVariants ?? { web: [], fullPdf: [], onePager: [] },
    aboutSection: model.aboutSection ?? { heading: 'About', paragraphs: [] },
    contactSection: model.contactSection ?? { heading: 'Contact', lines: [] },
  };
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max).trimEnd();
}

function truncateSafe(text: string | undefined, max: number): string {
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
