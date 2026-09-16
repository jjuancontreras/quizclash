import { GoogleGenAI, type Content } from '@google/genai';
import { QUIZ_RESPONSE_SCHEMA } from './schema.js';
import { buildQuizPrompt } from './prompt.js';
import { GEMINI_REQUEST_TIMEOUT_MS } from '../shared/constants.js';
import type { SetupConfig } from '../shared/types.js';

export type QuizSource =
  | { readonly kind: 'pdf'; readonly base64: string }
  | { readonly kind: 'text'; readonly text: string };

/** The seam that lets every test run without network or API quota. */
export interface QuizModel {
  generate(source: QuizSource, config: SetupConfig): Promise<string>;
}

/**
 * Model id is a single constant on purpose: Gemini Flash ids move fast, and
 * this is the one line to change. Verify it resolves before first deploy —
 * see the plan's Task 7 Step 6.
 *
 * `gemini-flash-latest` (the full model) was confirmed live, twice, to be
 * returning 503 "high demand" errors taking 60-170s to even fail — well
 * past this app's entire GENERATION_TIMEOUT_MS budget. `gemini-flash-lite-latest`
 * was verified against a real uploaded PDF in the same session: correct,
 * well-sourced quiz questions in ~6.5s. If the full model's availability
 * recovers and lite's quality ever proves insufficient for real material,
 * this is the one line to revert.
 */
export const DEFAULT_GEMINI_MODEL = 'gemini-flash-lite-latest';

/**
 * Generation temperature. Higher values vary question phrasing; lower values
 * stay closer to the material. Tunable for question quality and diversity.
 */
export const QUIZ_GENERATION_TEMPERATURE = 0.7;

/**
 * Material is wrapped in explicit delimiters and placed BEFORE the prompt, so
 * the instructions are the last thing read and anything instruction-shaped
 * inside the material is visibly framed as data. Spec §8.
 */
export function buildContents(source: QuizSource, prompt: string): Content[] {
  const materialPart =
    source.kind === 'pdf'
      ? { inlineData: { mimeType: 'application/pdf', data: source.base64 } }
      : { text: `BEGIN STUDY MATERIAL\n${source.text}\nEND STUDY MATERIAL` };

  return [{ role: 'user', parts: [materialPart, { text: prompt }] }];
}

export function createGeminiModel(
  apiKey: string,
  modelId: string = DEFAULT_GEMINI_MODEL,
): QuizModel {
  const ai = new GoogleGenAI({ apiKey });

  return {
    async generate(source: QuizSource, config: SetupConfig): Promise<string> {
      const response = await ai.models.generateContent({
        model: modelId,
        contents: buildContents(source, buildQuizPrompt(config)),
        config: {
          responseMimeType: 'application/json',
          responseSchema: QUIZ_RESPONSE_SCHEMA,
          temperature: QUIZ_GENERATION_TEMPERATURE,
          // Without this, one slow call can silently burn the entire
          // GENERATION_TIMEOUT_MS budget by itself, leaving no time for
          // generateQuiz's retry to ever run.
          httpOptions: { timeout: GEMINI_REQUEST_TIMEOUT_MS },
        },
      });

      const text = response.text;
      if (text === undefined || text.trim().length === 0) {
        throw new Error('Gemini returned an empty response');
      }
      return text;
    },
  };
}
