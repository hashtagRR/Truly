// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 hashtagRR

// Storage rules: saving is off by default, mood answers are never kept.

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  keys() { return [...this.map.keys()]; }
}

globalThis.localStorage = new MemoryStorage();
const store = await import("../docs/app/store.js");
const piece = { key: "satie-gymnopedie-1", title: "Gymnopedie No. 1", composer: "Erik Satie", performer: "Teknopazzo" };
const path = { id: "1", at: "2026-10-19T10:00:00Z", direction: "calmer", pieces: [piece], played: [piece.key] };

beforeEach(() => { globalThis.localStorage = new MemoryStorage(); });

test("saving is off by default and nothing is saved while it is off", () => {
  assert.equal(store.savingOn(), false);
  assert.equal(store.savePath(path), false);
  assert.equal(store.toggleFavourite(piece), null);
  assert.deepEqual(localStorage.keys(), []);
});

test("with saving on, played paths and favourites are kept", () => {
  store.setSaving(true);
  store.savePath(path);
  store.savePath({ ...path, played: [piece.key, "bach-air"] });
  assert.equal(store.loadPaths().length, 1, "the same path is updated, not duplicated");
  assert.equal(store.toggleFavourite(piece), true);
  assert.equal(store.isFavourite(piece.key), true);
  assert.equal(store.toggleFavourite(piece), false);
});

test("switching saving off keeps what is saved, and removing a favourite still works", () => {
  store.setSaving(true);
  store.toggleFavourite(piece);
  store.savePath(path);
  store.setSaving(false);
  assert.equal(store.loadPaths().length, 1);
  store.removeFavourite(piece.key);
  assert.equal(store.isFavourite(piece.key), false);
});

test("deleting removes everything, including mood answers from earlier versions", () => {
  localStorage.setItem("truly.checkins.v1", JSON.stringify([{ feeling: 2, energy: 3 }]));
  store.setSaving(true);
  store.savePath(path);
  store.clear();
  assert.deepEqual(localStorage.keys(), []);
});

test("legacy mood answers are removed on start", () => {
  localStorage.setItem("truly.checkins.v1", JSON.stringify([{ feeling: 2, energy: 3 }]));
  localStorage.setItem("truly.keep-history.v1", "off");
  store.removeLegacy();
  assert.deepEqual(localStorage.keys(), []);
});
