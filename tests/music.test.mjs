// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 hashtagRR

// Music path tests. Run with: node --test tests/
// tests/fixtures/tracks.json is a copy of tracks.json from the Truly-music
// repository (valence, arousal and tempo from MCUD 1.0, CC BY 4.0).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildPath, cost, defaultDirection, explain, goalPoint, INSTRUMENTS, listeningLean, loadCatalogue, makeCatalogue, pathQuality, preferences, nudgeStart, nudgeVoice, pathPoints, replaceSong, startPoint,
} from "../docs/app/music.js";

const catalogue = makeCatalogue(
  JSON.parse(readFileSync(new URL("./fixtures/tracks.json", import.meta.url))),
  "https://example.org/",
);
const { stats } = catalogue;
const DIRECTIONS = ["calmer", "brighter", "steady"];

function seeded(seed) {
  let x = seed;
  return () => (x = (x * 16807) % 2147483647) / 2147483647;
}

function heading(points) {
  const a = points[0];
  const b = points[points.length - 1];
  const v = (b.v - a.v) / stats.sdV;
  const r = (b.a - a.a) / stats.sdA;
  const n = Math.hypot(v, r);
  return n > 1e-6 ? { v: v / n, a: r / n } : null;
}

function assertForward(path, points, context) {
  const h = heading(points);
  if (!h) return;
  const pos = path.map((s) => (s.valence / stats.sdV) * h.v + (s.arousal / stats.sdA) * h.a);
  for (let i = 1; i < pos.length; i++) {
    assert.ok(pos[i] >= pos[i - 1] - 1e-9, `backward step at ${i} (${context})`);
  }
}

function cases() {
  const out = [];
  for (let f = 1; f <= 5; f++) for (let e = 1; e <= 5; e++) for (const dir of DIRECTIONS) out.push({ f, e, dir });
  return out;
}

function plan({ f, e, dir }, steps) {
  const start = startPoint(f, e, stats);
  return pathPoints(start, goalPoint(start, dir, stats), steps);
}

test("new paths have the right length, no repeated performer, and only move forward", () => {
  const rng = seeded(1);
  for (const c of cases()) {
    for (const steps of [6, 9]) {
      const points = plan(c, steps);
      const path = buildPath(catalogue, points, { rng });
      assert.equal(path.length, steps);
      assert.equal(new Set(path.map((s) => s.artist)).size, steps);
      assertForward(path, points, JSON.stringify({ ...c, steps }));
    }
  }
});

test("slowing down keeps the first piece and still only moves forward", () => {
  const rng = seeded(2);
  for (const c of cases()) {
    const first = buildPath(catalogue, plan(c, 6), { rng });
    const points = plan(c, 9);
    const slower = buildPath(catalogue, points, { rng, keep: first.slice(0, 1) });
    assert.ok(slower.some((s) => s.id === first[0].id), "first piece kept");
    assertForward(slower, points, JSON.stringify(c));
  }
});

test("swapping any piece changes it and keeps the path moving forward", () => {
  const rng = seeded(3);
  for (const c of cases()) {
    const points = plan(c, 6);
    let path = buildPath(catalogue, points, { rng });
    const skipped = new Set();
    for (let i = 0; i < path.length; i++) {
      skipped.add(path[i].id);
      const before = new Set(path.map((s) => s.id));
      path = replaceSong(catalogue, path, points, i, skipped, rng);
      assert.ok(path.some((s) => !before.has(s.id)), "a new piece was chosen");
      assert.equal(new Set(path.map((s) => s.artist)).size, path.length);
      assertForward(path, points, JSON.stringify({ ...c, swap: i }));
    }
  }
});

test("the camera nudge moves only the starting mood, by a small amount", () => {
  const start = startPoint(2, 2, stats);
  const bright = nudgeStart(start, "bright", stats);
  const heavy = nudgeStart(start, "heavy", stats);
  assert.ok(bright.v > start.v && heavy.v < start.v);
  assert.equal(bright.a, start.a);
  assert.ok(Math.abs(bright.v - start.v) <= 0.5 * stats.sdV);
  assert.deepEqual(nudgeStart(start, null, stats), start);
});

