import { describe, expect, it } from 'vitest';
import { isTypingTarget } from './dom';

describe('isTypingTarget', () => {
  it('is true for text inputs, textareas and selects', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTypingTarget(document.createElement('select'))).toBe(true);
  });

  it('is true for contenteditable elements', () => {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    document.body.appendChild(div);
    expect(isTypingTarget(div)).toBe(true);
    div.remove();
  });

  it('is false for buttons, plain elements and non-elements', () => {
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
    expect(isTypingTarget(document.createElement('div'))).toBe(false);
    expect(isTypingTarget(document.body)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(window)).toBe(false);
  });
});
