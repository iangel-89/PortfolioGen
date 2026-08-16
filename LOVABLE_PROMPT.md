# Building PortfolioGen on Lovable

This file contains the prompt to give Lovable, plus what you need to know before you start.

---

## Read this first: the one thing that matters

Lovable's stack is **React + Vite + TypeScript + Tailwind on the frontend, Supabase on the backend**.
Supabase's backend code runs as **Edge Functions on Deno**, not Node.

Your frontend is already an exact match — React + Vite + TS + Tailwind. That part imports cleanly.

Your **backend does not match**. `server/` is ~3,900 lines of Express/Node:

| What it does now | Why it can't run as-is on Lovable |
| --- | --- |
| Express HTTP server | Edge Functions are Deno, not Node/Express |
| Sessions in an in-memory `Map` | Functions are stateless; each call starts cold |
| Writes generated files to disk | No writable filesystem — needs Supabase Storage |
| Streams progress over SSE | Needs Postgres Realtime instead |
| Runs 16 pipeline stages in one request | Edge Functions cap at **400 seconds**; 16 sequential Gemini calls will exceed that |

That last row is the real trap. If you let Lovable build the pipeline the way it exists today, **every
build will time out**. The prompt below tells it to run **one stage per invocation** with state in
Postgres. Do not remove that instruction.

### Your three realistic options

**Option A — Hybrid (lowest risk, recommended).**
Import the repo into Lovable and use it **only for the frontend** — polish the chat UI, the progress
sidebar, the result screen. Keep `server/` running on a Node host and point the frontend at it.
Nothing gets rewritten; you get Lovable's visual iteration loop. Your verification guarantees
(contrast maths, deterministic HTML) stay exactly as they are.

**Option B — Full port to Lovable + Supabase.**
Use the prompt below. Lovable rewrites the pipeline as Edge Functions with Postgres state. This is a
genuine rewrite of ~3,900 lines of backend into Deno. Expect several rounds of debugging, and expect
to re-verify that the quality gates still behave.

**Option C — Fix Railway instead.**
Worth saying plainly: your Railway deploy **did succeed** — the dashboard showed *Deployment
successful* and *Online*. The only thing left was that the `GEMINI_API_KEY` field still held the
placeholder text `MY_GEMINI_API_KEY` instead of your real key. That is a one-field fix, not a
platform problem.

---

## How to import the repo into Lovable

Lovable does support importing an existing repo, with conditions: it must be a React/TypeScript/Vite
project, have a clean `package.json`, and build locally. Yours meets all three.

1. In Lovable, click **New Project** → **Import from GitHub**
2. Authorise the Lovable GitHub App, granting access to **`iangel-89/PortfolioGen`** specifically
3. Lovable reads the repo, installs dependencies, and boots a preview (usually 60–90 seconds)
4. Open the **Cloud / Secrets panel** and add `GEMINI_API_KEY` — your `.env` does **not** come across
5. Then paste the prompt below

Note: Lovable reads the repo **because it is imported into the project**. It cannot browse a GitHub
URL you merely mention in chat. The import is what gives it the code.

---

## THE PROMPT

Copy everything between the two lines below into Lovable.

─────────────────────── START ───────────────────────

I have imported an existing, fully working app. Read the repository carefully before changing
anything — especially `README.md`, `shared/types.ts`, `server/core/pipeline.ts`, and
`server/render/renderer.ts`. The method this app implements is already correct and tested. Your job
is to **port the backend to Supabase while preserving the method exactly**, and to refine the
frontend. Do not redesign the method.

## What the app does

Someone answers plain conversational questions about their professional work. The app produces a
complete, publishable portfolio website: HTML pages, a stylesheet, a print-ready page, a one-page
summary, and the written case-study text to reuse in applications and interviews.

The critical difference from a template builder: **style, tone, and structure are derived from the
person's profession, target audience, and the actual shape of their evidence.** They are outputs of
the process, never inputs. Two people in the same field get materially different portfolios when
their evidence differs. There are no themes to pick.

## Architecture you must build

Keep the React + Vite + TypeScript + Tailwind frontend. Replace the Express backend with Supabase.

**Database (Postgres).** Create a `sessions` table:
- `id` (uuid, primary key)
- `state` (jsonb) — the entire SessionState object from `shared/types.ts`, stored whole
- `status` (text) — one of: collecting, building, needs_user_input, complete, failed
- `cursor` (int) — index of the next pipeline stage to run, default 0
- `transitions` (int) — loop counter, default 0
- `created_at`, `updated_at` (timestamptz)

Enable Realtime on this table so the client can subscribe to row updates.

