/** True when a key event's target is something the user types into, so global
 *  keyboard shortcuts (space = pause, arrows = skip) must not fire. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.contentEditable === 'true') return true;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
}
