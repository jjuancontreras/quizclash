import {
  COUNTDOWN_MS,
  GENERATION_TIMEOUT_MS,
  IDLE_CLEANUP_MS,
  MAX_NAME_CHARS,
  MAX_PLAYERS,
  QUESTION_WINDOW_MS,
  REVEAL_MS,
} from '../shared/constants.js';
import type {
  Answer,
  EngineEvent,
  EngineResult,
  GameState,
  Player,
  PublicState,
  Question,
  ServerMessage,
} from '../shared/types.js';
import { scoreAnswer } from './scoring.js';

export function createInitialState(lobbyCode: string): GameState {
  return {
    phase: 'LOBBY',
    lobbyCode,
    hostId: null,
    players: [],
    questions: [],
    questionIndex: 0,
    questionShownAtMs: null,
    answers: [],
    phaseEndsAtMs: null,
    error: null,
  };
}

/**
 * Display names are rendered on three other people's screens. Treat as hostile.
 * Truncating to the display budget can land on a trailing space that wasn't at
 * the edge before the cut, so the result is trimmed again and re-checked
 * against the empty-name fallback.
 */
export function sanitizeName(raw: string): string {
  const cleaned = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim()
    .slice(0, MAX_NAME_CHARS)
    .trim();
  return cleaned.length === 0 ? 'Player' : cleaned;
}

/**
 * `desired` is already within MAX_NAME_CHARS (sanitizeName's job). The
 * numbered suffix must not push the total back over that budget, so the base
 * is shortened to make room for it before appending.
 */
