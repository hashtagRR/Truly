// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 hashtagRR

// Optional voice input. Five seconds of sound are recorded into memory, scored
// on this device and discarded. Nothing is transcribed, stored or sent.

import * as ort from "./vendor/ort/ort.wasm.min.mjs";

ort.env.wasm.wasmPaths = new URL("./vendor/ort/", import.meta.url).href;
ort.env.wasm.numThreads = 1;
ort.env.logLevel = "error";

const SR = 16000;
const SECONDS = 5;
const TARGET_RMS = 0.05;

let session = null;
let readout = null;

export async function loadModel() {
  if (!session) {
    const [model, settings] = await Promise.all([
      ort.InferenceSession.create(new URL("./models/truly-voice-v1.onnx", import.meta.url).href),
      fetch(new URL("./models/truly-voice-v1-readout.json", import.meta.url)).then((r) => r.json()),
    ]);
    session = model;
    readout = settings;
  }
  return session;
}

// Turns model output into { valence, arousal } in standard deviations from
// everyday speech, so 0 means "about as lively as ordinary talking".
export function fromScores(scores, settings) {
  const [valence, arousal] = [0, 1].map(
    (k) => (scores[k] * settings.target_std[k] + settings.target_mean[k] - settings.reference[k]) / settings.target_std[k],
  );
  return { valence, arousal };
}

// Records SECONDS of microphone audio and returns it at the device sample rate.
export async function record(signal) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: false, autoGainControl: false },
    video: false,
  });
  const ctx = new AudioContext();
  try {
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    const needed = Math.ceil(ctx.sampleRate * SECONDS);
    let collected = 0;
    await new Promise((resolve, reject) => {
      processor.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0);
        chunks.push(new Float32Array(data));
        collected += data.length;
        if (collected >= needed) resolve();
      };
      signal?.addEventListener("abort", () => reject(new DOMException("Stopped", "AbortError")));
      source.connect(processor);
      processor.connect(ctx.destination);
    });
    processor.disconnect();
    source.disconnect();
    const audio = new Float32Array(collected);
    let at = 0;
    for (const c of chunks) {
      audio.set(c, at);
      at += c.length;
    }
    return { audio, rate: ctx.sampleRate };
  } finally {
    stream.getTracks().forEach((t) => t.stop());
    ctx.close();
  }
}

export async function resample(audio, rate) {
  if (rate === SR) return audio.slice(0, SR * SECONDS);
  const offline = new OfflineAudioContext(1, SR * SECONDS, SR);
  const buffer = offline.createBuffer(1, audio.length, rate);
  buffer.copyToChannel(audio, 0);
  const src = offline.createBufferSource();
  src.buffer = buffer;
  src.connect(offline.destination);
  src.start();
  return (await offline.startRendering()).getChannelData(0).slice();
}

// Same loudness step as training: the sounding parts are brought to TARGET_RMS
// without clipping. Returns null when there is too little sound.
export function normalise(audio) {
  const frame = 400;
  const rms = [];
  for (let i = 0; i + frame <= audio.length; i += frame) {
    let s = 0;
    for (let j = i; j < i + frame; j++) s += audio[j] * audio[j];
    rms.push(Math.sqrt(s / frame));
  }
  const top = Math.max(...rms);
  const loud = rms.filter((r) => r > Math.max(1e-4, top * 0.1));
  if (!loud.length || top < 0.002) return null;
  let gain = TARGET_RMS / Math.sqrt(loud.reduce((a, r) => a + r * r, 0) / loud.length);
  let peak = 0;
  for (const v of audio) peak = Math.max(peak, Math.abs(v));
  if (peak * gain > 0.99) gain *= 0.99 / (peak * gain);
  const out = new Float32Array(SR * SECONDS);
  for (let i = 0; i < Math.min(audio.length, out.length); i++) out[i] = audio[i] * gain;
  return out;
}

// Returns { valence, arousal } relative to everyday speech, or null when there
// was too little sound to read.
export async function readVoice(signal) {
  const model = await loadModel();
  const { audio, rate } = await record(signal);
  const ready = normalise(await resample(audio, rate));
  audio.fill(0);
  if (!ready) return null;
  const out = await model.run({ audio: new ort.Tensor("float32", ready, [1, SR * SECONDS]) });
  ready.fill(0);
  return fromScores(out.scores.data, readout);
}
