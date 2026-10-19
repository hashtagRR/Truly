// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 hashtagRR

// Listening history, favourites and music preferences, kept only in this
// browser and only when the listener switches saving on. Mood answers are
// never saved.

const SAVING_KEY = "truly.saving.v1";
const PATHS_KEY = "truly.paths.v1";
const FAVOURITES_KEY = "truly.favourites.v1";
const PREFERENCES_KEY = "truly.preferences.v1";
const NOT_FOR_ME_KEY = "truly.not-for-me.v1";
const LISTENING_KEY = "truly.listening.v1";
const MAX_COUNT = 20;
const LEGACY_KEYS = ["truly.checkins.v1", "truly.keep-history.v1"];
const MAX_PATHS = 50;

function read(key, fallback) {
  try {
    const data = JSON.parse(localStorage.getItem(key) || "null");
    return data ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function savingOn() {
  return read(SAVING_KEY, false) === true;
}

// Switching saving off stops new saves; anything already saved stays until
// the listener deletes it.
export function setSaving(on) {
  if (on) write(SAVING_KEY, true);
  else {
    try {
      localStorage.removeItem(SAVING_KEY);
    } catch {
      // Storage blocked: nothing is saved either way.
    }
  }
}

// Earlier versions saved mood answers; Truly no longer keeps them.
export function removeLegacy() {
  try {
    for (const key of LEGACY_KEYS) localStorage.removeItem(key);
  } catch {
    // Storage blocked: nothing to remove.
  }
}

export function loadPaths() {
  const paths = read(PATHS_KEY, []);
  return Array.isArray(paths) ? paths : [];
}

// Adds or updates one played path, identified by its id.
export function savePath(record) {
  if (!savingOn()) return false;
  const paths = loadPaths().filter((p) => p.id !== record.id);
  paths.push(record);
  return write(PATHS_KEY, paths.slice(-MAX_PATHS));
}

export function loadFavourites() {
  const favourites = read(FAVOURITES_KEY, []);
  return Array.isArray(favourites) ? favourites : [];
}

export function isFavourite(key) {
  return loadFavourites().some((f) => f.key === key);
}

// Returns true when the piece is now a favourite, false when removed, and
// null when saving is off.
export function toggleFavourite(piece) {
  if (!savingOn()) return null;
  const favourites = loadFavourites();
  const exists = favourites.some((f) => f.key === piece.key);
  const next = exists ? favourites.filter((f) => f.key !== piece.key) : [...favourites, piece];
  write(FAVOURITES_KEY, next);
  return !exists;
}

// Removing is always allowed, even with saving off.
export function removeFavourite(key) {
  write(FAVOURITES_KEY, loadFavourites().filter((f) => f.key !== key));
}

// Instrument choices and path length. Saved only when saving is on.
export function loadPreferences() {
  const prefs = read(PREFERENCES_KEY, {});
  return prefs && typeof prefs === "object" && !Array.isArray(prefs) ? prefs : {};
}

export function savePreferences(prefs) {
  if (!savingOn()) return false;
  return write(PREFERENCES_KEY, { instruments: [...(prefs.instruments ?? [])], length: prefs.length });
}

export function loadNotForMe() {
  const pieces = read(NOT_FOR_ME_KEY, []);
  return Array.isArray(pieces) ? pieces : [];
}

// Remembers a piece the listener does not want suggested. Returns false when
// saving is off; the app then keeps it for this visit only.
export function addNotForMe(piece) {
  if (!savingOn()) return false;
  const pieces = loadNotForMe().filter((p) => p.key !== piece.key);
  return write(NOT_FOR_ME_KEY, [...pieces, piece]);
}

// Allowing a piece again is always possible, even with saving off.
export function removeNotForMe(key) {
  write(NOT_FOR_ME_KEY, loadNotForMe().filter((p) => p.key !== key));
}

// How often each piece was played to the end or left within its first
// seconds. Only counts per piece are kept: no times, moods or order.
export function loadListening() {
  const data = read(LISTENING_KEY, {});
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}

// kind is "full" or "early"; the title is kept so the list can be shown.
// Returns false when saving is off.
export function recordListen(key, kind, title = "") {
  if (!savingOn() || (kind !== "full" && kind !== "early")) return false;
  const data = loadListening();
  const counts = { full: 0, early: 0, ...data[key], title: title || data[key]?.title || key };
  counts[kind] = Math.min(MAX_COUNT, counts[kind] + 1);
  data[key] = counts;
  return write(LISTENING_KEY, data);
}

export function forgetListening() {
  try {
    localStorage.removeItem(LISTENING_KEY);
  } catch {
    // Storage blocked: nothing to remove.
  }
}

export function clear() {
  try {
    for (const key of [SAVING_KEY, PATHS_KEY, FAVOURITES_KEY, PREFERENCES_KEY, NOT_FOR_ME_KEY, LISTENING_KEY, ...LEGACY_KEYS]) localStorage.removeItem(key);
  } catch {
    // Nothing stored, or storage blocked: nothing to remove.
  }
}

export function exportFile() {
  const data = { paths: loadPaths(), favourites: loadFavourites(), notForMe: loadNotForMe(), preferences: loadPreferences(), listening: loadListening() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `truly-listening-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
