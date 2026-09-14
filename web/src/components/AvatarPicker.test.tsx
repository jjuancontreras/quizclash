import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AvatarPicker from './AvatarPicker.js';

describe('AvatarPicker', () => {
  test('renders 12 avatar options', () => {
    render(<AvatarPicker value="seed-1" onChange={() => {}} />);
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(12);
  });

  test('every avatar image points at the DiceBear HTTP API with a distinct seed', () => {
    render(<AvatarPicker value="seed-1" onChange={() => {}} />);
    const sources = screen.getAllByRole('img').map((img) => img.getAttribute('src'));
    for (const src of sources) {
      expect(src).toMatch(/^https:\/\/api\.dicebear\.com\/10\.x\/[a-z-]+\/svg\?seed=/);
    }
    expect(new Set(sources).size).toBe(12);
  });

  test('calls onChange with the seed of the clicked avatar', async () => {
    const onChange = vi.fn();
    render(<AvatarPicker value="seed-1" onChange={onChange} />);
    const user = userEvent.setup();

    const images = screen.getAllByRole('img');
    const targetSeed = new URL(images[3]!.getAttribute('src')!).searchParams.get('seed');
    await user.click(images[3]!);

    expect(onChange).toHaveBeenCalledWith(targetSeed);
  });

  test('marks the currently selected avatar distinctly from the others', () => {
    const { rerender } = render(<AvatarPicker value="" onChange={() => {}} />);
    const firstSeed = new URL(screen.getAllByRole('img')[0]!.getAttribute('src')!).searchParams.get('seed')!;

    rerender(<AvatarPicker value={firstSeed} onChange={() => {}} />);
    const selected = screen.getByRole('img', { name: /selected/i });
    expect(selected).toBeInTheDocument();
  });
});
