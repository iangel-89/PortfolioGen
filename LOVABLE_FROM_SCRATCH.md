# Building PortfolioGen from scratch on Lovable

Importing a repo needs Lovable's paid `custom-codebases` feature. This file rebuilds the app from
scratch instead, using only the free-tier flow.

## How to use this file

**Do not paste all of this at once.** There are seven prompts below. Paste **one at a time**, let
Lovable finish, check the preview, then move to the next. A single enormous prompt produces a vague
app that looks right and does nothing; a sequence produces a working one.

Prompts 1–2 give you something visible and beautiful quickly. Prompts 3–5 are the real engine.
Prompts 6–7 finish it.

Before you start: in Lovable, enable **Cloud / Supabase** for the project, and add your
`GEMINI_API_KEY` as a secret in the Cloud panel.

---

# PROMPT 1 — Foundation, design system, and the UI shell

─────────────────────── START ───────────────────────

Build the frontend shell for an app called **PortfolioGen**. In this first step, build **UI only**,
with hardcoded placeholder data. No backend yet. I want to see and approve the look before we wire
anything up.

## What the app will eventually do

Someone answers plain conversational questions about their professional work. The app then generates
a complete, publishable portfolio website for them: HTML pages, a stylesheet, a print-ready page, a
one-page summary, and the written case-study text they can reuse in job applications and interviews.

The thing that makes it different from a template builder: **the visual style, tone, and structure
are derived from the person's profession, their target audience, and the actual shape of their
evidence.** They are outputs of the process, never inputs. There are no themes to choose. Two people
in the same field get materially different portfolios when their evidence differs.

Hold onto that idea, because it shapes the tone of the whole interface: this is a considered,
professional instrument, not a fun generator.

## Stack

React + TypeScript + Vite + Tailwind. Use shadcn/ui components where they fit, but restyle them —
I do not want this to look like default shadcn.

## Design direction — read this carefully

This app produces portfolios that people will use to get hired. It must itself look like something
a professional would trust with their career. Restrained and editorial, closer to a good print
magazine or a well-made writing tool than to a SaaS dashboard.

**Typography.** A real modular scale with clear hierarchy. Use a serif or a high-quality
transitional sans for headings — something with character, not Inter. Body text at 16–17px minimum,
line height 1.6, and reading columns capped around 66 characters. Text should feel comfortable to
read for several minutes.

**Colour.** Near-neutral canvas. One accent colour, used sparingly — primary actions and active
states only. Everything else is greys and off-whites. No gradients, no colour washes behind large
areas.

**Space.** Generous. Let the interface breathe. Padding should feel slightly more than you think is
needed. Group related things with proximity rather than with boxes.

**Surfaces.** Subtle 1px borders and very soft shadows. No heavy cards, no glassmorphism, no
neumorphism, no neon, no glow effects, no animated gradient meshes. If a border can do the job, a
shadow should not.

**Motion.** Functional only — gentle fades and height transitions. Nothing bouncing, nothing
sliding in decoratively, no confetti, no parallax. Respect `prefers-reduced-motion` and disable
transitions entirely when it is set.

**Both themes.** Full light and dark mode following the system preference, with a manual toggle.
Both must be equally considered — dark mode is not an inverted afterthought.

## Screens to build now

### 1. Welcome

States plainly what this is and what the person will get. One primary action to begin. No feature
grid, no pricing table, no testimonials, no logos, no marketing hype. A short, honest paragraph and
a button.

Say what they receive: a publishable website, a print-ready PDF version, a one-page summary, and the
written text to reuse elsewhere. Mention that it takes about ten minutes of questions.

### 2. Interview

A two-column layout on desktop, stacking on mobile.

**Main column:** a chat. Message bubbles distinguishing the assistant from the person. A text input
with a send button at the bottom. Below the assistant's message, when relevant, show up to four
tappable quick-reply chips so the person can answer without typing.

**Sidebar:** a checklist of seven phases, visible from the very start so the person can see the
shape of what is coming. Each phase greyed out until reached. Use these exact labels and
descriptions:

1. **Finding your angle** — Working out who this has to convince, and what it should say.
2. **Choosing what to show** — Picking the work that makes the strongest case, and dropping the rest.
3. **Writing your case studies** — Turning each project into a story with a problem, a decision and a result.
4. **Ordering it for the reader** — Deciding what comes first, second and never.
5. **Designing the look** — Building a look from your field and your work, not from a template.
6. **Building your files** — Assembling pages you can publish today.
7. **Checking everything** — Readability, honest numbers, confidentiality, and whether the point lands.

