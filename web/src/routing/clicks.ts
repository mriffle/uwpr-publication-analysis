/**
 * Whether a click on an in-app link is the app's to handle (docs/06 §3).
 *
 * Every in-app link is a real `<a href>`, so a reader can open it in a new tab, copy it or save
 * it. The app takes over only a plain left click; any modified click — Cmd or Ctrl for a new
 * tab, Shift for a new window, Alt to download — is left to the browser, which is the reason the
 * link has an `href` at all.
 */
export interface ClickLike {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export const isPlainLeftClick = (event: ClickLike): boolean =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