export function resolveNameCollision(desired: string, taken: readonly string[]): string {
  if (!taken.includes(desired)) return desired;
  for (let n = 2; n < 100; n++) {
    const suffix = ` (${n})`;
    const base = desired.slice(0, Math.max(0, MAX_NAME_CHARS - suffix.length)).trimEnd();
    const candidate = `${base}${suffix}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return desired;
}

export function toPublicState(state: GameState): PublicState {
  const current = state.questions[state.questionIndex];
  const isLive = state.phase === 'QUESTION';
  const isReveal = state.phase === 'REVEAL';

  return {
    phase: state.phase,
    lobbyCode: state.lobbyCode,
    hostId: state.hostId,
    players: state.players,
    questionIndex: state.questionIndex,
    totalQuestions: state.questions.length,
    phaseEndsAtMs: state.phaseEndsAtMs,
    prompt:
      (isLive || isReveal) && current !== undefined
        ? { question: current.question, choices: current.choices }
        : null,
    reveal:
      isReveal && current !== undefined
        ? {
            correctIndex: current.correctIndex,
            explanation: current.explanation,
            sourceQuote: current.sourceQuote,
          }
        : null,
    error: state.error,
  };
}

function broadcastState(state: GameState): ServerMessage[] {
  return [{ type: 'STATE', state: toPublicState(state) }];
}

function result(state: GameState, overrides: Partial<EngineResult> = {}): EngineResult {
  return {
    state,
    broadcasts: broadcastState(state),
    alarmAtMs: null,
    effect: null,
    ...overrides,
  };
}

function rejected(
  state: GameState,
  reason: 'LOBBY_FULL' | 'NOT_HOST' | 'BAD_PHASE',
): EngineResult {
  return { state, broadcasts: [{ type: 'REJECTED', reason }], alarmAtMs: null, effect: null };
}

function handleJoin(
  state: GameState,
  event: Extract<EngineEvent, { type: 'PLAYER_JOIN' }>,
  nowMs: number,
): EngineResult {
  if (state.players.length >= MAX_PLAYERS) return rejected(state, 'LOBBY_FULL');

  const name = resolveNameCollision(
    sanitizeName(event.name),
    state.players.map((p) => p.name),
  );

  const player: Player = {
    id: event.playerId,
    name,
    avatarSeed: event.avatarSeed,
    score: 0,
    joinedAtMs: nowMs,
    connected: true,
  };

  const next: GameState = {
    ...state,
    players: [...state.players, player],
    hostId: state.hostId ?? event.playerId,
  };

  return result(next, { alarmAtMs: nowMs + IDLE_CLEANUP_MS });
}

function handleLeave(
  state: GameState,
  event: Extract<EngineEvent, { type: 'PLAYER_LEAVE' }>,
  nowMs: number,
): EngineResult {
  const remaining = state.players.filter((p) => p.id !== event.playerId);
  if (remaining.length === state.players.length) return result(state);

  const nextHostId =
    state.hostId === event.playerId
      ? (remaining.slice().sort((a, b) => a.joinedAtMs - b.joinedAtMs)[0]?.id ?? null)
      : state.hostId;

  const next: GameState = { ...state, players: remaining, hostId: nextHostId };

  return remaining.length === 0
    ? result(next, { effect: { type: 'CLEANUP' } })
    : result(next, { alarmAtMs: nowMs + IDLE_CLEANUP_MS });
}

const GENERATION_TIMEOUT_MESSAGE = 'Question generation took too long. Try a smaller file.';

function handleOpenSetup(state: GameState, playerId: string): EngineResult {
  if (playerId !== state.hostId) return rejected(state, 'NOT_HOST');
  if (state.phase !== 'LOBBY' && state.phase !== 'PODIUM') return rejected(state, 'BAD_PHASE');

  return result({ ...state, phase: 'SETUP', error: null });
}

function handleSubmitSetup(
  state: GameState,
  event: Extract<EngineEvent, { type: 'SUBMIT_SETUP' }>,
  nowMs: number,
): EngineResult {
  if (event.playerId !== state.hostId) return rejected(state, 'NOT_HOST');
  if (state.phase !== 'SETUP') return rejected(state, 'BAD_PHASE');

  const next: GameState = {
    ...state,
    phase: 'GENERATING',
    error: null,
    phaseEndsAtMs: nowMs + GENERATION_TIMEOUT_MS,
  };

  return result(next, {
    alarmAtMs: nowMs + GENERATION_TIMEOUT_MS,
    effect: { type: 'GENERATE', config: event.config },
  });
}

function handleGenerationSucceeded(
  state: GameState,
  questions: readonly Question[],
  nowMs: number,
): EngineResult {
  if (state.phase !== 'GENERATING') return result(state);

  const next: GameState = {
    ...state,
    phase: 'COUNTDOWN',
    questions,
    questionIndex: 0,
    answers: [],
    error: null,
    phaseEndsAtMs: nowMs + COUNTDOWN_MS,
  };

  return result(next, { alarmAtMs: nowMs + COUNTDOWN_MS });
}

function handleGenerationFailed(state: GameState, reason: string): EngineResult {
  if (state.phase !== 'GENERATING') return result(state);

  return result({ ...state, phase: 'SETUP', error: reason, phaseEndsAtMs: null });
}

function showQuestion(state: GameState, index: number, nowMs: number): EngineResult {
  const next: GameState = {
    ...state,
    phase: 'QUESTION',
    questionIndex: index,
    questionShownAtMs: nowMs,
    answers: [],
    phaseEndsAtMs: nowMs + QUESTION_WINDOW_MS,
  };
  return result(next, { alarmAtMs: nowMs + QUESTION_WINDOW_MS });
}

function enterReveal(state: GameState, nowMs: number): EngineResult {
  const next: GameState = { ...state, phase: 'REVEAL', phaseEndsAtMs: nowMs + REVEAL_MS };
  return result(next, { alarmAtMs: nowMs + REVEAL_MS });
}

function enterPodium(state: GameState): EngineResult {
  return result({ ...state, phase: 'PODIUM', phaseEndsAtMs: null, questionShownAtMs: null });
}

function handleSubmitAnswer(
  state: GameState,
  event: Extract<EngineEvent, { type: 'SUBMIT_ANSWER' }>,
  nowMs: number,
): EngineResult {
  if (state.phase !== 'QUESTION' || state.questionShownAtMs === null) return result(state);
  if (!state.players.some((p) => p.id === event.playerId)) return result(state);
  if (state.answers.some((a) => a.playerId === event.playerId)) return result(state);

  const question = state.questions[state.questionIndex];
  if (question === undefined) return result(state);

  const points = scoreAnswer({
    answeredAtMs: nowMs,
    shownAtMs: state.questionShownAtMs,
    windowMs: QUESTION_WINDOW_MS,
    isCorrect: event.choiceIndex === question.correctIndex,
  });

  const answer: Answer = {
    playerId: event.playerId,
    choiceIndex: event.choiceIndex,
    answeredAtMs: nowMs,
    points,
  };

  const next: GameState = {
    ...state,
    answers: [...state.answers, answer],
    players: state.players.map((p) =>
      p.id === event.playerId ? { ...p, score: p.score + points } : p,
    ),
  };

  return next.answers.length >= next.players.length
    ? enterReveal(next, nowMs)
    : result(next, { alarmAtMs: state.phaseEndsAtMs });
}

function handleRoundTimeout(state: GameState, nowMs: number): EngineResult {
  if (state.phase === 'COUNTDOWN') return showQuestion(state, 0, nowMs);
  if (state.phase === 'QUESTION') return enterReveal(state, nowMs);
  if (state.phase === 'REVEAL') {
    const nextIndex = state.questionIndex + 1;
    return nextIndex >= state.questions.length
      ? enterPodium(state)
      : showQuestion(state, nextIndex, nowMs);
  }
  return result(state);
}

export function reduce(state: GameState, event: EngineEvent, nowMs: number): EngineResult {
  switch (event.type) {
    case 'PLAYER_JOIN':
      return handleJoin(state, event, nowMs);
    case 'PLAYER_LEAVE':
      return handleLeave(state, event, nowMs);
    case 'OPEN_SETUP':
      return handleOpenSetup(state, event.playerId);
    case 'SUBMIT_SETUP':
      return handleSubmitSetup(state, event, nowMs);
    case 'GENERATION_SUCCEEDED':
      return handleGenerationSucceeded(state, event.questions, nowMs);
    case 'GENERATION_FAILED':
      return handleGenerationFailed(state, event.reason);
    case 'SUBMIT_ANSWER':
      return handleSubmitAnswer(state, event, nowMs);
    case 'TIMEOUT':
      return state.phase === 'GENERATING'
        ? handleGenerationFailed(state, GENERATION_TIMEOUT_MESSAGE)
        : handleRoundTimeout(state, nowMs);
    default:
      return result(state);
  }
}
