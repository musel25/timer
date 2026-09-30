import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Stepper } from './Stepper';

function Harness({ onChange }: { onChange: (v: number) => void }) {
  const [v, setV] = useState(20);
  return <Stepper label="Goal" value={v} onChange={(n) => { setV(n); onChange(n); }} min={1} max={600} suffix="min" presets={[15, 30]} />;
}

describe('Stepper', () => {
  it('lets you clear and retype a value without snapping to min mid-typing', () => {
    const change = vi.fn();
    render(<Harness onChange={change} />);
    const input = screen.getByLabelText('Goal') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.change(input, { target: { value: '75' } });
    expect(change).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(change).toHaveBeenLastCalledWith(75);
    fireEvent.change(input, { target: { value: '9999' } });
    fireEvent.blur(input);
    expect(change).toHaveBeenLastCalledWith(600);
  });

  it('sets a preset in one tap and repeats while + is held', () => {
    vi.useFakeTimers();
    const change = vi.fn();
    render(<Harness onChange={change} />);
    fireEvent.click(screen.getByRole('button', { name: '30m' }));
    expect(change).toHaveBeenLastCalledWith(30);
    const plus = screen.getByRole('button', { name: 'Increase Goal' });
    fireEvent.pointerDown(plus);
    act(() => { vi.advanceTimersByTime(1000); });
    fireEvent.pointerUp(plus);
    expect(change.mock.lastCall![0]).toBeGreaterThan(33);
    vi.useRealTimers();
  });
});