test("the voice nudge mostly follows energy and stays small", () => {
  const start = startPoint(3, 3, stats);
  const lively = nudgeVoice(start, { valence: 0, arousal: 1.5 }, stats);
  const calm = nudgeVoice(start, { valence: 0, arousal: -1.5 }, stats);
  assert.ok(lively.a > start.a && calm.a < start.a);
  assert.equal(lively.v, start.v);
  const extreme = nudgeVoice(start, { valence: 9, arousal: 9 }, stats);
  assert.ok(extreme.a - start.a <= 0.4 * stats.sdA + 1e-9);
  assert.ok(extreme.v - start.v <= 0.12 * stats.sdV + 1e-9);
  assert.ok((extreme.v - start.v) / stats.sdV < (extreme.a - start.a) / stats.sdA);
  assert.deepEqual(nudgeVoice(start, null, stats), start);
});

test("every piece has an explanation and directions follow the answers", () => {
  const points = plan({ f: 1, e: 1, dir: "brighter" }, 6);
  const path = buildPath(catalogue, points, { rng: seeded(4) });
  assert.match(explain(path, 0, stats, "brighter"), /mood and energy you described/);
  for (let i = 1; i < path.length; i++) assert.ok(explain(path, i, stats, "brighter").length > 10);
  assert.equal(defaultDirection(1, 5), "calmer");
  assert.equal(defaultDirection(2, 2), "brighter");
  assert.equal(defaultDirection(4, 3), "steady");
});

test("the music list is fetched again after a failed or slow request", async () => {
  const data = JSON.parse(readFileSync(new URL("./fixtures/tracks.json", import.meta.url)));
  let calls = 0;
  const flaky = async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("network down");
    if (calls === 2) return { ok: false, status: 503 };
    return { ok: true, json: async () => data };
  };
  const loaded = await loadCatalogue("https://example.org/", { fetcher: flaky, wait: 1 });
  assert.equal(calls, 3);
  assert.equal(loaded.songs.length, catalogue.songs.length);
  const down = async () => { throw new TypeError("network down"); };
  await assert.rejects(loadCatalogue("https://example.org/", { fetcher: down, wait: 1, attempts: 2 }));
});

test("preferences shift the choice, and pieces ruled out never appear", () => {
  const points = plan({ f: 3, e: 3, dir: "steady" }, 4);
  const count = (prefs, match) => {
    let n = 0;
    for (let seed = 1; seed <= 40; seed++) {
      n += buildPath(catalogue, points, { rng: seeded(seed), prefs }).filter(match).length;
    }
    return n;
  };
  const piano = (s) => s.instruments.includes("piano");
  assert.ok(count(preferences({ instruments: ["piano"] }), piano) > count(preferences(), piano));
  const fav = catalogue.songs.find((s) => s.instruments.includes("winds")).key;
  assert.ok(count(preferences({ favourites: [fav] }), (s) => s.key === fav) >= count(preferences(), (s) => s.key === fav));
  const ruled = catalogue.songs.slice(0, 6).map((s) => s.key);
  for (const dir of DIRECTIONS) {
    for (let seed = 1; seed <= 10; seed++) {
      const path = buildPath(catalogue, plan({ f: 2, e: 4, dir }, 6), { rng: seeded(seed), prefs: preferences({ ruledOut: ruled }) });
      assert.ok(path.every((s) => !ruled.includes(s.key)));
      const swapped = replaceSong(catalogue, path, plan({ f: 2, e: 4, dir }, 6), 0, new Set(), seeded(seed), preferences({ ruledOut: ruled }));
      assert.ok(swapped.every((s) => !ruled.includes(s.key)));
    }
  }
});

