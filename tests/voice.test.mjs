// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 hashtagRR

// Loudness step for the voice input. Run with: node --test tests/

import assert from "node:assert/strict";
import { test } from "node:test";
import { fromScores, normalise } from "../docs/app/voice.js";

const SAMPLES = 5 * 16000;

function tone(amplitude, length = SAMPLES) {
  return new Float32Array(length).map((_, i) => amplitude * Math.sin(i / 7));
}

function rms(x) {
  return Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length);
}

test("quiet and loud sound reach the same speech level", () => {
  const quiet = normalise(tone(0.01));
  const loud = normalise(tone(0.5));
  assert.ok(Math.abs(rms(quiet) - 0.05) < 0.002);
  assert.ok(Math.abs(rms(loud) - 0.05) < 0.002);
});

test("near silence is not read", () => {
  assert.equal(normalise(new Float32Array(SAMPLES)), null);
  assert.equal(normalise(tone(0.001)), null);
});

test("the output never clips and always has five seconds", () => {
  const clicks = new Float32Array(SAMPLES);
  clicks[100] = 1;
  clicks.set(tone(0.004, 4000), 20000);
  const out = normalise(clicks);
  assert.equal(out.length, SAMPLES);
  assert.ok(Math.max(...out.map(Math.abs)) <= 0.99 + 1e-6);
  assert.equal(normalise(tone(0.2, 16000)).length, SAMPLES);
});

test("model output is read relative to everyday speech", () => {
  const settings = { target_mean: [0.3, 1.2], target_std: [0.5, 0.6], reference: [0.1, 1.2] };
  const everyday = fromScores([(0.1 - 0.3) / 0.5, 0], settings);
  assert.ok(Math.abs(everyday.valence) < 1e-9 && Math.abs(everyday.arousal) < 1e-9);
  const lively = fromScores([0, 1], settings);
  assert.ok(Math.abs(lively.arousal - 1) < 1e-9);
});
