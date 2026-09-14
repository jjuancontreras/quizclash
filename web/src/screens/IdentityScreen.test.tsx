import { describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IdentityScreen from './IdentityScreen.js';

describe('IdentityScreen', () => {
  test('name input is capped at 16 characters', async () => {
    render(<IdentityScreen onJoin={() => {}} />);
    const user = userEvent.setup();
    const nameInput = screen.getByLabelText(/name/i);

    await user.type(nameInput, 'a'.repeat(30));
    expect((nameInput as HTMLInputElement).value).toHaveLength(16);
  });

  test('calls onJoin with the typed code when "Join" is submitted', async () => {
    const onJoin = vi.fn();
    render(<IdentityScreen onJoin={onJoin} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/name/i), 'Juan');
    await user.click(screen.getAllByRole('img')[0]!); // pick the first avatar
    await user.type(screen.getByLabelText(/lobby code/i), 'abcd');
    await user.click(screen.getByRole('button', { name: /join/i }));

    expect(onJoin).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ABCD', name: 'Juan' }),
    );
  });

  test('the Join button is disabled until a name and a code are both present', () => {
    render(<IdentityScreen onJoin={() => {}} />);
    expect(screen.getByRole('button', { name: /join/i })).toBeDisabled();
  });

  test('Join stays disabled with only a name entered, no code', async () => {
    render(<IdentityScreen onJoin={() => {}} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/name/i), 'Juan');
    expect(screen.getByRole('button', { name: /join/i })).toBeDisabled();
  });

  test('Join stays disabled with only a code entered, no name', async () => {
    render(<IdentityScreen onJoin={() => {}} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/lobby code/i), 'ABCD');
    expect(screen.getByRole('button', { name: /join/i })).toBeDisabled();
  });

  test('calls onJoin with an empty code when "Create Lobby" is clicked, signalling a fresh lobby', async () => {
    const onJoin = vi.fn();
    render(<IdentityScreen onJoin={onJoin} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/name/i), 'Juan');
    await user.click(screen.getAllByRole('img')[2]!);
    await user.click(screen.getByRole('button', { name: /create lobby/i }));

    expect(onJoin).toHaveBeenCalledWith(expect.objectContaining({ code: '' }));
  });
});
