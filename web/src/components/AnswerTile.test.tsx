import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AnswerTile from './AnswerTile.js';

describe('AnswerTile', () => {
  test('renders the choice text', () => {
    render(<AnswerTile choiceIndex={0} text="Mitochondria" isCorrect={null} isSelected={false} onSelect={() => {}} />);
    expect(screen.getByText('Mitochondria')).toBeInTheDocument();
  });

  test('calls onSelect with its own choiceIndex when clicked', async () => {
    const onSelect = vi.fn();
    render(<AnswerTile choiceIndex={2} text="Nucleus" isCorrect={null} isSelected={false} onSelect={onSelect} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  test('shows a correct-answer state distinctly when isCorrect is true', () => {
    render(<AnswerTile choiceIndex={0} text="Right" isCorrect={true} isSelected={false} onSelect={() => {}} />);
    expect(screen.getByRole('button')).toHaveAttribute('data-correct', 'true');
  });

  test('shows an incorrect-selected state distinctly when isCorrect is false and isSelected is true', () => {
    render(<AnswerTile choiceIndex={1} text="Wrong" isCorrect={false} isSelected={true} onSelect={() => {}} />);
    expect(screen.getByRole('button')).toHaveAttribute('data-wrong-selection', 'true');
  });

  test('is disabled when the disabled prop is true, and clicking it does not call onSelect', async () => {
    const onSelect = vi.fn();
    render(<AnswerTile choiceIndex={0} text="Right" isCorrect={null} isSelected={false} onSelect={onSelect} disabled />);
    const user = userEvent.setup();

    expect(screen.getByRole('button')).toBeDisabled();
    await user.click(screen.getByRole('button'));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
