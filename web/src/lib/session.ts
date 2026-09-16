const STORAGE_KEY = 'quizclash-session';

export interface StoredSession {
  readonly lobbyCode: string;
  readonly playerId: string;
  readonly reconnectToken: string;
  readonly name: string;
  readonly avatarSeed: string;
}

export function saveSession(session: StoredSession): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function loadSession(): StoredSession | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'lobbyCode' in parsed &&
      'playerId' in parsed &&
      'reconnectToken' in parsed &&
      'name' in parsed &&
      'avatarSeed' in parsed
    ) {
      return parsed as StoredSession;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
