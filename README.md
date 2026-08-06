# PortfolioGen

A conversational portfolio builder. Someone answers a handful of plain questions about their
work; they get back publishable pages, a print version, and the written text to reuse elsewhere.

The whole thing runs on a staged agent pipeline — nine agents and eight routers, with hard quality
gates — and none of that is ever visible to the person using it. They see a chat, a progress list
in ordinary language, and a finished result.

The difference from a template builder: style, tone and structure are **derived** from the
person's profession, target audience and the real shape of their evidence. They are outputs of the
process, not inputs. Two people in the same field get different portfolios when their evidence
differs.

---

## Running it

```bash
npm install
cp .env.example .env      # add your GEMINI_API_KEY
npm run dev               # http://localhost:3000
```

```bash
npm run build && npm start   # production
npm run lint                 # tsc --noEmit
```

Without an API key the interface loads and says so in a banner; nothing can be generated.

---

## How it works

```
  chat  ──▶  Agent 0: interviewer  ──▶  raw profile + projects
                                              │
  ┌───────────────────────────────────────────┘
  │
  ├─ R0 intake gate ····· enough to start? standard or capabilities mode?
  ├─ A1 strategist ······ who this must convince, the thesis, three takeaways     [phase 1]
  ├─ R1 strategy gate ··· swap test on the thesis → selection criteria
  ├─ A2 curator ········· score every project, pick 3–5, find the gaps            [phase 2]
  ├─ R2 evidence gate ··· set the mode, trim, reduce context for writing
  ├─ A3 narrator ········ seven-element case studies, one writer per case         [phase 3]
  ├─ R3 integrity gate ·· BLOCKING: truthfulness, attribution, confidentiality
  ├─ A4 architect ······· content model, priority guides, metadata, alt text      [phase 4]
  ├─ R4 archetype ······· evidence profile → editorial / gallery / executive / technical
  ├─ A5 art director ···· design tokens, type scale, grid, components             [phase 5]
  ├─ R5 visual gate ····· BLOCKING: recomputed contrast + typography rules
  ├─ A6 builder ········· stylesheet + composition → deterministic renderer       [phase 6]
  ├─ R6 audit planner ··· scope the audit to what was actually built
  ├─ A7 auditor ········· six gates, interpreting measurements it did not take    [phase 7]
  ├─ R7 quality gate ···· ship, retry (max 2), or escalate in plain language
  └─ A8 packager ······· the delivery document the person actually reads
```

The user sees seven phases in plain English — "Finding your angle", "Choosing what to show",
"Writing your case studies" — streamed over SSE as each one runs. Nothing mentions agents, gates
or retries. When a gate sends work back, the affected phase simply becomes active again.

### Two decisions worth knowing about

**Measurements are computed, never asked of a model.** Contrast ratios, page weights, heading
hierarchy, landmark presence, alt attributes, image dimensions, third-party requests — all of it
runs in `server/checks/`. The auditor receives the numbers and decides what they mean. A model
that talks itself into approving a 2.9:1 contrast ratio cannot ship it: `reconcile()` in
`agent7-auditor.ts` overrides the verdict from the measurements.

**Markup is emitted by code, not generated.** The builder agent writes the stylesheet and makes
the composition calls that need judgement; `server/render/renderer.ts` emits the HTML from the
content model. Everything the accessibility gate checks in markup is therefore true by
construction rather than probable. It also means the text can be re-rendered after an edit without
regenerating anything.

---

## Changing a stage

Every stage implements one interface (`server/core/contract.ts`):

```ts
interface Stage {
  id: string;
  kind: 'agent' | 'router' | 'checker' | 'renderer';
  phaseId: string;
  run(ctx: StageContext): Promise<StageOutcome>;
}
```

The orchestrator knows nothing else about any stage. So:

| To do this | Edit this |
| --- | --- |
| Change how a stage behaves | its own file in `server/agents/` or `server/routers/` |
| Reorder, add or remove a stage | the `STAGES` array in `server/core/pipeline.ts` |
| Rename what the user sees | the `PHASES` array in `server/core/pipeline.ts` |
| Replace a model stage with plain code | rewrite `run()`; the signature is the same |
| Change which model a stage uses | `STAGE_MODEL` in `server/llm/client.ts` |
| Change the interview questions | the system prompt in `agent0-interviewer.ts` |
| Change what the finished site looks like | `agent6-builder.ts` (styles) or `render/renderer.ts` (structure) |
| Change the delivered document's format | `assembleMarkdown()` in `agent8-packager.ts` |
| Change a quality threshold | `server/checks/contrast.ts` or `server/checks/html.ts` |

