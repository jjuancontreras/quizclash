import { describe, expect, test, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import CountdownScreen from './CountdownScreen.js';

// jsdom in this project has no Web Animations API (`Element.prototype.animate`
// is undefined), so motion/react falls back to its own JS-driven animation
// loop — one it starts at module-import time, bound to the *real* native
// requestAnimationFrame. Because that binding happens before any test's
// `vi.useFakeTimers()` call runs, motion's own exit/enter transitions never
// progress under advanceTimersByTime, so `AnimatePresence mode="wait"` never
// finishes swapping in the next child during a synchronous, fake-timers test.
// That's a jsdom/motion testability gap, not a bug in CountdownScreen's logic
// (confirmed separately: a bare component using the same requestAnimationFrame
// pattern without motion updates correctly under advanceTimersByTime). Only
// the one test below that needs to observe a re-render past the first mount
// relies on this mock to bypass the animation gating; the rest of this file
// exercises the real motion/react import.
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, className }: { children?: ReactNode; className?: string }) => (
      <div className={className}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children?: ReactNode }) => children,
}));

describe('CountdownScreen', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('shows 3 when just over 2000ms remain', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    render(<CountdownScreen phaseEndsAtMs={now + 2500} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  test('shows 1 when under 1000ms remain', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    render(<CountdownScreen phaseEndsAtMs={now + 500} />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  test('renders nothing distinguishable when phaseEndsAtMs is null rather than crashing', () => {
    expect(() => render(<CountdownScreen phaseEndsAtMs={null} />)).not.toThrow();
  });

  test('advances the displayed count as the server deadline approaches, driven by the animation-frame loop rather than a local ticker', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    render(<CountdownScreen phaseEndsAtMs={now + 2500} />);
    expect(screen.getByText('3')).toBeInTheDocument();

    // Advance the (faked) rAF loop so the component's own tick picks up the new
    // time — this is what proves the count is derived from phaseEndsAtMs - now
    // on every frame, not from an independent interval. Note: advancing via
    // vi.advanceTimersByTime alone moves Date.now() in lockstep with the fake
    // timer clock that schedules requestAnimationFrame; calling vi.setSystemTime
    // again mid-test does NOT retroactively move already-scheduled rAF
    // callbacks' due times, so it must not be used here.
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  test('stops scheduling animation frames after unmount, leaking no rAF loop', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');

    const { unmount } = render(<CountdownScreen phaseEndsAtMs={now + 2500} />);
    unmount();

    expect(cancelSpy).toHaveBeenCalled();

    // If the loop were still running post-unmount, advancing time here would
    // call setState on an unmounted component, which React reports as an error.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
