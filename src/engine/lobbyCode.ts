import { LOBBY_CODE_LENGTH } from '../shared/constants.js';

/**
 * Excludes 0/O, 1/I/L — these codes are read aloud and typed on phones,
 * where a misread character is a support problem with no support desk.
 */
export const LOBBY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateLobbyCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < LOBBY_CODE_LENGTH; i++) {
    const index = Math.floor(random() * LOBBY_ALPHABET.length);
    code += LOBBY_ALPHABET[index] ?? LOBBY_ALPHABET[0];
  }
  return code;
}

export function normalizeLobbyCode(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidLobbyCode(value: string): boolean {
  if (value.length !== LOBBY_CODE_LENGTH) return false;
  return [...value].every((char) => LOBBY_ALPHABET.includes(char));
}
