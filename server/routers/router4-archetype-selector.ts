/**
 * ROUTER 4 — Composition archetype selector.
 *
 * This is the decision that replaces "pick a template". The archetype is computed
 * from the actual shape of the evidence and the formality of the target sector,
 * so two people in the same profession get different systems when their evidence
 * differs — which is the entire point of the method.
 *
 * Fully deterministic: the method specifies this as a decision matrix, and a
 * decision matrix implemented as a decision matrix cannot drift.
 */

import type { Stage, StageContext, StageOutcome } from '../core/contract';
import type { Archetype } from '../../shared/types';

export const router4ArchetypeSelector: Stage = {
  id: 'router-4-archetype-selector',
  kind: 'router',
  methodName: 'Router 4 — Selector de arquetipo',
  phaseId: 'structure',

  async run({ state, emit }: StageContext): Promise<StageOutcome> {
    const profile = computeEvidenceProfile(state);
    const { archetype, justification } = selectArchetype(profile);

    state.archetypeDecision = {
      archetype,
      evidenceProfile: profile,
      justification,
      constraints: {
        colorRange: colorRangeFor(profile.formality),
        typographicExpressiveness: expressivenessFor(profile.formality),
        maxDecorativeRatio: profile.formality >= 4 ? 0.1 : 0.3,
        existingBrand: state.rawProfile?.existingBrand ?? {},
      },
    };

    emit(`Shaping it as ${describe(archetype)}`);

    return {
      decision: `Archetype: ${archetype}`,
      reasoning: justification,
      route: archetype,
    };
  },
};

interface EvidenceProfile {
  visualRatio: number;
  textDensity: number;
  formality: number;
  dominantType: 'visual' | 'process' | 'data' | 'system';
}

function computeEvidenceProfile(state: StageContext['state']): EvidenceProfile {
  const cases = state.caseNarratives;
  const totalBlocks = cases.reduce((sum, c) => sum + c.blocks.length, 0) || 1;

  // Only images the person actually has count towards the visual ratio. Slots they
  // still have to shoot are not evidence of a visual practice.
  const availableVisuals = cases.reduce(
    (sum, c) => sum + c.visualScript.filter((v) => v.status === 'available').length,
    0,
  );

  const totalWords = cases.reduce((sum, c) => sum + c.totalWords, 0);
  const textDensity = cases.length ? Math.round(totalWords / cases.length) : 0;

  return {
    visualRatio: Math.round((availableVisuals / totalBlocks) * 100) / 100,
    textDensity,
    formality: state.strategicBrief?.formalityIndex ?? 3,
    dominantType: dominantEvidenceType(state),
  };
}

function dominantEvidenceType(state: StageContext['state']): EvidenceProfile['dominantType'] {
  const haystack = [
    state.rawProfile?.profession,
    state.rawProfile?.specialty,
    state.rawProfile?.targetRole,
    ...(state.strategicBrief?.competencyMatrix ?? []).map((c) => c.competency),
    ...(state.strategicBrief?.keyVocabulary ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const systemSignals = /engineer|developer|software|architect|infrastructure|devops|security|platform|systems/;
  const dataSignals = /data|analyst|analytics|research|scientist|statistic|machine learning|economist|actuar/;
  const visualSignals = /photograph|graphic|illustrat|interior|fashion|industrial design|art direct|film|video|brand/;

  if (systemSignals.test(haystack)) return 'system';
  if (dataSignals.test(haystack)) return 'data';
  if (visualSignals.test(haystack)) return 'visual';
  return 'process';
}

/**
 * The matrix from the method, in its stated precedence. Ties resolve
 * executive_document > editorial > technical > gallery: sector formality always
 * beats aesthetic preference.
 */
function selectArchetype(profile: EvidenceProfile): { archetype: Archetype; justification: string } {
  if (profile.formality >= 4) {
    return {
      archetype: 'executive_document',
      justification:
        `The target sector scores ${profile.formality}/5 on formality, so the piece reads as a report: ` +
        'summaries first, high information density, restrained colour.',
    };
  }

  if (profile.dominantType === 'system' || profile.dominantType === 'data') {
    return {
      archetype: 'technical',
      justification:
        'The evidence is systems and data rather than surfaces, so the structure is a navigable index ' +
        'with data blocks and diagrams.',
    };
  }

  if (profile.visualRatio > 0.6 && profile.formality <= 3) {
    return {
      archetype: 'gallery',
      justification:
        `${Math.round(profile.visualRatio * 100)}% of the content blocks have real visual material and the ` +
        'sector allows expressiveness, so the image carries the argument and the grid leads.',
    };
  }

  return {
    archetype: 'editorial',
    justification:
      `Averaging ${profile.textDensity} words per case with process as the dominant evidence, the argument ` +
      'is in the reasoning — so a comfortable reading column with strong typographic hierarchy, images in support.',
  };
}

function colorRangeFor(formality: number): string {
  if (formality >= 4) return 'One restrained accent, near-neutral surfaces, no saturated fills.';
  if (formality === 3) return 'One accent plus one supporting tone, moderate saturation.';
  return 'One accent with room for a secondary tone; saturation permitted where it does not compete with text.';
}

function expressivenessFor(formality: number): 'low' | 'medium' | 'high' {
  if (formality >= 4) return 'low';
  if (formality === 3) return 'medium';
  return 'high';
}

function describe(archetype: Archetype): string {
  switch (archetype) {
    case 'gallery':
      return 'a gallery, where the work is the argument';
    case 'executive_document':
      return 'a clear executive document';
    case 'technical':
      return 'a technical index';
    default:
      return 'an editorial read';
  }
}
