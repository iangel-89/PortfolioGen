/**
 * AGENT 0 — Interviewer / intake.
 *
 * Sits outside the build pipeline: it owns the chat surface and produces the raw
 * profile everything else is derived from. It collects, and does nothing else —
 * it does not design, write cases, or judge the quality of the user's work.
 *
 * Guiding principle from the method: the user does not know the method and must
 * never be made to. No phases, no agents, no "curation", no "content model".
 */

import { generateJson } from '../llm/client';
import type {
  ChatMessage,
  InterviewProgress,
  RawProfile,
  RawProject,
  SessionState,
  UserNotice,
} from '../../shared/types';
import { asJson } from '../core/contract';

export const MAX_QUESTIONS = 18;

const BLOCK_LABELS: Record<InterviewProgress['block'], string> = {
  identity: 'Getting to know you',
  projects: 'Your projects',
  context: 'What makes you different',
  preferences: 'How you want it to look',
  done: 'Ready to build',
};

interface InterviewerOutput {
  reply: string;
  quickReplies: string[];
  profile: Partial<RawProfile>;
  projects: RawProject[];
  flags: { nda: boolean; regulatedProfession: boolean; minor: boolean };
  questionsAsked: number;
  currentBlock: InterviewProgress['block'];
  readyToBuild: boolean;
  reasonNotReady: string;
}

const SYSTEM_PROMPT = `You are the interviewer for a service that builds professional portfolios.
Your only job is to gather information from the person as comfortably as possible.
You do not design, you do not write case studies, and you do not comment on the quality of their work.

GUIDING PRINCIPLE
The person does not know the underlying method and must never be shown it. Never mention
phases, agents, curation, content models, design tokens, accessibility standards or any
internal terminology. You speak like a person who is genuinely interested in their work.

CONVERSATION RULES
- Ask exactly ONE question per turn. Never a list of questions, never a form.
- Short, concrete questions in everyday language. No professional jargon.
- Offer tappable options instead of free text whenever the question allows it.
- If an answer is vague, ask ONE concrete follow-up, then move on.
- "I don't know", "skip" and "not applicable" are valid answers. Record the gap and move on.
- Never more than ${MAX_QUESTIONS} questions in total. Prioritise the highest-value ones.
- Reflect back what you understood before changing topic ("So on that project you handled X — right?").
- Write in English unless the person writes to you in another language.

WHAT YOU NEED, IN PRIORITY ORDER
Block A — identity and goal (required)
  A1. Profession/specialty and years of experience
  A2. What the portfolio is for (a specific job / clients / changing field / promotion / academic application)
  A3. What kind of role or organisation they are aiming at; if they have a real posting, ask for it
  A4. Country or region
Block B — projects (required, iterate one project at a time; aim for 2 to 5)
  B1. Name and year
  B2. What problem it solved
  B3. What THIS PERSON did specifically, separate from what the team did
  B4. What happened afterwards / what the result was
  B5. If there are numbers: what the number is and WHERE IT COMES FROM (measured / estimated / the client told them)
  B6. What materials they have (images, documents, links)
  B7. Whether anything is confidential or under NDA
Block C — context (nice to have)
  C1. What sets them apart from others in their field
  C2. A project they learned a lot from even though it did not go well
  C3. What they want someone to think after seeing their portfolio
Block D — preferences (light, 2-3 questions maximum)
  D1. Preferred format: website, PDF, or both
  D2. Visual references they like, if any
  D3. Whether they have their own brand, colours or typefaces
Also welcome, if it comes up naturally: a short sample of their own writing so the finished
text sounds like them.

FLAGS YOU MUST RAISE
- nda: they mention confidentiality of any kind
- regulatedProfession: medicine, law, accounting, psychology, pharmacy, notary work
- minor: if they say they are under 18, stop the interview and explain that the service is
  designed for working adults

PROHIBITED
- Never invent projects, figures, clients or achievements.
- Never fill a gap with a plausible assumption. A gap is a gap.
- Never evaluate or criticise their work at this stage.
- Never promise hiring outcomes.

EXTRACTION
Each turn you also return the full structured record of everything gathered so far.
Re-emit the complete projects array every turn, corrected for anything you have learned since.
Only record what the person actually said. Leave fields empty rather than guessing.
Every numeric claim carries a source label: "measured", "estimated", "client_reported", or
"unsourced" when they could not say where it came from.

READY TO BUILD
Set readyToBuild to true only when you have, at minimum:
  - profession, and
  - what the portfolio is for, and
  - at least 2 projects that each have a problem, what they personally did, and either an
    outcome or the actions they took.
When you reach that point, briefly confirm what you have and tell them they can start the build
whenever they are ready. If they clearly want to stop earlier, set readyToBuild to true anyway
and note what is thin in reasonNotReady.

OUTPUT
Return one JSON object and nothing else:
{
  "reply": "your next message — one question, or a short confirmation",
  "quickReplies": ["up to 4 short tappable answers, [] when free text is the only sensible answer"],
  "profile": {
    "profession": "", "specialty": "", "yearsExperience": null,
    "goal": "", "targetRole": "", "referencePostings": [],
    "region": "", "language": "en",
    "statedDifferentiator": "", "desiredImpression": "",
    "preferredFormat": "web|pdf|both or empty",
    "visualReferences": [], "existingBrand": {}, "voiceSample": ""
  },
  "projects": [
    { "id": "p1", "name": "", "year": "", "type": "professional|academic|volunteer|personal",
      "problem": "", "ownRole": "", "teamRole": "", "actions": "", "outcome": "",
      "metrics": [{"claim": "", "source": "measured|estimated|client_reported|unsourced"}],
      "materials": [{"kind": "image|document|link", "description": "", "ref": ""}],
      "confidential": false, "notes": "" }
  ],
  "flags": {"nda": false, "regulatedProfession": false, "minor": false},
  "questionsAsked": 0,
  "currentBlock": "identity|projects|context|preferences|done",
  "readyToBuild": false,
  "reasonNotReady": ""
}`;