**Storage.** Create a `portfolios` bucket. Generated files are written to `{session_id}/{filename}`.
Serve previews via signed URLs. Do not attempt to write to a filesystem — there isn't one.

**Edge Functions.** Create these:
- `session-create` — inserts a row, returns the id
- `session-get` — returns the row
- `chat` — runs Agent 0 (the interviewer) for one conversational turn, appends to the transcript,
  updates state
- `run-stage` — **runs exactly ONE pipeline stage, then returns.** Reads `cursor` from the row,
  executes `STAGES[cursor]`, writes the updated state and new cursor back, returns whether more
  stages remain
- `export-zip` — bundles the session's files from Storage into a ZIP

### The 400-second rule — do not violate this

Supabase Edge Functions have a hard wall-clock limit of 400 seconds. The pipeline has 16 stages,
most of which make a Gemini call. Running them in one invocation **will time out**.

So: `run-stage` executes **one stage per HTTP call**. The client calls it in a loop, or a stage
chains the next invocation. State lives in Postgres between calls, never in memory. The client shows
progress by subscribing to Realtime updates on the session row.

Never write a function that loops through all stages in a single invocation.

## The pipeline — 16 stages, in this exact order

Port each of these from `server/agents/` and `server/routers/`. Keep the same responsibilities.

1. **Router 0 — intake gate.** Is there enough to start? Choose standard or capabilities mode.
2. **Agent 1 — strategist.** Who must this convince? Produce the thesis and three takeaways.
3. **Router 1 — strategy gate.** Swap test on the thesis: if it could describe anyone else in the
   field, send it back. Derive selection criteria.
4. **Agent 2 — curator.** Score every project, select 3–5, name the gaps.
5. **Router 2 — evidence gate.** Set the mode, trim, reduce context for the writing stage.
6. **Agent 3 — narrator.** Seven-element case studies, one writer pass per case.
7. **Router 3 — integrity gate.** BLOCKING. Truthfulness, attribution, confidentiality.
8. **Agent 4 — architect.** Content model, priority guides, metadata, alt text.
9. **Router 4 — archetype selector.** Evidence profile → editorial / gallery / executive / technical.
10. **Agent 5 — art director.** Design tokens, type scale, grid, components.
11. **Router 5 — visual gate.** BLOCKING. Recomputed contrast plus typography rules.
12. **Agent 6 — builder.** Stylesheet and composition decisions, fed to the renderer.
13. **Router 6 — audit planner.** Scope the audit to what was actually built.
14. **Agent 7 — auditor.** Six gates, interpreting measurements it did not itself take.
15. **Router 7 — quality gate.** Ship, retry (max 2), or escalate in plain language.
16. **Agent 8 — packager.** Assemble the delivery document the person actually reads.

**Retries are backward jumps.** A gate returns `retry: { stageId, instructions }`. Write the
instructions into `state.directives[stageId]`, set `cursor` back to that stage's index, and re-run
everything downstream. Each gate owns a budget of two retries, then escalates to the user in plain
language instead of looping. Keep the `MAX_TRANSITIONS` backstop.

## Four rules you must not break

**1. Measurements are computed in code, never asked of a model.**
Contrast ratios, page weight, heading hierarchy, landmark presence, alt attributes, image
dimensions, third-party requests — all computed in `server/checks/`. Port that logic to Deno
verbatim. The auditor receives the numbers and interprets them; it never produces them. Keep the
`reconcile()` override in the auditor: if the measurements say a contrast ratio fails, the model
cannot approve it. A model that talks itself into shipping 2.9:1 must be overruled by arithmetic.

**2. HTML markup is emitted by code, never generated by a model.**
`server/render/renderer.ts` (744 lines) emits every page from the content model. Port it exactly.
The model writes the stylesheet and makes composition judgements; it never writes markup. This is
why accessibility is true by construction rather than merely probable, and it is why text can be
re-rendered after an edit without regenerating anything.

**3. No unsourced claims.** Every numeric claim carries the source the person declared. Anything
unsourceable is rewritten qualitatively or removed. Checked twice: as a string test in code, and as
a judgement in the integrity gate.

**4. No invented facts.** The integrity gate compares every assertion against the original interview
data. Anything untraceable is a critical violation and blocks delivery.

Also: no hiring promises anywhere — not in the interface, not in the generated portfolio, not in the
delivery document.

## What the user sees — seven phases, plain language

The user must **never** see the words agent, router, gate, retry, pipeline, or stage. They see seven
phases, streamed live as each one runs:

