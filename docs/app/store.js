// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 hashtagRR

// Listening history and favourites, kept only in this browser and only when
// the listener switches saving on. Mood answers are never saved.

const SAVING_KEY = "truly.saving.v1";
const PATHS_KEY = "truly.paths.v1";
const FAVOURITES_KEY = "truly.favourites.v1";
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

export function clear() {
  try {
    for (const key of [SAVING_KEY, PATHS_KEY, FAVOURITES_KEY, ...LEGACY_KEYS]) localStorage.removeItem(key);
  } catch {
    // Nothing stored, or storage blocked: nothing to remove.
  }
}

export function exportFile() {
  const data = { paths: loadPaths(), favourites: loadFavourites() };
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
