// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 hashtagRR

// Turns face model output into expression classes. Pure functions, no browser APIs.

export const BRIGHT = ["happy", "surprise"];
export const HEAVY = ["angry", "disgust", "fear", "sad"];

// Model output (standardised) to the seven class scores, before offsets.
export function classScores(output, readout) {
  const raw = Array.from(output, (v, i) => v * readout.target_std[i] + readout.target_mean[i]);
  const scores = readout.groups.map((idx) =>
    idx.length ? idx.reduce((sum, i) => sum + raw[i], 0) / idx.length : null);
  const neutral = readout.fer7.indexOf("neutral");
  const emotional = scores.filter((s) => s !== null);
  scores[neutral] = -Math.max(...emotional);
  return scores;
}

export function meanScores(list) {
  return list[0].map((_, k) => list.reduce((sum, s) => sum + s[k], 0) / list.length);
}

// Highest class after the calibration offsets.
export function topClass(scores, readout) {
  let best = 0;
  scores.forEach((s, k) => {
    if (s + readout.offsets[k] > scores[best] + readout.offsets[best]) best = k;
  });
  return readout.fer7[best];
}

export function tone(cls) {
  if (BRIGHT.includes(cls)) return "bright";
  if (HEAVY.includes(cls)) return "heavy";
  return "calm";
}
