import { z } from 'zod';
import { MAX_UPLOAD_BYTES } from '../shared/constants.js';
import { isChoiceIndex, type EngineEvent } from '../shared/types.js';
import type { QuizSource } from '../quiz/geminiClient.js';

/**
 * Base64 encodes every 3 input bytes as 4 output characters, padding the
 * final group up to a full quantum — exactly `ceil(bytes / 3) * 4`. Using an
 * approximate multiplier here would admit uploads past the documented byte
 * cap.
 */
export const MAX_UPLOAD_BASE64_CHARS = Math.ceil(MAX_UPLOAD_BYTES / 3) * 4;

const SetupMessageSchema = z.object({
  config: z.object({
    count: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20)]),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    focus: z.string().max(200),
    sourceKind: z.enum(['pdf', 'text']),
  }),
  source: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('pdf'), base64: z.string() }),
    z.object({ kind: z.literal('text'), text: z.string().max(1_000_000) }),
  ]),
});

export interface ParsedMessage {
  readonly event: EngineEvent;
  readonly source: QuizSource | null;
}

function parseSetup(message: unknown, playerId: string): ParsedMessage | null {
  const parsed = SetupMessageSchema.safeParse(message);
  if (!parsed.success) return null;

  const { config, source } = parsed.data;
  if (source.kind === 'pdf' && source.base64.length > MAX_UPLOAD_BASE64_CHARS) return null;
  if (source.kind === 'text' && source.text.trim().length === 0) return null;

  return { event: { type: 'SUBMIT_SETUP', playerId, config }, source };
}

/**
 * `playerId` always comes from the socket the message arrived on — never from
 * the message body, or any player could act as any other.
 */
export function parseClientMessage(raw: string, playerId: string): ParsedMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const message = parsed as Record<string, unknown>;
  switch (message.type) {
    case 'OPEN_SETUP':
      return { event: { type: 'OPEN_SETUP', playerId }, source: null };
    case 'PLAY_AGAIN':
      return { event: { type: 'PLAY_AGAIN', playerId }, source: null };
    case 'SUBMIT_ANSWER':
      return isChoiceIndex(message.choiceIndex)
        ? { event: { type: 'SUBMIT_ANSWER', playerId, choiceIndex: message.choiceIndex }, source: null }
        : null;
    case 'SUBMIT_SETUP':
      return parseSetup(message, playerId);
    default:
      return null;
  }
}
