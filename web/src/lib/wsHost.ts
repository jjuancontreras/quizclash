/**
 * The realtime server host, read once at module load. Both App.tsx and
 * useGameConnection.ts need it, and both must fail loudly — not silently
 * connect to `wss://undefined/ws` — if a production build was run without
 * `VITE_WS_HOST` set (see web/.env.production).
 */
const rawHost = import.meta.env.VITE_WS_HOST as string | undefined;

if (rawHost === undefined || rawHost === '') {
  throw new Error('VITE_WS_HOST is not set — see web/.env.production');
}

export const WS_HOST: string = rawHost;