### 3. Building

The seven-phase checklist becomes the main event, centred. The current phase is highlighted,
completed phases get a tick, and short detail lines appear beneath the active phase as work happens
(for now, fake these on a timer so I can see the animation). A phase that is revisited simply
becomes active again — no error state, no explanation.

### 4. Result

Three tabs sharing one sticky header.

Header: a success mark, the title "Your portfolio is ready", and three actions — copy summary,
download all as ZIP, and start over.

**Tab "What you got"** — the strategic thesis in large type, a panel saying who it was written for,
the three key takeaways as a numbered row, then a horizontal strip of quality indicators as pills
using plain words: "Readable for everyone", "Loads fast", "Well written", "Claims you can back up",
"Nothing confidential leaked", "The point lands". Each pill shows pass or needs-attention. Below
that, a long-form markdown document.

**Tab "Preview"** — the generated site shown in an iframe inside a browser-chrome frame (three dots,
a subtle top bar). An "open in new tab" link above it.

**Tab "Files"** — a list of generated files, each with its filename in monospace, a plain-language
description of what it is for, its size in KB, and buttons to preview and download.

## Vocabulary rule — absolute

The person using this app must **never** see the words: agent, router, gate, pipeline, stage,
retry, orchestrator, LLM, prompt, token, or model. Not in the UI, not in loading states, not in
error messages, not in tooltips. Everything is described in the plain language a non-technical
professional would use.

## Accessibility — non-negotiable, build it in now

This app enforces accessibility on the portfolios it generates, so it must meet the same bar itself.

- WCAG 2.2 AA throughout
- Works down to 320px wide with **no horizontal scrolling** at any width
- Visible focus indicators on every interactive element — never remove outlines without replacing them
- Touch targets at least 44×44px
- Correct landmark elements (header, nav, main, footer) and no skipped heading levels
- Proper ARIA on the tabs (`role="tablist"`, `role="tab"`, `aria-selected`) and on the progress list
- A live region that announces phase changes to screen readers
- Every colour pair must clear 4.5:1 for text and 3:1 for borders and interface components

Build these four screens with placeholder content and a way for me to click between them.

──────────────────────── END ────────────────────────

---

# PROMPT 2 — Database, and the interview that actually works

─────────────────────── START ───────────────────────

Now add the backend for the interview. Use Supabase.

## Database

Create a `sessions` table:

- `id` — uuid, primary key, default `gen_random_uuid()`
- `state` — jsonb, not null, default `'{}'` — holds the entire session state object
- `status` — text, not null, default `'collecting'` — one of: `collecting`, `building`,
  `needs_user_input`, `complete`, `failed`
- `cursor` — integer, not null, default `0` — index of the next pipeline stage to run
- `transitions` — integer, not null, default `0` — loop counter
- `created_at`, `updated_at` — timestamptz, default `now()`

Enable **Realtime** on this table. The client will subscribe to its own row to receive progress.

For now allow anonymous access by session id (no login). Add a trigger to keep `updated_at` current.

## The state object

The `state` jsonb column holds one object with these keys. Create a shared TypeScript type for it
and use it on both the client and in the Edge Functions:

- `sessionId`, `createdAt`, `updatedAt`, `status`
- `transcript` — array of `{ role: 'user' | 'assistant', content: string, at: string }`
- `interviewProgress` — `{ questionsAsked: number, block: string, readyToBuild: boolean, reasonNotReady: string }`
- `rawProfile` — the person's details (shape below)
- `rawProjects` — array of projects (shape below)
- `flags` — `{ nda: boolean, regulatedProfession: boolean, minor: boolean }`
- `strategicBrief`, `curatedInventory`, `caseNarratives`, `contentModel`, `archetypeDecision`,
  `visualSystem`, `artifact`, `machineFindings`, `qualityReport`, `delivery` — all null until their
  stage fills them
- `directives` — `Record<string, string[]>` — correction instructions written by gates, keyed by stage id
- `notices` — array of `{ kind: string, message: string }` shown to the person
- `escalation` — string or null
- `trace` — array of stage execution records (for debugging; never shown to the person)

`rawProfile` shape: `profession`, `specialty`, `yearsExperience`, `goal`, `targetRole`,
`referencePostings[]`, `region`, `language`, `statedDifferentiator`, `desiredImpression`,
`preferredFormat` (`web` | `pdf` | `both`), `visualReferences[]`, `existingBrand`, `voiceSample`.

