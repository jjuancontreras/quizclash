import {
  COUNTDOWN_MS,
  DEFAULT_AVATAR_SEED,
  GENERATION_TIMEOUT_MS,
  IDLE_CLEANUP_MS,
  MAX_AVATAR_SEED_CHARS,
  MAX_NAME_CHARS,
  MAX_PLAYERS,
  QUESTION_WINDOW_MS,
  REVEAL_MS,
} from '../shared/constants.js';
import type {
  Answer,
  EngineEvent,
  EngineResult,
  GamePhase,
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
    generationId: 0,
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
 * The avatar seed is the other untrusted string a joining player supplies. It
 * is rebroadcast in every STATE frame for the life of the lobby and is handed
 * to an avatar service, so it is reduced to an alphabet that is safe in a URL
 * path and harmless as text, then capped. Sanitized here rather than in the
 * adapter, for the same reason the display name is: no caller of `reduce` can
 * then seat an unsanitized one.
 */
export function sanitizeSeed(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_-]/g, '').slice(0, MAX_AVATAR_SEED_CHARS);
  return cleaned.length === 0 ? DEFAULT_AVATAR_SEED : cleaned;
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
    players: state.players.map(({ reconnectToken, ...publicPlayer }) => publicPlayer),
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
    replies: [],
    alarmAtMs: null,
    effect: null,
    ...overrides,
  };
}

function rejected(
  state: GameState,
  playerId: string,
  reason: 'LOBBY_FULL' | 'NOT_HOST' | 'BAD_PHASE' | 'BAD_TOKEN',
): EngineResult {
  return {
    state,
    broadcasts: [],
    replies: [{ to: playerId, message: { type: 'REJECTED', reason } }],
    alarmAtMs: null,
    effect: null,
  };
}

function handleJoin(
  state: GameState,
  event: Extract<EngineEvent, { type: 'PLAYER_JOIN' }>,
  nowMs: number,
): EngineResult {
  if (state.players.length >= MAX_PLAYERS) return rejected(state, event.playerId, 'LOBBY_FULL');

  const name = resolveNameCollision(
    sanitizeName(event.name),
    state.players.map((p) => p.name),
  );

  const player: Player = {
    id: event.playerId,
    name,
    avatarSeed: sanitizeSeed(event.avatarSeed),
    score: 0,
    joinedAtMs: nowMs,
    connected: true,
    reconnectToken: event.reconnectToken,
  };

  const next: GameState = {
    ...state,
    players: [...state.players, player],
    hostId: state.hostId ?? event.playerId,
  };

  return result(next, { alarmAtMs: state.phaseEndsAtMs ?? nowMs + IDLE_CLEANUP_MS });
}

/**
 * True only for the phases where a round is underway and a seat may hold
 * accumulated progress worth preserving. Before COUNTDOWN — LOBBY, SETUP,
 * GENERATING — there is nothing to preserve by keeping a disconnected
 * player's seat, and an absent host is actively harmful there because only
 * the host can advance the lobby. So SETUP/GENERATING free the seat exactly
 * like LOBBY does, not like QUESTION/REVEAL.
 */
function isRoundRunning(phase: GamePhase): boolean {
  return phase === 'COUNTDOWN' || phase === 'QUESTION' || phase === 'REVEAL';
}

/**
 * The lobby's promotion rule, in one place: the longest-seated player who is
 * actually still in the room. A seat merely held open by a disconnected
 * player can never carry the host role, because only the host can advance the
 * lobby.
 */
function promoteHostId(players: readonly Player[]): string | null {
  return (
    players
      .filter((p) => p.connected)
      .slice()
      .sort((a, b) => a.joinedAtMs - b.joinedAtMs)[0]?.id ?? null
  );
}

/** True once every player still in the room has an answer on the board. */
function everyConnectedPlayerAnswered(state: GameState): boolean {
  const present = state.players.filter((p) => p.connected);
  return present.length > 0 && present.every((p) => state.answers.some((a) => a.playerId === p.id));
}

