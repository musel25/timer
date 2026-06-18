import { describe, expect, it } from 'vitest';
import { scaledDimensions } from './imageResize';

describe('scaledDimensions', () => {
  it('does not upscale images smaller than the cap', () => {
    expect(scaledDimensions(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it('scales a wide image down to the cap on its longest edge', () => {
    expect(scaledDimensions(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 });
  });

  it('scales a tall image down to the cap on its longest edge', () => {
    expect(scaledDimensions(1000, 4000, 1600)).toEqual({ width: 400, height: 1600 });
  });

  it('rounds to integer pixels', () => {
    const d = scaledDimensions(1000, 333, 500);
    expect(Number.isInteger(d.width)).toBe(true);
    expect(Number.isInteger(d.height)).toBe(true);
    expect(d.width).toBe(500);
  });
});