Loops are backward jumps in the flat `STAGES` list. A gate returns
`retry: { stageId, instructions }`; the orchestrator writes the instructions into
`state.directives[stageId]`, jumps there, and re-runs everything downstream. Each gate owns its
own retry budget (two) and escalates to the user in plain language rather than looping.

---

## Layout

```
shared/types.ts            the state contract, shared by client and server
server/
  api.ts                   HTTP surface: session, chat, SSE build, files, ZIP export
  core/
    contract.ts            the Stage interface every stage implements
    pipeline.ts            the orchestrator — STAGES and PHASES live here
    state.ts               session factory + in-memory store
  agents/                  one file per agent, 0 through 8
  routers/                 one file per router, 0 through 7
  checks/                  contrast maths and HTML auditing — no model calls
  render/renderer.ts       deterministic HTML/CSS/Markdown emission
  llm/client.ts            the only place that talks to a model
  output/zip.ts            dependency-free ZIP writer for the export
src/
  App.tsx                  shell: welcome → interview → building → result
  hooks/useSession.ts      all client state
  components/              presentational only
  lib/                     API client, small Markdown renderer
```

---

## What the person receives

| File | What it is |
| --- | --- |
| `index.html` | Home page — hero, takeaways, case cards, contact |
| `case-NN-*.html` | One page per case study |
| `about.html` | About page |
| `styles.css` | The design system, tokens first |
| `portfolio-print.html` | Everything in one page, laid out for print → PDF |
| `one-page.html` | One-page summary to send with an application |
| `case-studies.md` | The written text, for LinkedIn, emails and interview prep |
| `images-to-capture.md` | What to shoot, with the alt text already written |
| `README.md` | The delivery document (in the ZIP export) |

No third-party requests, no build step, no framework. Drop the folder on any static host.

### Images

The system never invents image files. Where a case needs a visual, the page carries a labelled
slot saying what to shoot, with the alt text written and a ready-made `<img>` line commented out —
drop the file in, uncomment, fill in the pixel dimensions. An image tag pointing at nothing is a
broken page, not a draft.

### PDF

`portfolio-print.html` carries print styles. Open it and print to PDF. No headless browser is
bundled, so the app does not claim to produce a PDF it cannot produce.

---

## The delivered document

`assembleMarkdown()` builds the final output in code rather than asking a model for it, so the
section structure is guaranteed rather than usual:

```
# Your portfolio is ready
## What we built
## Your files
## How to publish it
## What we checked for you
## What you still need to make it stronger
## How to keep it alive
## What we couldn't verify
```

> **Note.** The functional spec left the final output format as a placeholder
> (`[PASTE THE FINAL OUTPUT FORMAT HERE]`). This structure is the one the method document itself
> mandates for the delivery stage. If a different format is wanted, `assembleMarkdown()` in
> `server/agents/agent8-packager.ts` is the only place to change it — the section list is a plain
> sequence of `out.push()` calls.

---

## What the system refuses to do

These are load-bearing, not decoration:

- **No unsourced numbers.** Every numeric claim carries the source the person declared. Anything
  they cannot source is rewritten qualitatively or removed. The check runs twice: as a string test
  in code, and as a judgement in the integrity gate.
- **No invented facts.** The integrity gate compares every assertion against the original
  interview data. Anything that is not traceable is a critical violation and blocks delivery.
- **No confidentiality leaks.** Confidential projects get one of three tactics — show the process,
  redact identifying details, or genericise — and the gate verifies it was applied.
- **No hiring promises.** Not in the interface, not in the generated portfolio, not in the
  delivery document.
- **Accessibility is not negotiable.** WCAG 2.2 AA thresholds are enforced arithmetically. If two
  rounds of correction do not converge, the palette is repaired in code so an accessible page
  still ships.

The application holds itself to the same standard it enforces: it meets WCAG 2.2 AA, works from
320px with no horizontal scrolling, respects `prefers-reduced-motion`, and follows the system
light/dark preference.

---

## Declared limitations

These ship with every report, in plain language, because the method requires it:

1. The underlying evidence is strongest in UX and digital design — a survey of 204 people who hire
   in that field. Extending it to other professions is reasonable but unproven.
2. Structured narrative is used because it forces completeness, not because it guarantees a hire.
3. There is no causal evidence that having a portfolio increases hiring odds across professions.
4. Loading speed can only be confirmed with real visitors. Everything reported is a lab proxy.
5. Automated accessibility checks catch a subset of what matters. This is assisted conformance,
   not certified conformance.
6. Nothing here can verify that someone's achievements are true.
7. Regulated professions have advertising and confidentiality rules that vary by jurisdiction.
   This is not legal advice.
8. Legal responsibility for publishing work under an NDA remains with the person publishing it.