/**
 * Mid-game (once a round is running) the seat and score are KEPT and the
 * player is only marked disconnected — three players must not be held
 * hostage by one person's wifi, and that person must be able to rejoin.
 * Spec §6. Before a round is running (LOBBY, SETUP, GENERATING) the seat is
 * freed exactly as in the lobby, since there is no score to preserve and a
 * missing host would otherwise strand the room.
 */
function handleLeave(
  state: GameState,
  event: Extract<EngineEvent, { type: 'PLAYER_LEAVE' }>,
  nowMs: number,
): EngineResult {
  const isSeated = state.players.some((p) => p.id === event.playerId);
  if (!isSeated) return result(state);

  if (isRoundRunning(state.phase)) {
    const players = state.players.map((p) =>
      p.id === event.playerId ? { ...p, connected: false } : p,
    );
    const next: GameState = { ...state, players };
    const allGone = players.every((p) => !p.connected);
    if (allGone) return result(next, { effect: { type: 'CLEANUP' } });

    // The departing player may have been the last one the round was waiting
    // on. Without re-checking here the question runs its full window for
    // nobody — and if cleanup has since deleted the alarm, forever.
    if (state.phase === 'QUESTION' && everyConnectedPlayerAnswered(next)) {
      return enterReveal(next, nowMs);
    }

    return result(next, { alarmAtMs: state.phaseEndsAtMs });
  }

  const remaining = state.players.filter((p) => p.id !== event.playerId);
  const nextHostId =
    state.hostId === event.playerId
      ? (remaining.slice().sort((a, b) => a.joinedAtMs - b.joinedAtMs)[0]?.id ?? null)
      : state.hostId;

  const next: GameState = { ...state, players: remaining, hostId: nextHostId };

  return remaining.length === 0
    ? result(next, { effect: { type: 'CLEANUP' } })
    : result(next, { alarmAtMs: state.phaseEndsAtMs ?? nowMs + IDLE_CLEANUP_MS });
}

/**
 * Re-arms the phase deadline rather than returning `null` ("leave the alarm
 * alone"). If everyone had dropped, the adapter already ran CLEANUP and
 * deleted the alarm, so leaving it alone strands the returning player in a
 * phase nothing can end. A deadline already in the past makes `setAlarm` fire
 * immediately, which is the correct recovery.
 */
function handleReconnect(
  state: GameState,
  event: Extract<EngineEvent, { type: 'PLAYER_RECONNECT' }>,
): EngineResult {
  const player = state.players.find((p) => p.id === event.playerId);
  if (player === undefined) return result(state);
  if (player.reconnectToken !== event.reconnectToken) return rejected(state, event.playerId, 'BAD_TOKEN');

  const players = state.players.map((p) =>
    p.id === event.playerId ? { ...p, connected: true } : p,
  );
  return result({ ...state, players }, { alarmAtMs: state.phaseEndsAtMs });
}

/**
 * Seats held by disconnected players are pruned here and nowhere else. Their
 * PLAYER_LEAVE has already fired and no LOBBY event unseats them, so a ghost
 * that survives PLAY_AGAIN fills the room permanently and the next friend is
 * told the lobby is full.
 */
function handlePlayAgain(state: GameState, playerId: string): EngineResult {
  if (playerId !== state.hostId) return rejected(state, playerId, 'NOT_HOST');
  if (state.phase !== 'PODIUM') return rejected(state, playerId, 'BAD_PHASE');

  const players = state.players.filter((p) => p.connected).map((p) => ({ ...p, score: 0 }));

  const next: GameState = {
    ...state,
    phase: 'LOBBY',
    players,
    hostId: players.some((p) => p.id === state.hostId) ? state.hostId : promoteHostId(players),
    questions: [],
    questionIndex: 0,
    questionShownAtMs: null,
    answers: [],
    phaseEndsAtMs: null,
    error: null,
  };

  return result(next);
}

const GENERATION_TIMEOUT_MESSAGE = 'Question generation took too long. Try a smaller file.';

function handleOpenSetup(state: GameState, playerId: string): EngineResult {
  if (playerId !== state.hostId) return rejected(state, playerId, 'NOT_HOST');
  if (state.phase !== 'LOBBY' && state.phase !== 'PODIUM') return rejected(state, playerId, 'BAD_PHASE');

  return result({ ...state, phase: 'SETUP', error: null });
}