`rawProjects` item shape: `id`, `name`, `year`, `type` (`professional` | `academic` | `volunteer` |
`personal`), `problem`, `ownRole`, `teamRole`, `actions`, `outcome`, `metrics` (array of
`{ claim, source }` where source is `measured` | `estimated` | `client_reported` | `unsourced`),
`materials` (array of `{ kind, description, ref }`), `confidential` (boolean), `notes`.

## Edge Functions

Create `session-create` (inserts a row, returns the id), `session-get` (returns the row), and
`chat`.

## The `chat` function — the interviewer

Uses Google Gemini via the `GEMINI_API_KEY` secret. One conversational turn per call: takes the
person's message, returns the next question, and re-extracts the full structured record.

Give the model this system prompt, essentially verbatim:

> You are the interviewer for a service that builds professional portfolios. Your only job is to
> gather information from the person as comfortably as possible. You do not design, you do not write
> case studies, and you do not comment on the quality of their work.
>
> GUIDING PRINCIPLE. The person does not know the underlying method and must never be shown it.
> Never mention phases, agents, curation, content models, design tokens, accessibility standards or
> any internal terminology. You speak like a person who is genuinely interested in their work.
>
> CONVERSATION RULES
> - Ask exactly ONE question per turn. Never a list of questions, never a form.
> - Short, concrete questions in everyday language. No professional jargon.
> - Offer tappable options instead of free text whenever the question allows it.
> - If an answer is vague, ask ONE concrete follow-up, then move on.
> - "I don't know", "skip" and "not applicable" are valid answers. Record the gap and move on.
> - Never more than 18 questions in total. Prioritise the highest-value ones.
> - Reflect back what you understood before changing topic ("So on that project you handled X — right?").
> - Write in English unless the person writes to you in another language, then match their language.
>
> WHAT YOU NEED, IN PRIORITY ORDER
> Block A — identity and goal (required): profession/specialty and years of experience; what the
> portfolio is for (a specific job / clients / changing field / promotion / academic application);
> what kind of role or organisation they are aiming at, and their real job posting if they have one;
> country or region.
> Block B — projects (required; iterate ONE project at a time; aim for 2 to 5): name and year; what
> problem it solved; what THIS PERSON did specifically, separate from what the team did; what
> happened afterwards; if there are numbers, what the number is and WHERE IT COMES FROM (measured,
> estimated, or the client told them); what materials they have (images, documents, links); whether
> anything is confidential or under NDA.
> Block C — context (nice to have): what sets them apart from others in their field; a project they
> learned a lot from even though it did not go well; what they want someone to think after seeing
> their portfolio.
> Block D — preferences (light, 2–3 questions maximum): preferred format (website, PDF, or both);
> visual references they like; whether they have their own brand, colours or typefaces.
> Also welcome if it arises naturally: a short sample of their own writing, so the finished text
> sounds like them.
>
> FLAGS YOU MUST RAISE
> - nda: they mention confidentiality of any kind
> - regulatedProfession: medicine, law, accounting, psychology, pharmacy, notary work
> - minor: if they say they are under 18, stop the interview and explain the service is designed
>   for working adults
>
> PROHIBITED
> - Never invent projects, figures, clients or achievements.
> - Never fill a gap with a plausible assumption. A gap is a gap.
> - Never evaluate or criticise their work at this stage.
> - Never promise hiring outcomes.
>
> EXTRACTION. Each turn you also return the full structured record of everything gathered so far.
> Re-emit the complete projects array every turn, corrected for anything you have learned since.
> Only record what the person actually said. Leave fields empty rather than guessing. Every numeric
> claim carries a source label: "measured", "estimated", "client_reported", or "unsourced" when they
> could not say where it came from.
>
> READY TO BUILD. Set readyToBuild true only when you have, at minimum: profession, and what the
> portfolio is for, and at least 2 projects that each have a problem, what they personally did, and
> either an outcome or the actions they took. When you reach that point, briefly confirm what you
> have and tell them they can start the build whenever they are ready. If they clearly want to stop
> earlier, set readyToBuild true anyway and note what is thin in reasonNotReady.

The function must return strict JSON with: `reply` (string), `quickReplies` (array of up to 4 short
strings, empty when free text is the only sensible answer), `profile` (object), `projects` (array),
`flags` (object), `questionsAsked` (number), `currentBlock` (one of identity/projects/context/
preferences/done), `readyToBuild` (boolean), `reasonNotReady` (string).

