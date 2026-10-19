// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 hashtagRR

// Face readout tests. Run with: node --test tests/

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { classScores, meanScores, topClass, tone } from "../docs/app/readout.js";

const readout = JSON.parse(readFileSync(new URL("../docs/app/models/truly-face-v1-readout.json", import.meta.url)));
const mapping = JSON.parse(readFileSync(new URL("../mappings/emonet_categories.json", import.meta.url)));
const N = readout.categories.length;

// Model output that recovers the given raw category scores.
function output(raw) {
  return raw.map((v, i) => (v - readout.target_mean[i]) / readout.target_std[i]);
}

test("the readout groups follow the published category mapping", () => {
  assert.equal(N, 40);
  assert.equal(readout.target_mean.length, N);
  assert.equal(readout.target_std.length, N);
  assert.deepEqual(readout.fer7, mapping.fer7);
  readout.fer7.forEach((cls, k) => {
    const fromMapping = readout.categories
      .map((name, i) => (mapping.categories[mapping.aliases?.[name] ?? name]?.fer7 === cls ? i : -1))
      .filter((i) => i >= 0);
    assert.deepEqual([...readout.groups[k]].sort((a, b) => a - b), fromMapping, cls);
  });
  assert.equal(readout.offsets.length, 7);
});

test("one strong category decides the class, and neutral wins when nothing stands out", () => {
  const happy = readout.fer7.indexOf("happy");
  const raw = new Array(N).fill(0);
  for (const i of readout.groups[happy]) raw[i] = 6;
  assert.equal(topClass(classScores(output(raw), readout), readout), "happy");
  const flat = classScores(output(new Array(N).fill(-3)), readout);
  assert.equal(flat[readout.fer7.indexOf("neutral")], 3);
  assert.equal(topClass(flat, readout), "neutral");
});

test("scores from several frames are averaged before the class is chosen", () => {
  assert.deepEqual(meanScores([[1, 2, 3], [3, 4, 5]]), [2, 3, 4]);
});

test("classes map to the three tones used for the camera nudge", () => {
  assert.equal(tone("happy"), "bright");
  assert.equal(tone("surprise"), "bright");
  for (const c of ["angry", "disgust", "fear", "sad"]) assert.equal(tone(c), "heavy");
  assert.equal(tone("neutral"), "calm");
});