function handleSubmitSetup(
  state: GameState,
  event: Extract<EngineEvent, { type: 'SUBMIT_SETUP' }>,
  nowMs: number,
): EngineResult {
  if (event.playerId !== state.hostId) return rejected(state, event.playerId, 'NOT_HOST');
  if (state.phase !== 'SETUP') return rejected(state, event.playerId, 'BAD_PHASE');

  // A new attempt gets a new identity, which is what makes the previous
  // attempt's late result recognisably stale. `runEffect` has no abort, so an
  // abandoned attempt really does keep running and really does come back.
  const generationId = state.generationId + 1;

  const next: GameState = {
    ...state,
    phase: 'GENERATING',
    error: null,
    phaseEndsAtMs: nowMs + GENERATION_TIMEOUT_MS,
    generationId,
  };

  return result(next, {
    alarmAtMs: nowMs + GENERATION_TIMEOUT_MS,
    effect: { type: 'GENERATE', generationId, config: event.config },
  });
}

/**
 * A result belongs to the lobby only if it names the attempt the lobby is
 * still waiting on. The phase check alone accepts attempt A's result while
 * attempt B is in flight, because both leave the phase at GENERATING.
 */
function isCurrentGeneration(state: GameState, generationId: number): boolean {
  return state.phase === 'GENERATING' && state.generationId === generationId;
}

function handleGenerationSucceeded(
  state: GameState,
  event: Extract<EngineEvent, { type: 'GENERATION_SUCCEEDED' }>,
  nowMs: number,
): EngineResult {
  if (!isCurrentGeneration(state, event.generationId)) return result(state);
  const { questions } = event;

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

/** The unconditional transition. Only the TIMEOUT path may reach it directly. */
function failGeneration(state: GameState, reason: string): EngineResult {
  return result({ ...state, phase: 'SETUP', error: reason, phaseEndsAtMs: null });
}

function handleGenerationFailed(
  state: GameState,
  event: Extract<EngineEvent, { type: 'GENERATION_FAILED' }>,
): EngineResult {
  if (!isCurrentGeneration(state, event.generationId)) return result(state);

  return failGeneration(state, event.reason);
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

/**
 * The podium is where the lobby needs a host again: both PLAY_AGAIN and
 * OPEN_SETUP are host-only. Mid-round the host's seat is deliberately
 * preserved even while they are gone (spec §6, "the game continues
 * uninterrupted"), so this is the first moment it is safe to re-evaluate —
 * otherwise a host whose wifi blipped leaves everyone else with no way to
 * start another game.
 */
function enterPodium(state: GameState): EngineResult {
  const hostIsPresent = state.players.some((p) => p.id === state.hostId && p.connected);

  return result({
    ...state,
    phase: 'PODIUM',
    hostId: hostIsPresent ? state.hostId : promoteHostId(state.players),
    phaseEndsAtMs: null,
    questionShownAtMs: null,
  });
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

  // Per player, not a count: a disconnected player's answer stays in
  // `answers` because it holds their score, so comparing totals lets a
  // departed player's answer stand in for a connected player's missing one
  // and reveals the round while someone is still waiting to play.
  return everyConnectedPlayerAnswered(next)
    ? enterReveal(next, nowMs)
    : result(next, { alarmAtMs: next.phaseEndsAtMs });
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
    case 'PLAYER_RECONNECT':
      return handleReconnect(state, event);
    case 'PLAY_AGAIN':
      return handlePlayAgain(state, event.playerId);
    case 'OPEN_SETUP':
      return handleOpenSetup(state, event.playerId);
    case 'SUBMIT_SETUP':
      return handleSubmitSetup(state, event, nowMs);
    case 'GENERATION_SUCCEEDED':
      return handleGenerationSucceeded(state, event, nowMs);
    case 'GENERATION_FAILED':
      return handleGenerationFailed(state, event);
    case 'SUBMIT_ANSWER':
      return handleSubmitAnswer(state, event, nowMs);
    case 'TIMEOUT':
      return state.phase === 'GENERATING'
        ? failGeneration(state, GENERATION_TIMEOUT_MESSAGE)
        : handleRoundTimeout(state, nowMs);
    default:
      return result(state);
  }
}