**JSON repair.** Models sometimes return JSON wrapped in markdown fences or with a trailing comma.
Write a helper that strips fences, extracts the outermost `{...}`, and retries the call once if
parsing still fails. Never surface a JSON parse error to the person.

Wire the interview screen to this. Quick-reply chips send their text as a message. When
`readyToBuild` becomes true, reveal a primary button to begin the build.

──────────────────────── END ────────────────────────

---

# PROMPT 3 — The pipeline runner (read the timeout section carefully)

─────────────────────── START ───────────────────────

Now build the engine that turns the interview into a portfolio. It is a fixed sequence of 16 stages
with backward jumps for corrections.

## The 400-second rule — this determines the whole design

Supabase Edge Functions have a hard wall-clock limit of **400 seconds**. This pipeline has 16 stages
and most of them make a Gemini call. Running them in one invocation **will time out every single
time**.

So: build an Edge Function called `run-stage` that executes **exactly ONE stage per HTTP call and
then returns.**

- It reads `cursor` from the session row
- It executes stage number `cursor`
- It writes the updated `state`, the new `cursor`, and `transitions` back to the row
- It returns `{ done: boolean, cursor: number, phaseId: string }`

The client calls `run-stage` in a loop until `done` is true. State lives in Postgres between calls
and never in function memory. Progress reaches the UI through the Realtime subscription on the
session row.

**Never write a function that loops through all the stages in one invocation.** If you are tempted
to "simplify" by batching them, don't — that is the failure mode this design exists to avoid.

## The 16 stages, in exact order

Each stage is either an **agent** (calls Gemini to produce something) or a **router** (a decision
point that can send work backwards). Each declares which of the seven user-visible phases it belongs
to.

| # | Stage | Phase shown | What it does |
|---|---|---|---|
| 0 | Router 0 — intake gate | Finding your angle | Is there enough to start? Choose standard or capabilities mode |
| 1 | Agent 1 — strategist | Finding your angle | Who must this convince; the thesis; three takeaways |
| 2 | Router 1 — strategy gate | Finding your angle | Swap test on the thesis; derive selection criteria |
| 3 | Agent 2 — curator | Choosing what to show | Score every project, select 3–5, name the gaps |
| 4 | Router 2 — evidence gate | Choosing what to show | Set mode, trim, reduce context for writing |
| 5 | Agent 3 — narrator | Writing your case studies | Seven-element case studies, one pass per case |
| 6 | Router 3 — integrity gate | Writing your case studies | BLOCKING: truthfulness, attribution, confidentiality |
| 7 | Agent 4 — architect | Ordering it for the reader | Content model, priority guides, metadata, alt text |
| 8 | Router 4 — archetype selector | Ordering it for the reader | Evidence profile → one of four archetypes |
| 9 | Agent 5 — art director | Designing the look | Design tokens, type scale, grid, components |
| 10 | Router 5 — visual gate | Designing the look | BLOCKING: recomputed contrast + typography rules |
| 11 | Agent 6 — builder | Building your files | Stylesheet and composition decisions |
| 12 | Router 6 — audit planner | Building your files | Scope the audit to what was actually built |
| 13 | Agent 7 — auditor | Checking everything | Six gates, interpreting measurements it did not take |
| 14 | Router 7 — quality gate | Checking everything | Ship, retry (max 2), or escalate in plain language |
| 15 | Agent 8 — packager | Checking everything | Assemble the delivery document the person reads |

## Every stage implements one interface

```
interface Stage {
  id: string;
  kind: 'agent' | 'router';
  phaseId: string;
  run(ctx: { state, emit }): Promise<StageOutcome>;
}

interface StageOutcome {
  decision: string;
  reasoning: string;
  confidence?: 'high' | 'medium' | 'low';
  route?: string;
  notices?: { kind: string, message: string }[];
  retry?: { stageId: string, instructions: string[], reason: string };
  escalate?: string;
}
```

The runner knows nothing else about any stage. Keep the stage list as a flat ordered array — that
array *is* the method, and it must be trivially reorderable.

## Backward jumps

When a stage returns `retry`, the runner:
1. Appends `retry.instructions` to `state.directives[retry.stageId]`
2. Sets `cursor` to that stage's index
3. Re-runs everything from there downstream

Each gate owns a budget of **two** retries for the same problem. On the third, it must `escalate`
instead — a plain-language message to the person — rather than loop.

Add a `MAX_TRANSITIONS` backstop of `stages.length * 4`. If exceeded, fail with: "The build kept
going back and forth without settling. Nothing was lost — try again, or restart with a bit more
detail."

