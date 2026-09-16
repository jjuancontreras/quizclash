import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App.js';
import { useGameConnection } from './hooks/useGameConnection.js';

vi.mock('./hooks/useGameConnection.js');

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('shows IdentityScreen when there is no state yet', () => {
    vi.mocked(useGameConnection).mockReturnValue({
      state: null,
      connectionStatus: 'disconnected',
      rejection: null,
      join: vi.fn(),
      send: vi.fn(),
    });

    render(<App />);
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
  });

  test('renders LobbyScreen when phase is LOBBY', () => {
    vi.mocked(useGameConnection).mockReturnValue({
      state: {
        phase: 'LOBBY',
        lobbyCode: 'ABCD',
        hostId: 'p1',
        players: [{ id: 'p1', name: 'Juan', avatarSeed: 's1', score: 0, joinedAtMs: 0, connected: true }],
        questionIndex: 0,
        totalQuestions: 0,
        phaseEndsAtMs: null,
        prompt: null,
        answered: [],
        reveal: null,
        deltas: [],
        error: null,
      },
      connectionStatus: 'connected',
      rejection: null,
      join: vi.fn(),
      send: vi.fn(),
    });

    render(<App />);
    expect(screen.getByText('ABCD')).toBeInTheDocument();
  });

  test('calling join with an empty code fetches a fresh lobby code before connecting', async () => {
    const joinSpy = vi.fn();
    vi.mocked(useGameConnection).mockReturnValue({
      state: null,
      connectionStatus: 'disconnected',
      rejection: null,
      join: joinSpy,
      send: vi.fn(),
    });
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ code: 'NEWC' }) }) as unknown as typeof fetch;

    render(<App />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/name/i), 'Juan');
    await user.click(screen.getAllByRole('img')[0]!);
    await user.click(screen.getByRole('button', { name: /create lobby/i }));

    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/lobby'), expect.objectContaining({ method: 'POST' }));
    expect(joinSpy).toHaveBeenCalledWith(expect.objectContaining({ code: 'NEWC' }));
  });

  // Finding 1 (Plan B review): handleJoin is async but IdentityScreen's
  // onClick discards the returned promise, so a rejected fetch used to
  // become an unhandled rejection with zero user-visible feedback.
  test('a network failure while creating a lobby surfaces a user-visible error instead of failing silently', async () => {
    const joinSpy = vi.fn();
    vi.mocked(useGameConnection).mockReturnValue({
      state: null,
      connectionStatus: 'disconnected',
      rejection: null,
      join: joinSpy,
      send: vi.fn(),
    });
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    render(<App />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/name/i), 'Juan');
    await user.click(screen.getAllByRole('img')[0]!);
    await user.click(screen.getByRole('button', { name: /create lobby/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i);
    expect(joinSpy).not.toHaveBeenCalled();
  });

  test('a non-2xx response while creating a lobby surfaces a user-visible error instead of throwing inside .json()', async () => {
    const joinSpy = vi.fn();
    vi.mocked(useGameConnection).mockReturnValue({
      state: null,
      connectionStatus: 'disconnected',
      rejection: null,
      join: joinSpy,
      send: vi.fn(),
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.reject(new Error('should not be called')),
    }) as unknown as typeof fetch;

    render(<App />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/name/i), 'Juan');
    await user.click(screen.getAllByRole('img')[0]!);
    await user.click(screen.getByRole('button', { name: /create lobby/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not create a lobby/i);
    expect(joinSpy).not.toHaveBeenCalled();
  });
});
