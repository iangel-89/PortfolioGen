/**
 * WCAG 2.2 contrast ratios — computed, never asked of a language model.
 *
 * Section H.4 of the method makes this explicit: deterministic verifications
 * (contrast ratios, file weights, attribute presence, heading hierarchy) run in
 * real code. The auditor agent interprets the numbers; it does not produce them.
 *
 * Formulae: WCAG 2.2 relative luminance and contrast ratio definitions.
 */

import type { ColorTokens, ContrastCheck, DesignTokens } from '../../shared/types';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Accepts #rgb, #rrggbb, and rgb()/rgba() notation. Returns null for anything else. */
export function parseColor(input: string): Rgb | null {
  if (!input) return null;
  const value = input.trim().toLowerCase();

  const hex = value.match(/^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3) {
      digits = digits
        .split('')
        .map((d) => d + d)
        .join('');
    }
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
    };
  }

  const rgb = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (rgb) {
    return { r: clampByte(rgb[1]), g: clampByte(rgb[2]), b: clampByte(rgb[3]) };
  }

  return null;
}

function clampByte(raw: string): number {
  return Math.min(255, Math.max(0, Math.round(Number(raw))));
}

/** WCAG relative luminance. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (raw: number) => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio between two colours, 1..21. Returns 0 when a colour cannot be parsed. */
export function contrastRatio(foreground: string, background: string): number {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (!fg || !bg) return 0;
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return round2((lighter + 0.05) / (darker + 0.05));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Token-set verification                                              */
/* ------------------------------------------------------------------ */

/** WCAG 1.4.3 / 1.4.11 thresholds. */
export const THRESHOLD = {
  normalText: 4.5,
  largeText: 3,
  nonText: 3,
} as const;

interface PairSpec {
  pair: string;
  fg: keyof ColorTokens;
  bg: keyof ColorTokens;
  required: number;
}

const REQUIRED_PAIRS: PairSpec[] = [
  { pair: 'body text on page background', fg: 'textPrimary', bg: 'background', required: THRESHOLD.normalText },
  { pair: 'body text on surface', fg: 'textPrimary', bg: 'surface', required: THRESHOLD.normalText },
  { pair: 'secondary text on page background', fg: 'textSecondary', bg: 'background', required: THRESHOLD.normalText },
  { pair: 'secondary text on surface', fg: 'textSecondary', bg: 'surface', required: THRESHOLD.normalText },
  { pair: 'accent text on page background', fg: 'accent', bg: 'background', required: THRESHOLD.normalText },
  { pair: 'text on accent fill', fg: 'accentText', bg: 'accent', required: THRESHOLD.normalText },
  { pair: 'border against background', fg: 'border', bg: 'background', required: THRESHOLD.nonText },
  { pair: 'accent as interface component', fg: 'accent', bg: 'surface', required: THRESHOLD.nonText },
];

/**
 * Runs every mandatory colour pair. This is the authority Router 5 uses —
 * whatever the art-direction stage claimed about its own palette is discarded
 * and replaced by these numbers.
 */
export function verifyTokenContrast(tokens: DesignTokens): ContrastCheck[] {
  const color = tokens.color;
  return REQUIRED_PAIRS.map(({ pair, fg, bg, required }) => {
    const foreground = color[fg] ?? '';
    const background = color[bg] ?? '';
    const ratio = contrastRatio(foreground, background);
    return {
      pair,
      foreground,
      background,
      ratio,
      required,
      // A ratio of 0 means unparseable — treat as a failure, not a pass.
      passes: ratio >= required,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Typography rules (Router 5, checks V2)                              */
/* ------------------------------------------------------------------ */

export interface TypographyCheck {
  rule: string;
  actual: string;
  required: string;
  passes: boolean;
}

export function verifyTypography(tokens: DesignTokens): TypographyCheck[] {
  const t = tokens.type;
  const families = new Set([t.bodyFamily, t.headingFamily].filter(Boolean));
  const weights = t.weights ?? [];

  return [
    {
      rule: 'Type families',
      actual: String(families.size),
      required: 'at most 2',
      passes: families.size <= 2 && families.size >= 1,
    },
    {
      rule: 'Type weights',
      actual: String(weights.length),
      required: 'at most 3',
      passes: weights.length > 0 && weights.length <= 3,
    },
    {
      rule: 'Base font size',
      actual: `${t.basePx}px`,
      required: 'at least 16px',
      passes: t.basePx >= 16,
    },
    {
      rule: 'Body line height',
      actual: String(t.bodyLineHeight),
      required: 'at least 1.5',
      passes: t.bodyLineHeight >= 1.5,
    },
    {
      rule: 'Line length',
      actual: `${t.measureCh}ch`,
      required: '45–75ch',
      passes: t.measureCh >= 45 && t.measureCh <= 75,
    },
    {
      rule: 'Modular scale ratio',
      actual: String(t.scaleRatio),
      required: 'between 1.15 and 1.4',
      passes: t.scaleRatio >= 1.15 && t.scaleRatio <= 1.4,
    },
  ];
}

/**
 * Last-resort repair so a single bad token never blocks delivery after retries
 * are exhausted. Darkens or lightens the foreground until it clears the
 * threshold against its own background.
 */
export function forceContrast(foreground: string, background: string, required: number): string {
  const bg = parseColor(background);
  const fg = parseColor(foreground);
  if (!bg || !fg) return foreground;

  const bgLuminance = relativeLuminance(bg);
  const goDarker = bgLuminance > 0.4;

  let best = fg;
  for (let step = 0; step <= 100; step++) {
    const factor = step / 100;
    const candidate: Rgb = goDarker
      ? { r: Math.round(fg.r * (1 - factor)), g: Math.round(fg.g * (1 - factor)), b: Math.round(fg.b * (1 - factor)) }
      : {
          r: Math.round(fg.r + (255 - fg.r) * factor),
          g: Math.round(fg.g + (255 - fg.g) * factor),
          b: Math.round(fg.b + (255 - fg.b) * factor),
        };
    best = candidate;
    if (contrastRatio(toHex(candidate), background) >= required) break;
  }
  return toHex(best);
}

export function toHex({ r, g, b }: Rgb): string {
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