1. **Finding your angle** — Working out who this has to convince, and what it should say.
2. **Choosing what to show** — Picking the work that makes the strongest case, and dropping the rest.
3. **Writing your case studies** — Turning each project into a story with a problem, a decision and a result.
4. **Ordering it for the reader** — Deciding what comes first, second and never.
5. **Designing the look** — Building a look from your field and your work, not from a template.
6. **Building your files** — Assembling pages you can publish today.
7. **Checking everything** — Readability, honest numbers, confidentiality, and whether the point lands.

When a gate sends work back, the affected phase simply becomes active again. No error, no
explanation of the retry. It just looks like that step is still working.

## Screens

**Welcome.** States what this is and what they get, in plain language. One primary action to begin.
No feature grid, no marketing copy, no testimonials.

**Interview.** A chat. Message bubbles, an input, a send button. A sidebar shows the seven phases as
a checklist — visible from the start, greyed until reached, so the person can see the shape of what
is coming. The interviewer asks one thing at a time and follows up when an answer is thin.

**Building.** The seven-phase list becomes live. Current phase highlighted, completed phases ticked,
short detail lines appearing beneath the active phase as work happens. Driven by Realtime updates on
the session row.

**Result.** Three tabs over one shared header:
- *What you got* — the thesis, who it was written for, the three takeaways, a row of quality
  indicators in plain words ("Readable for everyone", "Claims you can back up", "Nothing
  confidential leaked"), then the full delivery document
- *Preview* — the real generated site in an iframe, links working, plus open-in-new-tab
- *Files* — every file with its purpose, size, and per-file preview/download

Header actions: copy summary, download all as ZIP, start over.

## Design direction

Restrained and editorial. This app produces portfolios for professionals; it must itself look like
something a professional would trust with their career.

- Generous whitespace. Let the interface breathe.
- A real type scale with a clear hierarchy. Comfortable line length for reading — around 66
  characters.
- One accent colour, used sparingly for the primary action and active states. Everything else is
  neutral.
- Subtle borders and very soft shadows. No heavy cards, no glassmorphism, no gradient meshes, no
  neon.
- Motion is functional only: gentle fades and height transitions as phases complete. Nothing
  bouncing, nothing decorative.
- Respect `prefers-reduced-motion`.
- Full light and dark mode, following the system preference.

## Accessibility — the app holds itself to the standard it enforces

- WCAG 2.2 AA throughout
- Works from 320px wide with **no horizontal scrolling**
- Visible focus indicators on every interactive element
- Touch targets at least 44×44px
- Correct landmarks and heading order
- Proper ARIA on the tabs and the progress list
- Announce phase changes to screen readers via a live region

## What the person receives

- `index.html` — home: hero, takeaways, case cards, contact
- `case-NN-*.html` — one page per case study
- `about.html`
- `styles.css` — the design system, tokens first
- `portfolio-print.html` — everything on one page, laid out for print to PDF
- `one-page.html` — one-page summary to send with an application
- `case-studies.md` — the written text for LinkedIn, emails, interview prep
- `images-to-capture.md` — what to photograph, with the alt text already written
- `README.md` — the delivery document, included in the ZIP

No third-party requests, no build step, no framework in the output. The folder drops onto any static
host as-is.

**Images: never invent image files.** Where a case needs a visual, emit a labelled slot saying what
to shoot, with the alt text written and a ready-made `<img>` line commented out. An image tag
pointing at nothing is a broken page, not a draft.

## Model

Use Google Gemini via `@google/genai`. Read `GEMINI_API_KEY` from Supabase secrets. Keep the
per-stage model assignment and the JSON-repair logic in `server/llm/client.ts` — malformed JSON from
a model must be repaired and retried, not thrown at the user.

## Build order

Please work in this sequence, and stop after each step so I can verify before you continue:

1. Database schema, Storage bucket, Realtime enabled
2. `session-create`, `session-get`, and `chat` — get the interview working end to end
3. `run-stage` with the one-stage-per-invocation contract, and the client loop that drives it
4. Port `checks/` and `renderer.ts` to Deno **unchanged in behaviour**
5. Port the 16 stages
6. Result screen, preview, and ZIP export
7. Accessibility and responsive pass at 320px

Do not attempt all of this in one pass.

──────────────────────── END ────────────────────────

---

## After Lovable finishes

Verify these specifically, because they are the things most likely to have silently broken:

- **Contrast is computed, not guessed.** Force a low-contrast palette and confirm the visual gate
  catches it arithmetically.
- **A build completes without timing out.** This is the 400-second failure mode.
- **Retries work.** A gate sending work backwards should re-run downstream stages, and the UI should
  just show that phase active again.
- **320px reflow.** No horizontal scrolling, in both the app and the generated portfolio.
- **The generated site has zero external requests.** Open DevTools → Network on a preview.