When a stage escalates: if artifacts already exist, jump to Agent 8 so the person still gets what
was finished, with the problem written down. If nothing exists yet, stop.

## What the person sees

Only phase transitions. When a gate sends work backwards, the affected phase simply becomes active
again — no error, no mention of a retry, no explanation. It should look like that step is still
working.

Write every stage's decision and reasoning into `state.trace` for debugging, but never show `trace`
in the UI.

For this step, implement the runner, the stage interface, the retry logic, and **stub stages** that
just wait 300ms and return a plausible decision. I want to see the seven phases advance in the UI
with real Realtime updates before we write the actual stage logic.

──────────────────────── END ────────────────────────

---

# PROMPT 4 — The deterministic checks (do not let a model do this)

─────────────────────── START ───────────────────────

Now build the verification layer. This is the most important prompt in the sequence.

## The principle

**Measurements are computed in code. A language model never produces them — it only interprets
them.** A model that talks itself into approving a 2.9:1 contrast ratio must be overruled by
arithmetic. Write all of this as plain deterministic TypeScript with no model calls anywhere in it.

## Contrast — WCAG 2.2

Implement exactly this:

**Parse colour.** Accept `#rgb`, `#rrggbb`, `#rrggbbaa`, and `rgb()`/`rgba()`. Return null for
anything unparseable.

**Relative luminance.** For each channel, take `c = value / 255`, then
`c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4`.
Then `L = 0.2126 * r + 0.7152 * g + 0.0722 * b`.

**Contrast ratio.** `(lighter + 0.05) / (darker + 0.05)`, rounded to 2 decimals. **If either colour
fails to parse, return 0** — an unparseable colour is a failure, never a pass.

**Thresholds.** Normal text 4.5, large text 3, non-text 3.

**Required pairs** — check all eight, every time:
1. body text on page background — 4.5
2. body text on surface — 4.5
3. secondary text on page background — 4.5
4. secondary text on surface — 4.5
5. accent text on page background — 4.5
6. text on accent fill — 4.5
7. border against background — 3
8. accent as interface component on surface — 3

**Authority rule.** Whatever the art-direction stage claimed about its own palette is **discarded
and replaced** by these computed numbers. The gate trusts the arithmetic, never the model.

**Last-resort repair.** If retries are exhausted and a pair still fails, repair it in code rather
than blocking delivery: if the background luminance is above 0.4 darken the foreground, otherwise
lighten it, stepping 1% at a time up to 100 steps until the ratio clears the threshold. An
accessible page must always ship.

## Typography rules

Check and report all six:
- At most 2 type families (and at least 1)
- At most 3 font weights (and at least 1)
- Base font size at least 16px
- Body line height at least 1.5
- Line length between 45 and 75 characters
- Modular scale ratio between 1.15 and 1.4

## HTML structural audit

Dependency-free, regex-based, deliberately conservative. Strip HTML comments first. For each
generated page report:

- `hasLangAttribute` — `<html lang="xx">` present
- `h1Count` — how many `<h1>` elements
- `headingSkips` — walk headings in document order; flag any jump of more than one level (h2 → h4)
- `landmarks` — presence of header, nav, main, footer (accept the ARIA role equivalents: banner,
  navigation, main, contentinfo)
- `imagesMissingAlt` — `<img>` tags with no `alt` attribute
- `imagesMissingDimensions` — `<img>` tags missing explicit `width` or `height` (prevents layout shift)
- `hasSkipLink` — an anchor to `#main`, `#content` or `#main-content`
- `externalResources` — any absolute `http(s)://` URL in a script src, link href, img src, or CSS
  `@import`. **The build rule is zero third-party requests**, so this array must always come back empty
- `scriptCount`, `hasTitle`, `hasMetaDescription`, `hasOpenGraph`, `hasStructuredData`
- `bytes` — UTF-8 byte length

Report only what the markup itself establishes. Anything needing a browser or a human — reading
order, whether alt text is actually descriptive, language clarity, real tap-target sizes — is
deliberately excluded and surfaced separately as "requires human judgement".

## Performance budgets

Lab proxies only, never presented as field measurements:
- Homepage HTML: 200 KB
- Stylesheet: 50 KB
- Homepage total weight: 1024 KB

## Wiring

**Router 5 (visual gate)** runs the contrast and typography checks. Any failure sends work back to
Agent 5 with the specific failing pairs and their actual ratios in the directive. Two attempts, then
force-repair in code and continue with a notice.

