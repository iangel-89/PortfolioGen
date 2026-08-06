/**
 * Deterministic artifact renderer.
 *
 * Emits every deliverable file from the content model, the case narratives and
 * the builder's plan. Nothing here talks to a model.
 *
 * Everything the accessibility gate can check in markup is guaranteed here:
 *   - exactly one <h1> per page, heading levels never skipped
 *   - header / nav / main / footer landmarks on every page
 *   - lang declared on <html>
 *   - a skip link to #main
 *   - no third-party requests of any kind
 *   - alt text drawn from the alt-text inventory, decorative images marked empty
 *
 * Images the person has not supplied are rendered as visible placeholders telling
 * them exactly what to capture, with the alt text already written and a ready-made
 * <img> line to uncomment. No <img> element is emitted for a file that does not
 * exist, because an image tag pointing at nothing is a broken page, not a draft.
 */

import type {
  Artifact,
  CaseNarrative,
  GeneratedFile,
  SessionState,
  VisualCue,
} from '../../shared/types';
import type { BuildPlan } from '../agents/agent6-builder';

const WORK_TYPE_LABEL: Record<string, string> = {
  professional: 'Professional work',
  academic: 'Academic work',
  volunteer: 'Volunteer work',
  personal: 'Self-directed work',
};

const SOURCE_LABEL: Record<string, string> = {
  measured: 'measured',
  estimated: 'estimated',
  client_reported: 'reported by the client',
  unsourced: 'no source given',
};