test("explanations mention a matching instrument or a favourite", () => {
  const path = buildPath(catalogue, plan({ f: 3, e: 2, dir: "calmer" }, 4), { rng: seeded(2) });
  const first = path[0];
  assert.match(explain(path, 0, stats, "calmer", preferences({ favourites: [first.key] })), /One of your favourites/);
  const ins = first.instruments[0];
  assert.match(explain(path, 0, stats, "calmer", preferences({ instruments: [ins] })), /as you asked/);
  assert.doesNotMatch(explain(path, 0, stats, "calmer"), /as you asked|favourites/);
});

test("every recording has at least one known instrument", () => {
  for (const s of catalogue.songs) {
    assert.ok(s.instruments.length > 0, s.key);
    assert.ok(s.instruments.every((i) => INSTRUMENTS.includes(i)), s.key);
  }
});

test("path quality measures step sizes and tempo changes", () => {
  const unit = { sdV: 1, sdA: 1 };
  const even = [0, 1, 2, 3].map((x) => ({ valence: x, arousal: 0, bpm: 60 + x * 10 }));
  const q = pathQuality(even, unit);
  assert.deepEqual(q.steps, [1, 1, 1]);
  assert.equal(q.stepVariation, 0);
  assert.equal(q.largestTempoChange, 10);
  const uneven = pathQuality([{ valence: 0, arousal: 0 }, { valence: 0, arousal: 3 }, { valence: 4, arousal: 3 }], unit);
  assert.equal(uneven.largestStep, 4);
  assert.ok(Math.abs(uneven.stepVariation - 1 / 7) < 1e-9);
  assert.equal(pathQuality([even[0]], unit).largestStep, 0);
});

test("paths stay within today's measured step and tempo limits", () => {
  // Guard rails from measuring every answer, direction and length with the
  // current collection; a change that makes paths jumpier fails here.
  let worst = { step: 0, tempo: 0, average: 0 };
  for (const steps of [4, 6, 9]) {
    for (const c of cases()) {
      const q = pathQuality(buildPath(catalogue, plan(c, steps), { rng: seeded(c.f * 10 + c.e) }), stats);
      worst = { step: Math.max(worst.step, q.largestStep), tempo: Math.max(worst.tempo, q.largestTempoChange), average: Math.max(worst.average, q.averageStep) };
    }
  }
  assert.ok(worst.step <= 2.2, `largest step ${worst.step}`);
  assert.ok(worst.average <= 1.2, `average step ${worst.average}`);
  assert.ok(worst.tempo <= 45, `tempo change ${worst.tempo}`);
});

test("listening history shifts the choice a little and explains itself", () => {
  assert.equal(listeningLean(undefined), 0);
  assert.equal(listeningLean({ full: 9, early: 0 }), 1);
  assert.equal(listeningLean({ full: 0, early: 9 }), -1);
  const point = { v: catalogue.songs[0].valence, a: catalogue.songs[0].arousal };
  const s = catalogue.songs[0];
  const plain = cost(s, point, null, null, stats).total;
  const liked = cost(s, point, null, null, stats, preferences({ listening: { [s.key]: { full: 5, early: 0 } } })).total;
  const left = cost(s, point, null, null, stats, preferences({ listening: { [s.key]: { full: 0, early: 5 } } })).total;
  assert.ok(Math.abs(plain - liked - 0.24) < 1e-9 && Math.abs(left - plain - 0.24) < 1e-9);
  const path = buildPath(catalogue, plan({ f: 3, e: 3, dir: "steady" }, 4), { rng: seeded(3) });
  const often = preferences({ listening: { [path[0].key]: { full: 3, early: 0 } } });
  assert.match(explain(path, 0, stats, "steady", often), /You often listen to this one to the end/);
  const rarely = preferences({ listening: { [path[0].key]: { full: 0, early: 3 } } });
  assert.doesNotMatch(explain(path, 0, stats, "steady", rarely), /often|early|skip/);
});