**Agent 7 (auditor)** receives the computed findings as input and interprets them. Then add a
`reconcile()` step that runs **after** the model: if any measurement failed but the model marked
that gate as passing, **the code overrides the model's verdict**. Arithmetic wins. Always.

──────────────────────── END ────────────────────────

---

# PROMPT 5 — The stages, and the deterministic renderer

─────────────────────── START ───────────────────────

Now replace the stub stages with the real ones, and build the renderer.

## The renderer — markup is emitted by code, never by a model

This is the second load-bearing rule. **A model never writes HTML.** The model writes the stylesheet
and makes composition judgements; a deterministic renderer emits every page from the content model.

That is why accessibility is guaranteed rather than merely likely, and it is why text can be
re-rendered after an edit without regenerating anything. Do not let a model produce markup anywhere.

The renderer takes the content model plus the build plan and emits, for each page: correct
`<!doctype html>`, `<html lang>`, a skip link to `#main`, header with nav, `<main id="main">`,
footer, exactly one `<h1>`, no skipped heading levels, `<title>`, meta description, Open Graph tags,
and JSON-LD Person structured data. No external requests of any kind — the stylesheet is a local
file, fonts are system stacks.

## Files to emit

- `index.html` — home: hero, three takeaways, case cards, contact
- `case-NN-slug.html` — one page per case study
- `about.html`
- `styles.css` — the design system, tokens first
- `portfolio-print.html` — everything on one page, laid out for print to PDF
- `one-page.html` — one-page summary to send with an application
- `case-studies.md` — the written text for LinkedIn, emails, interview prep
- `images-to-capture.md` — what to photograph, with the alt text already written
- `README.md` — the delivery document, in the ZIP

Write these to Supabase Storage under `{session_id}/{filename}` in a `portfolios` bucket. Serve
previews with signed URLs.

**Never invent image files.** Where a case needs a visual, emit a labelled slot describing what to
shoot, with the alt text already written and a ready-made `<img>` line commented out — the person
drops the file in, uncomments, and fills in the dimensions. An `<img>` tag pointing at a file that
does not exist is a broken page, not a draft.

## Agent 1 — strategist