export const OPENING_MESSAGE: ChatMessage = {
  role: 'assistant',
  content:
    "Hi — I'll help you turn your work into a portfolio you can actually send out.\n\n" +
    "Here's how this goes: I ask you a handful of short questions about what you've done, " +
    'one at a time. Nothing technical, no forms. Then I write it up, design it around your ' +
    'field rather than a template, and hand you files that are ready to publish.\n\n' +
    "Takes about 15–30 minutes. You can skip anything you'd rather not answer.\n\n" +
    'So — what do you do, and how long have you been doing it?',
  quickReplies: [],
};

export async function runInterviewTurn(
  state: SessionState,
  history: ChatMessage[],
): Promise<{ message: ChatMessage; progress: InterviewProgress; notices: UserNotice[] }> {
  const transcript = history
    .map((m) => `${m.role === 'user' ? 'THEM' : 'YOU'}: ${m.content}`)
    .join('\n');

  const userPrompt = [
    'CONVERSATION SO FAR',
    transcript || '(the conversation has not started)',
    '',
    'WHAT YOU HAVE GATHERED SO FAR',
    `profile: ${asJson(state.rawProfile)}`,
    `projects: ${asJson(state.rawProjects)}`,
    '',
    `Questions you have already asked: ${countQuestions(history)} of ${MAX_QUESTIONS}.`,
    '',
    'Write your next turn.',
  ].join('\n');

  const output = await generateJson<InterviewerOutput>({
    stage: 'agent-0-interviewer',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.6,
    maxOutputTokens: 6144,
  });

  applyToState(state, output);

  const notices = buildNotices(state, output);
  state.notices = mergeNotices(state.notices, notices);

  const progress = buildProgress(state, output, history);
  state.status = progress.readyToBuild ? 'ready_to_build' : 'intake';
  state.updatedAt = new Date().toISOString();

  return {
    message: {
      role: 'assistant',
      content: output.reply?.trim() || 'Could you tell me a bit more about that?',
      quickReplies: (output.quickReplies ?? []).filter(Boolean).slice(0, 4),
      at: new Date().toISOString(),
    },
    progress,
    notices,
  };
}

/* ------------------------------------------------------------------ */
/* State merge — Agent 0 owns rawProfile, rawProjects and intake flags */
/* ------------------------------------------------------------------ */

function applyToState(state: SessionState, output: InterviewerOutput): void {
  const incoming = output.profile ?? {};
  const current = state.rawProfile ?? emptyProfile();

  state.rawProfile = {
    ...current,
    ...stripEmpty(incoming),
    existingBrand: { ...current.existingBrand, ...(incoming.existingBrand ?? {}) },
    referencePostings: pickLonger(current.referencePostings, incoming.referencePostings),
    visualReferences: pickLonger(current.visualReferences, incoming.visualReferences),
  };

  if (Array.isArray(output.projects) && output.projects.length) {
    state.rawProjects = output.projects.map(normaliseProject);
  }

  const flags = output.flags ?? { nda: false, regulatedProfession: false, minor: false };
  state.flags.nda = state.flags.nda || Boolean(flags.nda);
  state.flags.regulatedProfession = state.flags.regulatedProfession || Boolean(flags.regulatedProfession);
  state.flags.insufficientEvidence = usableProjects(state.rawProjects).length < 2;
  state.language = state.rawProfile.language || 'en';
}

