import { GoogleGenAI, type Content } from '@google/genai';
import { QUIZ_RESPONSE_SCHEMA } from './schema.js';
import { buildQuizPrompt } from './prompt.js';
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
 */
export const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';

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
          temperature: 0.7,
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
