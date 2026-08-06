/**
 * LLM access layer.
 *
 * Every agent talks to the model through this module and nothing else, so the
 * provider, the model assignment and the JSON-repair behaviour can all change
 * in one place without touching a single stage.
 *
 * Model assignment follows the cost/capability table in section H.4 of the method.
 */

import { GoogleGenAI } from '@google/genai';

/* ------------------------------------------------------------------ */
/* Model profiles                                                      */
/* ------------------------------------------------------------------ */

/**
 * `reasoning` — highest-leverage decisions and writing quality.
 * `structured` — heavily specified structural work.
 * `conversational` — many turns, low reasoning depth.
 */
export type ModelProfile = 'reasoning' | 'structured' | 'conversational';

const MODELS: Record<ModelProfile, string> = {
  reasoning: 'gemini-2.5-pro',
  structured: 'gemini-2.5-flash',
  conversational: 'gemini-2.5-flash',
};

/** Per-stage assignment, mirroring H.4. Edit here to re-balance cost vs. quality. */
export const STAGE_MODEL: Record<string, ModelProfile> = {
  'agent-0-interviewer': 'conversational',
  'agent-1-strategist': 'reasoning',
  'agent-2-curator': 'reasoning',
  'agent-3-narrator': 'reasoning',
  'agent-4-architect': 'structured',
  'agent-5-art-director': 'reasoning',
  'agent-6-builder': 'reasoning',
  'agent-7-auditor': 'reasoning',
  'agent-8-packager': 'structured',
  'router-1-strategy-gate': 'structured',
  'router-3-integrity-gate': 'reasoning',
};

/* ------------------------------------------------------------------ */
/* Client                                                              */
/* ------------------------------------------------------------------ */

let cached: GoogleGenAI | null = null;

function client(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not set. Copy .env.example to .env and add your key, ' +
        'or set it in the hosting environment.',
    );
  }
  if (!cached) cached = new GoogleGenAI({ apiKey });
  return cached;
}

export function isConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export interface GenerateOptions {
  /** Stage id — selects the model profile. */
  stage: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** Overrides the profile that `stage` would select. */
  profile?: ModelProfile;
}

/* ------------------------------------------------------------------ */
/* JSON extraction                                                     */
/* ------------------------------------------------------------------ */

/**
 * Models occasionally wrap JSON in prose or fences even in JSON mode.
 * Pull out the widest balanced object/array and parse that.
 */
export function extractJson<T>(raw: string): T {
  const text = raw.trim();

  const direct = tryParse<T>(text);
  if (direct !== undefined) return direct;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    const parsed = tryParse<T>(fenced[1].trim());
    if (parsed !== undefined) return parsed;
  }

  for (const [open, close] of [
    ['{', '}'],
    ['[', ']'],
  ] as const) {
    const start = text.indexOf(open);
    const end = text.lastIndexOf(close);
    if (start !== -1 && end > start) {
      const parsed = tryParse<T>(text.slice(start, end + 1));
      if (parsed !== undefined) return parsed;
    }
  }

  throw new Error(`Model did not return parseable JSON. First 200 chars: ${text.slice(0, 200)}`);
}

function tryParse<T>(candidate: string): T | undefined {
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------ */
/* Generation                                                          */
/* ------------------------------------------------------------------ */

const MAX_ATTEMPTS = 3;

async function call(opts: GenerateOptions, jsonMode: boolean): Promise<string> {
  const model = MODELS[opts.profile ?? STAGE_MODEL[opts.stage] ?? 'structured'];

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await client().models.generateContent({
        model,
        contents: opts.userPrompt,
        config: {
          systemInstruction: opts.systemPrompt,
          temperature: opts.temperature ?? (jsonMode ? 0.3 : 0.7),
          maxOutputTokens: opts.maxOutputTokens ?? 8192,
          ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
        },
      });
      const text = response.text ?? '';
      if (!text.trim()) throw new Error('Model returned an empty response.');
      return text;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(400 * 2 ** (attempt - 1));
      }
    }
  }
  throw new Error(
    `[${opts.stage}] model call failed after ${MAX_ATTEMPTS} attempts: ${errorMessage(lastError)}`,
  );
}

/** Free-form text generation. Used only by the packager, which outputs Markdown. */
export async function generateText(opts: GenerateOptions): Promise<string> {
  return call(opts, false);
}

/**
 * JSON generation with one repair pass.
 *
 * Contract rule 1: agents return valid JSON and nothing else. When the model
 * breaks that contract we re-ask once with the broken output attached rather
 * than failing the whole run.
 */
export async function generateJson<T>(opts: GenerateOptions): Promise<T> {
  const raw = await call(opts, true);
  try {
    return extractJson<T>(raw);
  } catch (parseError) {
    const repaired = await call(
      {
        ...opts,
        profile: 'structured',
        temperature: 0,
        systemPrompt:
          'You repair malformed JSON. Return only the corrected JSON document. ' +
          'Preserve every value you can recover. Do not add commentary, keys or fences.',
        userPrompt: `The following was meant to be a single valid JSON document but could not be parsed (${errorMessage(
          parseError,
        )}). Return the corrected JSON.\n\n${raw}`,
      },
      true,
    );
    return extractJson<T>(repaired);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
