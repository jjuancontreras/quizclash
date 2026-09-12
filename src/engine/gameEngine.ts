import { IDLE_CLEANUP_MS, MAX_NAME_CHARS, MAX_PLAYERS } from '../shared/constants.js';
import type {
  EngineEvent,
  EngineResult,
  GameState,
  Player,
  PublicState,
  ServerMessage,
} from '../shared/types.js';

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

/** Display names are rendered on three other people's screens. Treat as hostile. */
export function sanitizeName(raw: string): string {
  const cleaned = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim()
    .slice(0, MAX_NAME_CHARS);
  return cleaned.length === 0 ? 'Player' : cleaned;
}

export function resolveNameCollision(desired: string, taken: readonly string[]): string {
  if (!taken.includes(desired)) return desired;
  for (let n = 2; n < 100; n++) {
    const candidate = `${desired} (${n})`;
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

export function reduce(state: GameState, event: EngineEvent, nowMs: number): EngineResult {
  switch (event.type) {
    case 'PLAYER_JOIN':
      return handleJoin(state, event, nowMs);
    case 'PLAYER_LEAVE':
      return handleLeave(state, event, nowMs);
    default:
      return result(state);
  }
}
