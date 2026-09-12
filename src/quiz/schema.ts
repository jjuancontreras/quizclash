import { Type, type Schema } from '@google/genai';
import {
  MAX_CHOICE_CHARS,
  MAX_EXPLANATION_CHARS,
  MAX_QUESTION_CHARS,
} from '../shared/constants.js';

/**
 * NOTE (verified against @google/genai 2.22.0): `maxLength` and `maxItems`
 * are typed as STRING in the Gemini Schema, not number. Passing a number is
 * a compile error.
 *
 * This schema *guarantees* shape (four choices, an integer index, no missing
 * fields). It only *requests* the length limits — those are enforced for real
 * by `isQuestionWithinBudget`. See spec §8.
 */
export const QUIZ_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING, maxLength: String(MAX_QUESTION_CHARS) },
          choices: {
            type: Type.ARRAY,
            items: { type: Type.STRING, maxLength: String(MAX_CHOICE_CHARS) },
            minItems: '4',
            maxItems: '4',
          },
          correctIndex: { type: Type.INTEGER },
          explanation: { type: Type.STRING, maxLength: String(MAX_EXPLANATION_CHARS) },
          sourceQuote: { type: Type.STRING },
        },
        required: ['question', 'choices', 'correctIndex', 'explanation', 'sourceQuote'],
        propertyOrdering: ['question', 'choices', 'correctIndex', 'explanation', 'sourceQuote'],
      },
    },
  },
  required: ['questions'],
};
