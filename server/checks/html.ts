/**
 * Structural HTML audit — machine-checkable WCAG 2.2 AA criteria and performance proxies.
 *
 * Deliberately dependency-free and deliberately conservative: it reports only
 * what can be established from the markup itself. Anything that needs a browser
 * or a human (reading order, alt-text quality, language clarity, real tap-target
 * sizes) is left out and surfaced as "requires human judgement" by the auditor.
 */

import type { MachineFindings } from '../../shared/types';

type HtmlFinding = MachineFindings['html'][number];

export function auditHtml(file: string, html: string): HtmlFinding {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');

  return {
    file,
    hasLangAttribute: /<html[^>]*\slang\s*=\s*["'][a-z]{2}(-[A-Za-z0-9]+)?["']/i.test(withoutComments),
    h1Count: countTags(withoutComments, 'h1'),
    headingSkips: findHeadingSkips(withoutComments),
    landmarks: {
      header: hasTag(withoutComments, 'header') || hasRole(withoutComments, 'banner'),
      nav: hasTag(withoutComments, 'nav') || hasRole(withoutComments, 'navigation'),
      main: hasTag(withoutComments, 'main') || hasRole(withoutComments, 'main'),
      footer: hasTag(withoutComments, 'footer') || hasRole(withoutComments, 'contentinfo'),
    },
    imagesMissingAlt: countImagesMissing(withoutComments, /\salt\s*=/i),
    imagesMissingDimensions: countImagesMissingDimensions(withoutComments),
    hasSkipLink: /<a[^>]+href\s*=\s*["']#(main|content|main-content)["'][^>]*>/i.test(withoutComments),
    externalResources: findExternalResources(withoutComments),
    scriptCount: countTags(withoutComments, 'script'),
    hasTitle: /<title>[^<]{1,}<\/title>/i.test(withoutComments),
    hasMetaDescription: /<meta[^>]+name\s*=\s*["']description["'][^>]+content\s*=\s*["'][^"']{1,}["']/i.test(
      withoutComments,
    ),
    hasOpenGraph: /<meta[^>]+property\s*=\s*["']og:/i.test(withoutComments),
    hasStructuredData: /<script[^>]+type\s*=\s*["']application\/ld\+json["']/i.test(withoutComments),
    bytes: Buffer.byteLength(html, 'utf8'),
  };
}

function hasTag(html: string, tag: string): boolean {
  return new RegExp(`<${tag}[\\s>]`, 'i').test(html);
}

function hasRole(html: string, role: string): boolean {
  return new RegExp(`role\\s*=\\s*["']${role}["']`, 'i').test(html);
}

function countTags(html: string, tag: string): number {
  return (html.match(new RegExp(`<${tag}[\\s>]`, 'gi')) ?? []).length;
}

/** WCAG 1.3.1 — heading levels must not skip (h2 -> h4 is a skip). */
function findHeadingSkips(html: string): string[] {
  const headings = [...html.matchAll(/<h([1-6])[\s>]/gi)].map((m) => Number(m[1]));
  const skips: string[] = [];
  let previous = 0;
  for (const level of headings) {
    if (previous !== 0 && level > previous + 1) {
      skips.push(`h${previous} is followed by h${level}`);
    }
    previous = level;
  }
  return skips;
}

function eachImgTag(html: string): string[] {
  return html.match(/<img\b[^>]*>/gi) ?? [];
}

function countImagesMissing(html: string, attribute: RegExp): number {
  return eachImgTag(html).filter((tag) => !attribute.test(tag)).length;
}

/** CLS prevention: every <img> needs explicit width and height. */
function countImagesMissingDimensions(html: string): number {
  return eachImgTag(html).filter((tag) => !/\swidth\s*=/i.test(tag) || !/\sheight\s*=/i.test(tag)).length;
}

/** The build rule is zero third-party dependencies: no remote scripts, styles or fonts. */
function findExternalResources(html: string): string[] {
  const found = new Set<string>();
  const patterns = [
    /<script[^>]+src\s*=\s*["'](https?:\/\/[^"']+)["']/gi,
    /<link[^>]+href\s*=\s*["'](https?:\/\/[^"']+)["']/gi,
    /<img[^>]+src\s*=\s*["'](https?:\/\/[^"']+)["']/gi,
    /@import\s+url\(\s*["']?(https?:\/\/[^"')]+)/gi,
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      found.add(match[1]);
    }
  }
  return [...found];
}

/* ------------------------------------------------------------------ */
/* Performance budgets (lab proxies only — never field claims)          */
/* ------------------------------------------------------------------ */

export interface BudgetSpec {
  item: string;
  budgetKb: number;
}

/** Budgets from Phase 6 of the method. */
export const BUDGETS: BudgetSpec[] = [
  { item: 'Homepage HTML', budgetKb: 200 },
  { item: 'Stylesheet', budgetKb: 50 },
  { item: 'Homepage total weight', budgetKb: 1024 },
];

export function checkBudgets(sizes: Record<string, number>): MachineFindings['budgets'] {
  return BUDGETS.map(({ item, budgetKb }) => {
    const actualKb = Math.round(((sizes[item] ?? 0) / 1024) * 10) / 10;
    return { item, actualKb, budgetKb, withinBudget: actualKb <= budgetKb };
  });
}