export function renderSite(state: SessionState, plan: BuildPlan): Artifact {
  const ctx = buildContext(state, plan);

  const files: GeneratedFile[] = [];
  const push = (path: string, kind: GeneratedFile['kind'], purpose: string, contents: string) => {
    files.push({ path, kind, purpose, contents, bytes: Buffer.byteLength(contents, 'utf8') });
  };

  push('styles.css', 'css', 'The design system for every page', ctx.stylesheet);

  const home = renderHome(ctx);
  push('index.html', 'html', 'Your home page — start here', home);

  const casePaths: string[] = [];
  for (const item of ctx.cases) {
    casePaths.push(item.path);
    push(item.path, 'html', `Case study: ${item.narrative.title}`, renderCasePage(ctx, item));
  }

  push('about.html', 'html', 'Your about page', renderAbout(ctx));
  push(
    'portfolio-print.html',
    'html',
    'The whole portfolio in one page — open it and print to PDF',
    renderPrintDocument(ctx),
  );
  push(
    'one-page.html',
    'html',
    'One-page summary to send alongside an application',
    renderOnePager(ctx),
  );
  push(
    'case-studies.md',
    'markdown',
    'The written content as plain text, to reuse in emails, LinkedIn or interviews',
    renderCaseMarkdown(ctx),
  );

  const toCapture = ctx.cases.flatMap((c) =>
    c.narrative.visualScript.filter((v) => v.status === 'to_capture').map((v) => ({ case: c.narrative.title, cue: v })),
  );
  if (toCapture.length) {
    push(
      'images-to-capture.md',
      'markdown',
      'The images that would make the portfolio stronger, and what each one should show',
      renderCaptureList(toCapture),
    );
  }

  const homepageBytes =
    (files.find((f) => f.path === 'index.html')?.bytes ?? 0) +
    (files.find((f) => f.path === 'styles.css')?.bytes ?? 0);

  const budgetOverruns: string[] = [];
  const cssKb = (files.find((f) => f.path === 'styles.css')?.bytes ?? 0) / 1024;
  if (cssKb > 50) budgetOverruns.push(`Stylesheet is ${cssKb.toFixed(1)}KB against a 50KB budget.`);
  if (homepageBytes / 1024 > 1024) {
    budgetOverruns.push(`Home page is ${(homepageBytes / 1024).toFixed(0)}KB against a 1MB budget.`);
  }

  return {
    files,
    manifest: {
      home: 'index.html',
      cases: casePaths,
      fullPdfSource: 'portfolio-print.html',
      onePager: 'one-page.html',
      caseText: 'case-studies.md',
    },
    // No raster assets are shipped, so the largest contentful paint is text.
    lcpResource: 'index.html — hero heading (text, no image request)',
    homepageBytes,
    budgetOverruns,
    publishingInstructions: plan.publishingInstructions ?? [],
    buildNotes: [
      ...(plan.buildNotes ?? []),
      'Markup emitted from the content model, so the text can be edited without touching the design.',
      ...(toCapture.length
        ? [`${toCapture.length} image slot(s) are marked in the pages with instructions for what to shoot.`]
        : []),
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Render context                                                      */
/* ------------------------------------------------------------------ */

interface CaseEntry {
  narrative: CaseNarrative;
  path: string;
  index: number;
  blurb: string;
}

interface RenderContext {
  state: SessionState;
  plan: BuildPlan;
  lang: string;
  name: string;
  siteTitle: string;
  metaTitle: string;
  metaDescription: string;
  stylesheet: string;
  cases: CaseEntry[];
  nav: { label: string; href: string; key: string }[];
}

function buildContext(state: SessionState, plan: BuildPlan): RenderContext {
  const model = state.contentModel;
  const hero = model?.heroBlock;
  const name = hero?.who?.trim() || state.rawProfile?.profession || 'Portfolio';

  const ordered = (model?.caseOrder ?? state.caseNarratives.map((c) => c.id))
    .map((id) => state.caseNarratives.find((c) => c.id === id))
    .filter((c): c is CaseNarrative => Boolean(c));

  const cases: CaseEntry[] = ordered.map((narrative, index) => ({
    narrative,
    index,
    path: `case-${String(index + 1).padStart(2, '0')}-${slugify(narrative.title)}.html`,
    blurb:
      plan.caseCards?.find((c) => c.id === narrative.id)?.blurb?.trim() ||
      narrative.starSummary?.result ||
      '',
  }));

  const labels = plan.navLabels ?? { home: 'Home', work: 'Work', about: 'About', contact: 'Contact' };

  return {
    state,
    plan,
    lang: (state.language || 'en').slice(0, 2),
    name,
    siteTitle: plan.siteTitle?.trim() || name,
    metaTitle: model?.metadata?.title || `${name} — Portfolio`,
    metaDescription: model?.metadata?.description || hero?.thesis || '',
    stylesheet: plan.stylesheet?.trim() || FALLBACK_CSS,
    cases,
    nav: [
      { label: labels.work || 'Work', href: 'index.html#work', key: 'work' },
      { label: labels.about || 'About', href: 'about.html', key: 'about' },
      { label: labels.contact || 'Contact', href: 'index.html#contact', key: 'contact' },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Page shell                                                          */
/* ------------------------------------------------------------------ */

interface ShellOptions {
  ctx: RenderContext;
  title: string;
  description: string;
  bodyClass: string;
  current: string;
  main: string;
  /** Emitted on the home page only. */
  structuredData?: boolean;
  stylesheetHref?: string;
  inlineStyles?: string;
}

function shell(options: ShellOptions): string {
  const { ctx } = options;
  const og = ctx.state.contentModel?.metadata?.openGraph ?? {};

  const head = [
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${escape(options.title)}</title>`,
    `  <meta name="description" content="${escape(options.description)}">`,
    `  <meta property="og:title" content="${escape(og['og:title'] ?? og.title ?? options.title)}">`,
    `  <meta property="og:description" content="${escape(
      og['og:description'] ?? og.description ?? options.description,
    )}">`,
    '  <meta property="og:type" content="profile">',
    options.stylesheetHref ? `  <link rel="stylesheet" href="${options.stylesheetHref}">` : '',
    options.inlineStyles ? `  <style>\n${options.inlineStyles}\n  </style>` : '',
    options.structuredData ? structuredData(ctx) : '',
  ]
    .filter(Boolean)
    .join('\n');

  return `<!doctype html>
<html lang="${escape(ctx.lang)}">
<head>
${head}
</head>
<body class="${escape(options.bodyClass)}">
  <a class="skip-link" href="#main">Skip to main content</a>
  <header class="site-header">
    <a class="site-logo" href="index.html">${escape(ctx.siteTitle)}</a>
    <nav class="site-nav" aria-label="Main">
      <ul>
${ctx.nav
  .map(
    (item) =>
      `        <li><a href="${item.href}"${
        item.key === options.current ? ' aria-current="page"' : ''
      }>${escape(item.label)}</a></li>`,
  )
  .join('\n')}
      </ul>
    </nav>
  </header>
  <main id="main">
${options.main}
  </main>
  <footer class="site-footer">
    <p>${escape(ctx.plan.footerLine || `${ctx.name} — portfolio`)}</p>
${disclosure(ctx)}
  </footer>
</body>
</html>
`;
}

function structuredData(ctx: RenderContext): string {
  const person = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: ctx.name,
    jobTitle: ctx.state.rawProfile?.profession || undefined,
    description: ctx.state.contentModel?.heroBlock?.thesis || undefined,
    ...(ctx.state.contentModel?.metadata?.schemaPerson ?? {}),
  };
  return `  <script type="application/ld+json">${JSON.stringify(person)}</script>`;
}

/** Phase 2 honesty rule: the work-type label stays visible in the finished piece. */
function disclosure(ctx: RenderContext): string {
  const types = new Set(ctx.cases.map((c) => c.narrative.workType));
  types.delete('professional');
  if (!types.size) return '';
  const listed = [...types].map((t) => WORK_TYPE_LABEL[t]?.toLowerCase() ?? t).join(' and ');
  return `    <p class="disclosure">This portfolio includes ${escape(
    listed,
  )}. Each case is labelled with the kind of work it was.</p>`;
}

/* ------------------------------------------------------------------ */
/* Home                                                                */
/* ------------------------------------------------------------------ */

function renderHome(ctx: RenderContext): string {
  const hero = ctx.state.contentModel?.heroBlock;
  const brief = ctx.state.strategicBrief;

  const main = [
    '    <section class="hero">',
    `      <h1 class="hero__name">${escape(ctx.name)}</h1>`,
    hero?.whatTheyDo ? `      <p class="hero__role">${escape(hero.whatTheyDo)}</p>` : '',
    hero?.thesis ? `      <p class="hero__thesis">${escape(hero.thesis)}</p>` : '',
    hero?.proof ? `      <p class="hero__proof">${escape(hero.proof)}</p>` : '',
    ctx.plan.heroSupportingLine
      ? `      <p class="hero__support">${escape(ctx.plan.heroSupportingLine)}</p>`
      : '',
    `      <p><a class="cta" href="#work">${escape(
      ctx.plan.ctaLabel || hero?.action || 'See the work',
    )}</a></p>`,
    '    </section>',
    brief?.takeaways?.length
      ? [
          '    <section class="takeaways" aria-labelledby="takeaways-heading">',
          '      <h2 id="takeaways-heading">What this work shows</h2>',
          '      <ul>',
          ...brief.takeaways.map((t) => `        <li>${escape(t)}</li>`),
          '      </ul>',
          '    </section>',
        ].join('\n')
      : '',
    '    <section id="work" aria-labelledby="work-heading">',
    `      <h2 id="work-heading">${escape(ctx.plan.navLabels?.work || 'Selected work')}</h2>`,
    '      <div class="case-grid">',
    ...ctx.cases.map((entry) => renderCaseCard(entry)),
    '      </div>',
    renderGallery(ctx),
    '    </section>',
    renderContact(ctx),
  ]
    .filter(Boolean)
    .join('\n');

  return shell({
    ctx,
    title: ctx.metaTitle,
    description: ctx.metaDescription,
    bodyClass: `page-home archetype-${ctx.state.visualSystem?.archetype ?? 'editorial'}`,
    current: 'work',
    main,
    structuredData: true,
    stylesheetHref: 'styles.css',
  });
}

function renderCaseCard(entry: CaseEntry): string {
  const { narrative, path, blurb } = entry;
  return [
    '        <article class="case-card">',
    `          <p class="case-card__type">${escape(WORK_TYPE_LABEL[narrative.workType] ?? 'Work')}</p>`,
    `          <h3 class="case-card__title"><a href="${path}">${escape(narrative.title)}</a></h3>`,
    narrative.impactHeadline
      ? `          <p class="case-card__headline">${escape(narrative.impactHeadline)}</p>`
      : '',
    blurb ? `          <p class="case-card__blurb">${escape(blurb)}</p>` : '',
    '        </article>',
  ]
    .filter(Boolean)
    .join('\n');
}

function renderGallery(ctx: RenderContext): string {
  const gallery = ctx.state.curatedInventory?.secondaryGallery ?? [];
  if (!gallery.length) return '';
  return [
    '      <div class="gallery">',
    '        <h3>Also worth mentioning</h3>',
    '        <ul>',
    ...gallery.map((g) => `          <li><strong>${escape(g.name)}</strong> — ${escape(g.oneLiner)}</li>`),
    '        </ul>',
    '      </div>',
  ].join('\n');
}

function renderContact(ctx: RenderContext): string {
  const contact = ctx.state.contentModel?.contactSection;
  if (!contact?.lines?.length) return '';
  return [
    '    <section id="contact" class="contact" aria-labelledby="contact-heading">',
    `      <h2 id="contact-heading">${escape(contact.heading || 'Contact')}</h2>`,
    '      <ul>',
    ...contact.lines.map((line) => `        <li>${escape(line)}</li>`),
    '      </ul>',
    '    </section>',
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/* Case page                                                           */
/* ------------------------------------------------------------------ */

function renderCasePage(ctx: RenderContext, entry: CaseEntry): string {
  const { narrative } = entry;
  const main = [
    '    <article>',
    '      <header class="case-header">',
    `        <p class="case-header__type">${escape(WORK_TYPE_LABEL[narrative.workType] ?? 'Work')}</p>`,
    `        <h1>${escape(narrative.title)}</h1>`,
    narrative.impactHeadline
      ? `        <p class="case-header__headline">${escape(narrative.impactHeadline)}</p>`
      : '',
    renderStar(narrative),
    '      </header>',
    ...narrative.blocks.map((block) => renderBlock(narrative, block)),
    renderEvidenceNote(narrative),
    '    </article>',
    `    <p><a class="cta" href="index.html#work">Back to all work</a></p>`,
  ]
    .filter(Boolean)
    .join('\n');

  return shell({
    ctx,
    title: `${narrative.title} — ${ctx.name}`,
    description: narrative.impactHeadline || ctx.metaDescription,
    bodyClass: `page-case archetype-${ctx.state.visualSystem?.archetype ?? 'editorial'}`,
    current: 'work',
    main,
    stylesheetHref: 'styles.css',
  });
}

function renderStar(narrative: CaseNarrative): string {
  const star = narrative.starSummary;
  if (!star) return '';
  const rows: [string, string][] = [
    ['Situation', star.situation],
    ['Task', star.task],
    ['Action', star.action],
    ['Result', star.result],
  ];
  const present = rows.filter(([, value]) => Boolean(value));
  if (!present.length) return '';
  return [
    '        <dl class="case-star">',
    ...present.flatMap(([term, value]) => [
      `          <dt>${term}</dt>`,
      `          <dd>${escape(value)}</dd>`,
    ]),
    '        </dl>',
  ].join('\n');
}

function renderBlock(narrative: CaseNarrative, block: CaseNarrative['blocks'][number]): string {
  const cue = narrative.visualScript.find((v) => v.block === block.n);
  return [
    '      <section class="case-block">',
    `        <h2>${escape(block.heading)}</h2>`,
    ...paragraphs(block.text).map((p) => `        <p>${escape(p)}</p>`),
    cue ? renderVisual(narrative, cue) : '',
    '      </section>',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * A slot rather than an image. The alt text is already written, and the ready-made
 * <img> line sits in a comment so the person only has to drop the file in and
 * uncomment it. Commented markup is invisible to the accessibility audit, which
 * is correct: there is no image on the page yet.
 */
function renderVisual(narrative: CaseNarrative, cue: VisualCue): string {
  const fileName = `images/${slugify(narrative.title)}-${cue.block}.jpg`;
  return [
    '        <figure class="visual-placeholder">',
    `          <figcaption><strong>Image to add:</strong> ${escape(cue.mustShow)}</figcaption>`,
    cue.userInstruction ? `          <p>${escape(cue.userInstruction)}</p>` : '',
    `          <!-- Save your image as ${fileName}, fill in its real pixel size, then delete this comment's wrapper and uncomment the line below.`,
    `          <img src="${fileName}" alt="${escape(cue.altText)}" width="1200" height="800" loading="lazy"> -->`,
    '        </figure>',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Every numeric claim shows where it came from. This is the point of the truthfulness gate. */
function renderEvidenceNote(narrative: CaseNarrative): string {
  const numeric = narrative.assertions.filter((a) => a.kind === 'numeric' && a.actionApplied !== 'removed');
  if (!numeric.length) return '';
  return [
    '      <section class="evidence-note" aria-labelledby="evidence-heading">',
    '        <h2 id="evidence-heading">Where these numbers come from</h2>',
    '        <ul>',
    ...numeric.map(
      (a) =>
        `          <li>${escape(a.text)} <em>(${escape(SOURCE_LABEL[a.source] ?? a.source)})</em></li>`,
    ),
    '        </ul>',
    '      </section>',
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/* About                                                               */
/* ------------------------------------------------------------------ */

function renderAbout(ctx: RenderContext): string {
  const about = ctx.state.contentModel?.aboutSection;
  const brief = ctx.state.strategicBrief;

  const main = [
    '    <section class="about">',
    `      <h1>${escape(about?.heading || 'About')}</h1>`,
    ...(about?.paragraphs ?? []).map((p) => `      <p>${escape(p)}</p>`),
    brief?.competencyMatrix?.length
      ? [
          '      <h2>What I work on</h2>',
          '      <ul>',
          ...brief.competencyMatrix.map((c) => `        <li>${escape(c.competency)}</li>`),
          '      </ul>',
        ].join('\n')
      : '',
    '    </section>',
    renderContact(ctx),
  ]
    .filter(Boolean)
    .join('\n');

  return shell({
    ctx,
    title: `About — ${ctx.name}`,
    description: ctx.metaDescription,
    bodyClass: `page-about archetype-${ctx.state.visualSystem?.archetype ?? 'editorial'}`,
    current: 'about',
    main,
    stylesheetHref: 'styles.css',
  });
}

/* ------------------------------------------------------------------ */
/* Print document and one-pager                                        */
/* ------------------------------------------------------------------ */

/** Self-contained: styles inlined so it prints correctly from anywhere, offline. */
function renderPrintDocument(ctx: RenderContext): string {
  const hero = ctx.state.contentModel?.heroBlock;
  const brief = ctx.state.strategicBrief;

  const main = [
    '    <section class="hero">',
    `      <h1 class="hero__name">${escape(ctx.name)}</h1>`,
    hero?.whatTheyDo ? `      <p class="hero__role">${escape(hero.whatTheyDo)}</p>` : '',
    hero?.thesis ? `      <p class="hero__thesis">${escape(hero.thesis)}</p>` : '',
    brief?.takeaways?.length
      ? [
          '      <ul class="takeaways">',
          ...brief.takeaways.map((t) => `        <li>${escape(t)}</li>`),
          '      </ul>',
        ].join('\n')
      : '',
    '    </section>',
    ...ctx.cases.map((entry) => {
      const n = entry.narrative;
      return [
        '    <article class="case-block">',
        `      <h2>${escape(n.title)}</h2>`,
        `      <p class="case-header__type">${escape(WORK_TYPE_LABEL[n.workType] ?? 'Work')}</p>`,
        n.impactHeadline ? `      <p class="case-header__headline">${escape(n.impactHeadline)}</p>` : '',
        ...n.blocks.flatMap((block) => [
          `      <h3>${escape(block.heading)}</h3>`,
          ...paragraphs(block.text).map((p) => `      <p>${escape(p)}</p>`),
        ]),
        '    </article>',
      ].join('\n');
    }),
  ]
    .filter(Boolean)
    .join('\n');

  return shell({
    ctx,
    title: `${ctx.name} — full portfolio`,
    description: ctx.metaDescription,
    bodyClass: 'page-print',
    current: '',
    main,
    inlineStyles: ctx.stylesheet,
  });
}

function renderOnePager(ctx: RenderContext): string {
  const hero = ctx.state.contentModel?.heroBlock;
  const brief = ctx.state.strategicBrief;

  const main = [
    '    <section class="hero">',
    `      <h1 class="hero__name">${escape(ctx.name)}</h1>`,
    hero?.whatTheyDo ? `      <p class="hero__role">${escape(hero.whatTheyDo)}</p>` : '',
    hero?.thesis ? `      <p class="hero__thesis">${escape(hero.thesis)}</p>` : '',
    '    </section>',
    brief?.takeaways?.length
      ? [
          '    <section class="takeaways">',
          '      <h2>What I bring</h2>',
          '      <ul>',
          ...brief.takeaways.map((t) => `        <li>${escape(t)}</li>`),
          '      </ul>',
          '    </section>',
        ].join('\n')
      : '',
    '    <section>',
    '      <h2>Selected work</h2>',
    '      <div class="case-grid">',
    ...ctx.cases.map((entry) =>
      [
        '        <article class="case-card">',
        `          <h3 class="case-card__title">${escape(entry.narrative.title)}</h3>`,
        entry.narrative.impactHeadline
          ? `          <p class="case-card__headline">${escape(entry.narrative.impactHeadline)}</p>`
          : '',
        entry.narrative.starSummary?.action
          ? `          <p class="case-card__blurb">${escape(entry.narrative.starSummary.action)}</p>`
          : '',
        '        </article>',
      ]
        .filter(Boolean)
        .join('\n'),
    ),
    '      </div>',
    '    </section>',
    renderContact(ctx),
  ]
    .filter(Boolean)
    .join('\n');

  return shell({
    ctx,
    title: `${ctx.name} — one page`,
    description: ctx.metaDescription,
    bodyClass: 'page-onepager',
    current: '',
    main,
    inlineStyles: ctx.stylesheet,
  });
}

/* ------------------------------------------------------------------ */
/* Markdown deliverables                                               */
/* ------------------------------------------------------------------ */

function renderCaseMarkdown(ctx: RenderContext): string {
  const lines: string[] = [`# ${ctx.name} — case studies`, ''];

  if (ctx.state.contentModel?.heroBlock?.thesis) {
    lines.push(`> ${ctx.state.contentModel.heroBlock.thesis}`, '');
  }

  for (const { narrative } of ctx.cases) {
    lines.push(`## ${narrative.title}`, '');
    lines.push(`*${WORK_TYPE_LABEL[narrative.workType] ?? 'Work'}*`, '');
    if (narrative.impactHeadline) lines.push(`**${narrative.impactHeadline}**`, '');

    const star = narrative.starSummary;
    if (star) {
      lines.push('**In short**', '');
      if (star.situation) lines.push(`- Situation: ${star.situation}`);
      if (star.task) lines.push(`- Task: ${star.task}`);
      if (star.action) lines.push(`- Action: ${star.action}`);
      if (star.result) lines.push(`- Result: ${star.result}`);
      lines.push('');
    }

    for (const block of narrative.blocks) {
      lines.push(`### ${block.heading}`, '', block.text, '');
    }

    const numeric = narrative.assertions.filter((a) => a.kind === 'numeric' && a.actionApplied !== 'removed');
    if (numeric.length) {
      lines.push('**Where these numbers come from**', '');
      for (const a of numeric) lines.push(`- ${a.text} (${SOURCE_LABEL[a.source] ?? a.source})`);
      lines.push('');
    }
    lines.push('---', '');
  }

  return lines.join('\n');
}

function renderCaptureList(items: { case: string; cue: VisualCue }[]): string {
  const lines = [
    '# Images worth capturing',
    '',
    'Each slot below is already marked in the pages, with its alt text written for you.',
    'Save the file into an `images/` folder next to the HTML, then uncomment the `<img>` line',
    'in the matching page and fill in the real pixel width and height.',
    '',
  ];
  for (const { case: caseTitle, cue } of items) {
    lines.push(`## ${caseTitle} — ${cue.kind.replace(/_/g, ' ')}`, '');
    lines.push(`- **What it should show:** ${cue.mustShow}`);
    if (cue.userInstruction) lines.push(`- **How to get it:** ${cue.userInstruction}`);
    lines.push(`- **Alt text (already written):** ${cue.altText}`, '');
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Utilities                                                           */
/* ------------------------------------------------------------------ */

export function escape(value: string | undefined | null): string {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function slugify(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'case'
  );
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Only reached if the builder returns nothing usable. Plain, readable, accessible. */
const FALLBACK_CSS = `:root{--background:#ffffff;--surface:#f6f5f2;--text-primary:#1a1a1a;--text-secondary:#4a4a4a;--accent:#1f4d3d;--accent-text:#ffffff;--border:#c9c6bf;--measure:66ch;--space-3:16px;--space-5:32px}
*{box-sizing:border-box}
body{margin:0;background:var(--background);color:var(--text-primary);font:17px/1.6 Georgia,'Times New Roman',serif}
.skip-link{position:absolute;left:-9999px}
.skip-link:focus{left:var(--space-3);top:var(--space-3);background:var(--accent);color:var(--accent-text);padding:12px;z-index:10}
.site-header,main,.site-footer{max-width:var(--measure);margin:0 auto;padding:var(--space-5) var(--space-3)}
.site-nav ul{display:flex;gap:var(--space-3);list-style:none;padding:0}
a{color:var(--accent)}
a:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
h1,h2,h3{line-height:1.2}
.case-card{border:1px solid var(--border);padding:var(--space-3);margin-bottom:var(--space-3)}
.visual-placeholder{border:1px dashed var(--border);background:var(--surface);padding:var(--space-3);margin:var(--space-3) 0}
.cta{display:inline-block;min-height:44px;padding:12px 20px;background:var(--accent);color:var(--accent-text);text-decoration:none}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
@media print{.site-nav,.skip-link,.cta{display:none}body{color:#000;background:#fff}}
`;
