import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App.js';
import type { GamePhase } from '../../src/shared/types.js';

describe('App', () => {
  test('imports the shared GamePhase type across the package boundary without error', () => {
    const phase: GamePhase = 'LOBBY';
    expect(phase).toBe('LOBBY');
  });

  test('renders without crashing', () => {
    render(<App />);
    expect(screen.getByText(/quizclash/i)).toBeInTheDocument();
  });
});
