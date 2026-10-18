// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 hashtagRR

// Optional camera check. Frames are read from the video element into memory,
// scored on this device, and never stored or sent anywhere.

import * as ort from "./vendor/ort/ort.wasm.min.mjs";
import { classScores, meanScores, topClass, tone } from "./readout.js";

ort.env.wasm.wasmPaths = new URL("./vendor/ort/", import.meta.url).href;
ort.env.wasm.numThreads = 1;
ort.env.logLevel = "error";

const DETECT_W = 320;
const DETECT_H = 240;
const FACE_SIZE = 224;
const MIN_FACE_SCORE = 0.7;
const MARGIN = 0.25;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let models = null;

export async function loadModels() {
  if (models) return models;
  const base = new URL("./models/", import.meta.url).href;
  const [detector, expression, readout] = await Promise.all([
    ort.InferenceSession.create(base + "ultraface-rfb-320.onnx"),
    ort.InferenceSession.create(base + "truly-face-v1.onnx"),
    fetch(base + "truly-face-v1-readout.json").then((r) => r.json()),
  ]);
  models = { detector, expression, readout };
  return models;
}

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function toTensor(ctx, w, h, mean, std, scale) {
  const { data } = ctx.getImageData(0, 0, w, h);
  const out = new Float32Array(3 * w * h);
  for (let i = 0; i < w * h; i++) {
    for (let c = 0; c < 3; c++) {
      out[c * w * h + i] = (data[i * 4 + c] / scale - mean[c]) / std[c];
    }
  }
  return new ort.Tensor("float32", out, [1, 3, h, w]);
}

async function findFace(video, detector) {
  const ctx = canvas(DETECT_W, DETECT_H).getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, DETECT_W, DETECT_H);
  const input = toTensor(ctx, DETECT_W, DETECT_H, [127, 127, 127], [128, 128, 128], 1);
  const { scores, boxes } = await detector.run({ input });
  let best = -1;
  let bestScore = MIN_FACE_SCORE;
  for (let i = 0; i < scores.dims[1]; i++) {
    const s = scores.data[i * 2 + 1];
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  if (best < 0) return null;
  const [x1, y1, x2, y2] = boxes.data.slice(best * 4, best * 4 + 4);
  return { x1, y1, x2, y2 };
}

function faceCrop(video, box) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const bw = (box.x2 - box.x1) * vw;
  const bh = (box.y2 - box.y1) * vh;
  const side = Math.max(bw, bh) * (1 + 2 * MARGIN);
  const cx = ((box.x1 + box.x2) / 2) * vw;
  const cy = ((box.y1 + box.y2) / 2) * vh;
  const c = canvas(FACE_SIZE, FACE_SIZE);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, cx - side / 2, cy - side / 2, side, side, 0, 0, FACE_SIZE, FACE_SIZE);
  return toTensor(ctx, FACE_SIZE, FACE_SIZE, MEAN, STD, 255);
}

export async function startCamera(video) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  return stream;
}

// Samples frames for a few seconds and returns the averaged reading,
// or null when no face was seen clearly enough.
export async function readExpression(video, { frames = 10, intervalMs = 400, signal } = {}) {
  const { detector, expression, readout } = await loadModels();
  const collected = [];
  for (let n = 0; n < frames * 3 && collected.length < frames; n++) {
    if (signal?.aborted) return null;
    const box = await findFace(video, detector);
    if (box) {
      const out = await expression.run({ image: faceCrop(video, box) });
      collected.push(classScores(out.scores.data, readout));
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  if (collected.length < 3) return null;
  const cls = topClass(meanScores(collected), readout);
  return { tone: tone(cls), frames: collected.length };
}
