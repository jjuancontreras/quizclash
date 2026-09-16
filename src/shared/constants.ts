/** Milliseconds a player has to answer a single question. Spec §6. */
export const QUESTION_WINDOW_MS = 20_000;

/**
 * Once the first player answers a question, everyone still deciding has
 * their remaining time capped to this -- competitive pressure, not just a
 * courtesy. Never lengthens the deadline: a player who answers with less
 * than this already remaining does not get anyone extra time either.
 */
export const HURRY_WINDOW_MS = 7_000;

/** Milliseconds the REVEAL screen is held before the next question. */
export const REVEAL_MS = 5_000;

/** Milliseconds of 3-2-1 countdown before the first question. */
export const COUNTDOWN_MS = 3_000;

/** Hard lobby capacity. A fifth joiner is rejected. Spec §6. */
export const MAX_PLAYERS = 4;

/** Below this many valid questions, generation is treated as failed. Spec §8. */
export const MIN_QUESTIONS = 5;

/** Mobile text budgets — enforced server-side, not by CSS. Spec §8. */
export const MAX_QUESTION_CHARS = 120;
export const MAX_CHOICE_CHARS = 60;
export const MAX_EXPLANATION_CHARS = 150;

/** Display names are untrusted input rendered on other players' screens. */
export const MAX_NAME_CHARS = 16;

/**
 * Avatar seeds are untrusted input too: rebroadcast in every STATE frame and
 * destined for an avatar service's URL. Long enough for any real seed.
 */
export const MAX_AVATAR_SEED_CHARS = 32;

/** Used when a supplied avatar seed has nothing usable left in it. */
export const DEFAULT_AVATAR_SEED = 'default';

/** 10 MB — keeps PDFs under Gemini's inline base64 limit. Spec §8. */
export const MAX_UPLOAD_BYTES = 10_485_760;

/** Generation is aborted past this. Spec §8. */
export const GENERATION_TIMEOUT_MS = 90_000;

/**
 * Per-attempt network timeout for a single Gemini call. Generation retries
 * once (src/quiz/generator.ts), so this must leave room for two attempts
 * inside GENERATION_TIMEOUT_MS -- without it, one genuinely slow call (a
 * real "high demand" 503 has been observed taking well over two minutes to
 * even return an error) can burn the entire budget by itself, leaving no
 * time for the retry that would otherwise have succeeded.
 */
export const GEMINI_REQUEST_TIMEOUT_MS = 35_000;

/** An empty lobby self-destructs after this. Spec §6. */
export const IDLE_CLEANUP_MS = 600_000;

/** Points for an instantaneous correct answer. Spec §6. */
export const BASE_POINTS = 1000;

/** Lobby codes are 4 characters. Spec §5. */
export const LOBBY_CODE_LENGTH = 4;
