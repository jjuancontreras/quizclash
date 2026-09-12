export type GamePhase =
  | 'LOBBY'
  | 'SETUP'
  | 'GENERATING'
  | 'COUNTDOWN'
  | 'QUESTION'
  | 'REVEAL'
  | 'PODIUM';

export type ChoiceIndex = 0 | 1 | 2 | 3;
export type Difficulty = 'easy' | 'medium' | 'hard';
export type QuestionCount = 5 | 10 | 15 | 20;

export interface Question {
  readonly question: string;
  readonly choices: readonly string[];
  readonly correctIndex: number;
  readonly explanation: string;
  readonly sourceQuote: string;
}

export interface Player {
  readonly id: string;
  readonly name: string;
  readonly avatarSeed: string;
  readonly score: number;
  readonly joinedAtMs: number;
  readonly connected: boolean;
}

export interface SetupConfig {
  readonly count: QuestionCount;
  readonly difficulty: Difficulty;
  readonly focus: string;
  readonly sourceKind: 'pdf' | 'text';
}

/** A player's answer to the current question. */
export interface Answer {
  readonly playerId: string;
  readonly choiceIndex: ChoiceIndex;
  readonly answeredAtMs: number;
  readonly points: number;
}

export interface GameState {
  readonly phase: GamePhase;
  readonly lobbyCode: string;
  readonly hostId: string | null;
  readonly players: readonly Player[];
  readonly questions: readonly Question[];
  readonly questionIndex: number;
  readonly questionShownAtMs: number | null;
  readonly answers: readonly Answer[];
  readonly phaseEndsAtMs: number | null;
  readonly error: string | null;
  /**
   * Identifies the generation attempt the lobby is currently waiting on.
   * Incremented by every SUBMIT_SETUP. Phase alone cannot tell a fresh
   * attempt from an abandoned one — after a timeout and a retry the phase is
   * GENERATING for both — so results must name the attempt they belong to.
   */
  readonly generationId: number;
}

/** Events the reducer accepts. All external input becomes one of these. */
export type EngineEvent =
  | { readonly type: 'PLAYER_JOIN'; readonly playerId: string; readonly name: string; readonly avatarSeed: string }
  | { readonly type: 'PLAYER_LEAVE'; readonly playerId: string }
  | { readonly type: 'PLAYER_RECONNECT'; readonly playerId: string }
  | { readonly type: 'OPEN_SETUP'; readonly playerId: string }
  | { readonly type: 'SUBMIT_SETUP'; readonly playerId: string; readonly config: SetupConfig }
  | {
      readonly type: 'GENERATION_SUCCEEDED';
      readonly generationId: number;
      readonly questions: readonly Question[];
    }
  | { readonly type: 'GENERATION_FAILED'; readonly generationId: number; readonly reason: string }
  | { readonly type: 'SUBMIT_ANSWER'; readonly playerId: string; readonly choiceIndex: ChoiceIndex }
  | { readonly type: 'PLAY_AGAIN'; readonly playerId: string }
  | { readonly type: 'TIMEOUT' };

/** What the Durable Object pushes to clients. */
export type ServerMessage =
  | { readonly type: 'STATE'; readonly state: PublicState }
  | { readonly type: 'ERROR'; readonly message: string }
  | { readonly type: 'REJECTED'; readonly reason: 'LOBBY_FULL' | 'NOT_HOST' | 'BAD_PHASE' };

/**
 * The client-safe projection of state. Critically, it omits `correctIndex`
 * while a question is live — the answer key must never reach a browser
 * before REVEAL, or devtools is a cheat menu.
 */
export interface PublicState {
  readonly phase: GamePhase;
  readonly lobbyCode: string;
  readonly hostId: string | null;
  readonly players: readonly Player[];
  readonly questionIndex: number;
  readonly totalQuestions: number;
  readonly phaseEndsAtMs: number | null;
  readonly prompt: { readonly question: string; readonly choices: readonly string[] } | null;
  readonly reveal: {
    readonly correctIndex: number;
    readonly explanation: string;
    readonly sourceQuote: string;
  } | null;
  readonly error: string | null;
}

/** Side effects the reducer requests but never performs itself. */
export type EngineEffect =
  | { readonly type: 'GENERATE'; readonly generationId: number; readonly config: SetupConfig }
  | { readonly type: 'CLEANUP' };

export interface EngineResult {
  readonly state: GameState;
  readonly broadcasts: readonly ServerMessage[];
  readonly alarmAtMs: number | null;
  readonly effect: EngineEffect | null;
}

/** Narrows an untrusted wire value to a real answer slot. */
export function isChoiceIndex(value: unknown): value is ChoiceIndex {
  return value === 0 || value === 1 || value === 2 || value === 3;
}