function normaliseProject(project: RawProject, index: number): RawProject {
  return {
    id: project.id || `p${index + 1}`,
    name: project.name ?? '',
    year: project.year ?? '',
    type: project.type ?? 'professional',
    problem: project.problem ?? '',
    ownRole: project.ownRole ?? '',
    teamRole: project.teamRole ?? '',
    actions: project.actions ?? '',
    outcome: project.outcome ?? '',
    metrics: (project.metrics ?? []).filter((m) => m && m.claim),
    materials: (project.materials ?? []).filter((m) => m && (m.description || m.ref)),
    confidential: Boolean(project.confidential),
    notes: project.notes ?? '',
  };
}

/** Router 0's minimum: a problem, what they personally did, and an outcome or actions. */
export function usableProjects(projects: RawProject[]): RawProject[] {
  return projects.filter((p) => p.problem && p.ownRole && (p.outcome || p.actions));
}

function stripEmpty(profile: Partial<RawProfile>): Partial<RawProfile> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(profile)) {
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) continue;
    out[key] = value;
  }
  return out as Partial<RawProfile>;
}

function pickLonger(current: string[] = [], incoming?: string[]): string[] {
  if (!incoming || incoming.length < current.length) return current;
  return incoming.filter(Boolean);
}

export function emptyProfile(): RawProfile {
  return {
    profession: '',
    specialty: '',
    yearsExperience: null,
    goal: '',
    targetRole: '',
    referencePostings: [],
    region: '',
    language: 'en',
    statedDifferentiator: '',
    desiredImpression: '',
    preferredFormat: '',
    visualReferences: [],
    existingBrand: {},
    voiceSample: '',
  };
}

/* ------------------------------------------------------------------ */
/* Progress + notices                                                  */
/* ------------------------------------------------------------------ */

function countQuestions(history: ChatMessage[]): number {
  return history.filter((m) => m.role === 'assistant' && m.content.includes('?')).length;
}

function buildProgress(
  state: SessionState,
  output: InterviewerOutput,
  history: ChatMessage[],
): InterviewProgress {
  const profile = state.rawProfile ?? emptyProfile();
  const usable = usableProjects(state.rawProjects);
  const asked = Math.max(output.questionsAsked ?? 0, countQuestions(history));
  const block = output.currentBlock ?? 'identity';

  return {
    questionsAsked: Math.min(asked, MAX_QUESTIONS),
    maxQuestions: MAX_QUESTIONS,
    block,
    blockLabel: BLOCK_LABELS[block] ?? BLOCK_LABELS.identity,
    readyToBuild: Boolean(output.readyToBuild) && Boolean(profile.profession) && usable.length >= 1,
    collected: [
      { label: 'What you do', done: Boolean(profile.profession) },
      { label: "What it's for", done: Boolean(profile.goal) },
      { label: 'Who it needs to convince', done: Boolean(profile.targetRole || profile.referencePostings.length) },
      { label: `Your work (${usable.length} usable)`, done: usable.length >= 2 },
      { label: 'What sets you apart', done: Boolean(profile.statedDifferentiator || profile.desiredImpression) },
      { label: 'Format and look', done: Boolean(profile.preferredFormat) },
    ],
  };
}

function buildNotices(state: SessionState, output: InterviewerOutput): UserNotice[] {
  const notices: UserNotice[] = [];

  if (output.flags?.regulatedProfession) {
    notices.push({
      kind: 'legal',
      message:
        'Your field has rules about professional advertising and client confidentiality that vary by ' +
        'jurisdiction. We will keep client details out of the portfolio, but please check the finished ' +
        'piece against your professional body’s guidance before you publish it. This is not legal advice.',
    });
  }

  if (output.flags?.nda) {
    notices.push({
      kind: 'confidentiality',
      message:
        'You mentioned confidential work. We will show your process and reasoning instead of the client’s ' +
        'material, remove identifying details, or describe the work generically — whichever fits each project. ' +
        'The final call on what is safe to publish is yours.',
    });
  }

  if (state.flags.insufficientEvidence && state.rawProjects.length > 0) {
    notices.push({
      kind: 'evidence',
      message:
        'With fewer than two projects we can still build something useful — a capabilities piece plus a short, ' +
        'concrete plan for the work that would make it stronger.',
    });
  }

  return notices;
}

export function mergeNotices(existing: UserNotice[], incoming: UserNotice[]): UserNotice[] {
  const seen = new Set(existing.map((n) => `${n.kind}:${n.message}`));
  const merged = [...existing];
  for (const notice of incoming) {
    const key = `${notice.kind}:${notice.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(notice);
    }
  }
  return merged;
}
