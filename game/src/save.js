// Saving and loading SOLMAR HEAT through localStorage.
// The shape itself lives in world.js (saveShape / loadShape); this file
// only talks to the browser's storage, and fails soft when it cannot.

import { saveShape, loadShape } from './world.js';

const SAVE_KEY = 'solmar-heat-save-v1';

/** Write the world to localStorage. Returns true when it stuck. */
export function saveGame(world) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(saveShape(world)));
    return true;
  } catch {
    return false;
  }
}

/** Read the world back from localStorage, or null when there is none. */
export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return loadShape(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Is there a save to continue from? */
export function hasSave() {
  try {
    return window.localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

/** Forget the save (used after the story ends, for a fresh run). */
export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage is best-effort; a missing save is the same as a cleared one.
  }
}
