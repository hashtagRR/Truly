// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 hashtagRR

// Checks that the shipped ONNX models keep the inputs and outputs the app
// relies on. Run with: node --test tests/

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as ort from "../docs/app/vendor/ort/ort.wasm.min.mjs";

const app = (path) => new URL(`../docs/app/${path}`, import.meta.url);
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmBinary = readFileSync(app("vendor/ort/ort-wasm-simd-threaded.wasm"));
ort.env.logLevel = "error";

async function check(file, input, shape, outputs) {
  const session = await ort.InferenceSession.create(readFileSync(app(`models/${file}`)));
  assert.deepEqual(session.inputNames, [input]);
  const out = await session.run({ [input]: new ort.Tensor("float32", new Float32Array(shape.reduce((a, b) => a * b)), shape) });
  for (const [name, dims] of Object.entries(outputs)) {
    assert.deepEqual(out[name].dims, dims, name);
    assert.ok(Array.from(out[name].data).every(Number.isFinite), name);
  }
}

test("face detector: one 320 by 240 image in, scores and boxes out", () =>
  check("ultraface-rfb-320.onnx", "input", [1, 3, 240, 320], { scores: [1, 4420, 2], boxes: [1, 4420, 4] }));

test("face model: one 224 pixel face in, 40 category scores out", () =>
  check("truly-face-v1.onnx", "image", [1, 3, 224, 224], { scores: [1, 40] }));

test("voice model: five seconds of 16 kHz audio in, valence and arousal out", () =>
  check("truly-voice-v1.onnx", "audio", [1, 80000], { scores: [1, 2] }));
