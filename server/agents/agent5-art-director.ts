/**
 * AGENT 5 — Art director. [Phase 5: visual direction and design system]
 *
 * Generates a visual system derived from the professional, their audience and
 * their evidence — not picked from a catalogue of templates. This stage is the
 * direct answer to the problem the whole method exists to solve: templates impose
 * structure, tone and style instead of deriving them.
 *
 * Note on division of labour: the model proposes the palette, but it does not get
 * the final word on whether it passes. Contrast ratios are recomputed in code by
 * the visual gate, and the model's own claims about them are discarded.
 */

import type { Stage, StageContext, StageOutcome } from '../core/contract';
import { asJson, directiveBlock, takeDirectives } from '../core/contract';
import { generateJson } from '../llm/client';
import { verifyTokenContrast } from '../checks/contrast';
import type { Confidence, VisualSystem } from '../../shared/types';

interface Output {
  visualSystem: VisualSystem;
  assumptions: string[];
  confidence: Confidence;
}

const SYSTEM_PROMPT = `You are an art director and design-system architect. You generate a complete
visual system derived from the professional, their audience and their evidence. You do not choose
templates: you build tokens and components.

FOUNDATION
Atomic Design (Frost): build systems, not pages — atoms, molecules, organisms, templates, pages.
Grid and hierarchy in the Swiss editorial tradition (Müller-Brockmann).
Accessibility to WCAG 2.2 level AA, the level most regulations reference.

TASKS
1. COLOUR TOKENS. background, surface, textPrimary, textSecondary, accent, accentText (the text
   colour that sits on top of an accent fill), border, success, warning. All as 6-digit hex.
   Every text/background pair must clear its threshold. Assume the numbers will be recomputed
   independently — get them right rather than claiming they are right.
2. TYPOGRAPHY. At most 2 families (one for body, one for headings) with a system fallback stack.
   Use widely available system or open faces only — no remote font hosting is permitted.
   Modular scale on a fixed ratio (1.200, 1.250 or 1.333). Base size 16-18px. Target line length
   45-75 characters. Body line height at least 1.5. At most 3 weights.
3. SPACING. A scale built on a 4px or 8px unit, with at least 7 steps.
4. GRID. Columns, gutter, margin, breakpoints. Must work at 320px with no horizontal scrolling.
5. ATOMIC COMPONENTS. atoms (link, button, tag, image, quote, metric, heading), molecules (case
   card, before/after block, result block, image caption), organisms (site header, case grid,
   case section, footer), templates (home, case, about, contact).
6. STATES: rest, hover, visible focus, active, disabled. The focus indicator must be visible and
   must not be obscured by other content.
7. TAP TARGETS: minimum 24x24 CSS pixels for every interactive target.
8. IMAGE TREATMENT: permitted ratios, cropping, how screenshots are handled, whether device
   frames are used, formats and weight budgets in KB.
9. RATIONALE: one sentence per decision, tied back to the brief. For example: "serif body text
   because the target sector scores 4 on formality and the dominant evidence is long-form reading".

INVIOLABLE ACCESSIBILITY RULES
- Contrast at least 4.5:1 for normal text; at least 3:1 for large text (24px, or 18.66px bold);
  at least 3:1 for interface components and graphical objects.
- Colour is never the only carrier of meaning.
- Respect prefers-reduced-motion. No animation is required to understand the content.

SUBORDINATION RULES
- The visual system serves the content. If an effect competes with reading, remove it.
- No entrance animations that delay reading. No scrolljacking. No custom cursors.

ARCHETYPE BEHAVIOUR
- editorial: comfortable reading column, strong typographic hierarchy, images in support
- gallery: the image is the argument; minimal supporting text; the grid leads
- executive_document: report structure, summaries on top, high information density, restrained colour
- technical: navigable index, data blocks, diagrams, tables

OUTPUT — one JSON object, nothing else:
{
  "visualSystem": {
    "archetype": "editorial|gallery|executive_document|technical",
    "tokens": {
      "color": {"background":"#","surface":"#","textPrimary":"#","textSecondary":"#","accent":"#","accentText":"#","border":"#","success":"#","warning":"#"},
      "type": {"bodyFamily":"","headingFamily":"","fallbacks":[],"basePx":16,"scaleRatio":1.25,"scale":{"xs":0,"sm":0,"base":0,"lg":0,"xl":0,"2xl":0,"3xl":0},"bodyLineHeight":1.6,"measureCh":68,"weights":[400,600]},
      "spacing": {"unit":8,"scale":[4,8,16,24,32,48,64,96]},
      "radius": {"sm":"","md":"","lg":""},
      "elevation": {"raised":"","overlay":""}
    },
    "contrastChecks": [{"pair":"","foreground":"#","background":"#","ratio":0,"required":4.5,"passes":true}],
    "grid": {"columns":12,"gutter":"","margin":"","breakpoints":[320,768,1024,1440]},
    "components": {"atoms":[],"molecules":[],"organisms":[],"templates":[]},
    "states": {"hover":"","focus":"","active":"","disabled":""},
    "imageTreatment": {"ratios":[],"formats":[],"budgetKb":{"hero":200,"inline":120}},
    "rationale": [{"decision":"","because":""}]
  },
  "assumptions": [],
  "confidence": "high|medium|low"
}`;