Produces: primary reader (profile, what they evaluate, time they'll spend), secondary reader,
portfolio goal, **thesis**, exactly three takeaways, a competency matrix (competency, priority,
evidence available, sector vocabulary), a formality index from 1–5 with rationale, target tone, key
vocabulary, positioning risks.

## Router 1 — strategy gate: the swap test

Take the thesis and replace the person's name with any colleague in the same field. If it still
reads as true, the thesis is generic and **fails** — send it back to Agent 1 with the reason. A
thesis must be something only this person could say.

## Agent 2 — curator

Score **every** project 0–10 on four axes, then apply weights and rank:
- `goalAlignment` — how close it is to the work they want next
- `impactEvidence` — whether an observable result exists, and how good its source is
- `processRichness` — how much intermediate material exists (sketches, iterations, decisions)
- `narrative` — whether there is a story with tension and resolution

Then: select 3–5 featured cases (never 6+, never fewer than 2). Verify the selection **as a whole**
covers the competency matrix — if a lower-scoring project is the only evidence for a priority
competency, include it and state the trade-off. Order by reader logic: most persuasive first, not
most recent. **A project with no verifiable result cannot be case #1.** Classify the rest as gallery
or excluded, with reasons. Detect gaps and propose one concrete evidence-generating action for each.
Never present academic, volunteer or personal work as professional — the work-type label is
mandatory and stays visible in the final portfolio.

For each confidential project assign a tactic: `show_process` (method and decisions, no client
surface), `redact` (replace names with descriptors — "a regional fintech of roughly 200 people"), or
`genericize` (remove every brand reference and proper noun).

## Agent 3 — narrator: the seven-element structure

Every case study has **exactly these seven blocks, in this order**:

1. **The problem or hypothesis** — what was wrong and what was believed to be causing it
2. **Role and collaboration** — what this person did, with whom, in what team structure
3. **How the solution was reached** — the reasoning, the research, the decisions
4. **How the solution solved the problem** — the mechanism, not just a description
5. **Challenges and discarded paths** — what was tried and did not work, and why
6. **Effect on users and on the business** — impact, with its evidence level stated
7. **What they learned** — a concrete reflection, not a generic one

Above the blocks: an impact headline (one sentence, the strongest verifiable result) and a STAR
summary (Situation, Task, Action, Result) of 3–4 lines.

The governing insight: **hiring people want to see the process, not only the finished product. They
want to know what did NOT make it into the work and why, as much as what did.** Block 5 is therefore
not optional filler — it is often the most persuasive part.

Writing rules: first person singular for their own actions, with the team credited explicitly ("the
team defined X; I designed Y"). One heading roughly every 150 words. Paragraphs of at most 4 lines.
Featured case 500–800 words, secondary 250–400. No filler phrases ("in today's world", "now more
than ever", "passionate about"). **No self-evaluating adjectives about their own work** —
"excellent", "innovative", "successful" are banned; the result speaks, the adjective does not.

**Truthfulness rule, inviolable.** Every numeric claim carries its source label. If the source is
`unsourced`, the claim is **rewritten qualitatively with no number** — "increased sales 40%" becomes
"the client reported a rise in sales after launch" — or deleted if not even that is supportable.
Never infer, estimate, or round up a number the person did not give. Never invent quotes from users,
clients or colleagues. If a block has insufficient information, do not pad it: shorten it honestly
and write a concrete question for the person.

## Router 3 — integrity gate (BLOCKING)

Compare every assertion against the original interview data. Anything not traceable is a **critical
violation that blocks delivery**. Verify individual contribution is separated from team work. Verify
the assigned confidentiality tactic was actually applied. Run the unsourced-number check twice: once
as a string test in code, once as a model judgement.

## Agent 4 — architect

Content model, priority guides per template, site map, hero block (who / what they do / thesis /
proof / action), case order, metadata (title, description, Open Graph, Person schema), alt text
inventory, about section, contact section.

## Router 4 — archetype selector: a pure decision matrix, no model call

This is what replaces "pick a template". Compute an evidence profile, then apply the matrix.

**Evidence profile:**
- `visualRatio` = images the person **actually has** ÷ total content blocks. Slots they still have
  to shoot do **not** count — they are not evidence of a visual practice.
- `textDensity` = average words per case
- `formality` = the formality index from Agent 1 (1–5)
- `dominantType` — match profession, specialty, target role, competencies and key vocabulary
  against: **system** (engineer, developer, software, architect, infrastructure, devops, security,
  platform, systems), **data** (data, analyst, analytics, research, scientist, statistic, machine
  learning, economist, actuarial), **visual** (photography, graphic, illustration, interior,
  fashion, industrial design, art direction, film, video, brand). Anything else is **process**.

**The matrix, in this precedence** — sector formality always beats aesthetic preference:

1. `formality >= 4` → **executive_document**. Reads as a report: summaries first, high information
   density, restrained colour.
2. `dominantType` is system or data → **technical**. A navigable index with data blocks and diagrams.
3. `visualRatio > 0.6` and `formality <= 3` → **gallery**. The image carries the argument, the grid leads.
4. Otherwise → **editorial**. A comfortable reading column with strong typographic hierarchy,
   images in support.

Then derive constraints from formality: at 4+, one restrained accent, near-neutral surfaces, no
saturated fills, low typographic expressiveness, max 10% decorative ratio. At 3, one accent plus a
supporting tone, medium expressiveness, 30%. Below 3, an accent plus a secondary tone, saturation
permitted where it does not compete with text, high expressiveness.

## Agent 5 — art director

Design tokens (colour, type, spacing, radius, elevation), a modular type scale, grid definition with
breakpoints at 320/768/1024, component inventory, interaction states, image treatment, and the
rationale for each decision tied back to the archetype and the person's field.

## Agent 6 — builder

Writes the stylesheet and makes composition calls: nav labels, site title, hero supporting line, CTA
label, per-case blurbs, footer line, and publishing instructions. Feeds the renderer. **Does not
write HTML.**

## Agent 7 — auditor

Six gates: accessibility, performance, content, truthfulness, confidentiality, strategy. Receives
the computed measurements and interprets them. For each gate report: status, findings (criterion,
severity, detail, location, correction, responsible stage), what was machine-verified, and what
requires human judgement. Plus a **ninety-second test**: which takeaways survive a skim of headings
alone, and which are lost. Remember the `reconcile()` override from the previous step — measurements
beat the model.

## Agent 8 — packager

Assemble the delivery document **in code**, not by asking a model, so the structure is guaranteed.
Exactly these sections:

- `# Your portfolio is ready`
- `## What we built`
- `## Your files`
- `## How to publish it`
- `## What we checked for you`
- `## What you still need to make it stronger`
- `## How to keep it alive`
- `## What we couldn't verify`

Include free publishing instructions (Netlify Drop: go to app.netlify.com/drop, drag the folder onto
the page, copy the address it gives you).

## The declared limitations — ship these with every report, in plain language

1. The underlying evidence is strongest in UX and digital design — a survey of 204 people who hire
   in that field. Extending it to other professions is reasonable but unproven.
2. Structured narrative is used because it forces completeness, not because it guarantees a hire.
3. There is no causal evidence that having a portfolio increases hiring odds across professions.
4. Loading speed can only be confirmed with real visitors. Everything reported is a lab proxy.
5. Automated accessibility checks catch a subset of what matters. This is assisted conformance, not
   certified conformance.
6. Nothing here can verify that someone's achievements are true.
7. Regulated professions have advertising and confidentiality rules that vary by jurisdiction. This
   is not legal advice.
8. Legal responsibility for publishing work under an NDA remains with the person publishing it.

**No hiring promises anywhere** — not in the interface, not in the generated portfolio, not in the
delivery document.

──────────────────────── END ────────────────────────

---

# PROMPT 6 — Result screen, preview, and export

─────────────────────── START ───────────────────────

Wire the result screen to real data and add export.

- **What you got** tab: pull the thesis, primary reader, and three takeaways from the strategic
  brief. Build the quality pills from the six audit gates, using the plain-language labels:
  accessibility → "Readable for everyone", performance → "Loads fast", content → "Well written",
  truthfulness → "Claims you can back up", confidentiality → "Nothing confidential leaked",
  strategy → "The point lands". Render the delivery document as markdown, but strip its leading `#`
  heading since the page header already says it.
- **Preview** tab: iframe the generated `index.html` from a Storage signed URL. Internal links must
  work so the person can click through to a case study. Sandbox the iframe.
- **Files** tab: list every generated file with its purpose, size in KB, and preview/download buttons.
- **Copy summary**: copies the full delivery markdown to the clipboard, with a "Copied" confirmation
  that reverts after ~2 seconds. Handle clipboard permission denial silently — the download button
  is the fallback.
- **Download all**: an Edge Function that bundles the session's Storage files into a ZIP.
- **Start over**: resets to a fresh session, with a confirmation step.

Add a note under the files list: to get a PDF, open `portfolio-print.html` and print it choosing
"Save as PDF" — the page is already laid out for print. Do not claim to generate a PDF directly;
there is no headless browser, and the app must not promise what it cannot do.

Also handle these states properly:
- **No API key configured** — a clear banner saying nothing can be generated yet
- **Escalation** — when a gate escalates, show the plain-language message prominently at the top of
  the result, and still show whatever was completed
- **Build failure** — an honest message with the option to retry, never a raw error string

──────────────────────── END ────────────────────────

---

# PROMPT 7 — Accessibility and responsive audit

─────────────────────── START ───────────────────────

Final pass. Audit the entire app against WCAG 2.2 AA and fix everything you find.

- Test every screen at **320px** wide and confirm there is **no horizontal scrolling** anywhere.
  This includes the generated portfolio preview.
- Verify every text/background pair in both light and dark themes clears 4.5:1, and every border and
  interface component clears 3:1. Use the contrast function you already wrote — do not eyeball it.
- Confirm visible focus indicators on every interactive element, in both themes.
- Confirm all touch targets are at least 44×44px.
- Confirm correct landmarks and no skipped heading levels on every screen.
- Confirm the tabs have full ARIA (`role="tablist"`, `role="tab"`, `aria-selected`, and arrow-key
  navigation between tabs).
- Confirm phase changes during the build are announced via a live region.
- Confirm `prefers-reduced-motion` disables all transitions.
- Confirm the app is fully keyboard navigable end to end, including sending a chat message and
  switching result tabs.

Report what you found and what you changed.

──────────────────────── END ────────────────────────

---

## After it is built — verify these specifically

These are the things most likely to be silently wrong, because they look fine until you test them:

- **A full build completes without timing out.** This is the 400-second failure mode. If builds die
  partway, the runner is batching stages instead of running one per invocation.
- **Contrast is computed, not guessed.** Force a low-contrast palette and confirm the visual gate
  catches it with an actual ratio number.
- **The model cannot override the maths.** Confirm `reconcile()` flips a gate the model wrongly
  passed.
- **Retries work invisibly.** A gate sending work backwards should re-run downstream stages while
  the UI just shows that phase active again.
- **No markup came from a model.** Every page should have exactly one `<h1>`, no skipped headings,
  and a skip link — every time, not usually.
- **Zero external requests** in the generated site. Open DevTools → Network on a preview.
- **320px reflow** in both the app and the generated portfolio.