export const agent5ArtDirector: Stage = {
  id: 'agent-5-art-director',
  kind: 'agent',
  methodName: 'Agente 5 — Director de Arte',
  phaseId: 'design',

  async run({ state, emit }: StageContext): Promise<StageOutcome> {
    const decision = state.archetypeDecision;
    emit('Deriving a look from your field and your evidence');

    const directives = takeDirectives(state, 'agent-5-art-director');

    const output = await generateJson<Output>({
      stage: 'agent-5-art-director',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: [
        `ARCHETYPE (already decided — build for it, do not re-choose): ${decision?.archetype}`,
        `WHY THAT ARCHETYPE: ${decision?.justification ?? ''}`,
        `VISUAL CONSTRAINTS\n${asJson(decision?.constraints)}`,
        `STRATEGIC BRIEF\n${asJson(state.strategicBrief)}`,
        `EVIDENCE PROFILE\n${asJson(decision?.evidenceProfile)}`,
        `THEIR VISUAL REFERENCES\n${asJson(state.rawProfile?.visualReferences ?? [])}`,
        `THEIR EXISTING BRAND (hard constraint if present)\n${asJson(state.rawProfile?.existingBrand ?? {})}`,
        directiveBlock(directives),
        'Produce the visual system.',
      ].join('\n\n'),
      temperature: 0.4,
      maxOutputTokens: 6144,
    });

    const system = normalise(output.visualSystem, decision?.archetype ?? 'editorial');

    // The model's own contrast claims are replaced with computed values. Section H.4:
    // a language model must not calculate contrast ratios.
    system.contrastChecks = verifyTokenContrast(system.tokens);
    state.visualSystem = system;

    const failing = system.contrastChecks.filter((c) => !c.passes).length;
    emit(
      failing === 0
        ? 'Colour and type checked for readability'
        : `${failing} colour pair(s) need adjusting — reworking`,
    );

    return {
      decision: `${system.archetype} system; ${system.tokens.type.bodyFamily} / ${system.tokens.type.headingFamily}`,
      reasoning:
        output.assumptions?.join('; ') ||
        (system.rationale ?? []).map((r) => `${r.decision}: ${r.because}`).join('; ') ||
        'Tokens derived from archetype and formality index.',
      confidence: output.confidence ?? 'medium',
    };
  },
};

function normalise(system: VisualSystem, archetype: VisualSystem['archetype']): VisualSystem {
  const tokens = system?.tokens ?? ({} as VisualSystem['tokens']);
  return {
    archetype: system?.archetype ?? archetype,
    tokens: {
      color: {
        background: '#ffffff',
        surface: '#f6f5f2',
        textPrimary: '#1a1a1a',
        textSecondary: '#4a4a4a',
        accent: '#1f4d3d',
        accentText: '#ffffff',
        border: '#c9c6bf',
        success: '#1e6b45',
        warning: '#8a5a00',
        ...(tokens.color ?? {}),
      },
      type: {
        bodyFamily: 'Georgia',
        headingFamily: 'Georgia',
        fallbacks: ['serif'],
        basePx: 17,
        scaleRatio: 1.25,
        scale: { xs: 13, sm: 15, base: 17, lg: 21, xl: 27, '2xl': 33, '3xl': 42 },
        bodyLineHeight: 1.6,
        measureCh: 66,
        weights: [400, 700],
        ...(tokens.type ?? {}),
      },
      spacing: tokens.spacing ?? { unit: 8, scale: [4, 8, 16, 24, 32, 48, 64, 96] },
      radius: tokens.radius ?? { sm: '4px', md: '8px', lg: '16px' },
      elevation: tokens.elevation ?? { raised: '0 1px 2px rgba(0,0,0,.08)', overlay: '0 8px 24px rgba(0,0,0,.12)' },
    },
    contrastChecks: [],
    grid: system?.grid ?? { columns: 12, gutter: '24px', margin: '24px', breakpoints: [320, 768, 1024, 1440] },
    components: system?.components ?? { atoms: [], molecules: [], organisms: [], templates: [] },
    states: system?.states ?? {},
    imageTreatment: system?.imageTreatment ?? { ratios: ['16:9', '4:3'], formats: ['webp', 'jpg'], budgetKb: { hero: 200, inline: 120 } },
    rationale: system?.rationale ?? [],
  };
}
