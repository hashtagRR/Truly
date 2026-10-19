// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 hashtagRR

// Interactive figures for the "Inside Truly" page. The path explorer and the
// cost chart call the app's own music.js; the spectrogram demo uses the
// loudness step from voice.js and rebuilds the voice model's log-mel front end.

import * as lib from "./app/music.js";
import { normalise } from "./app/voice.js";

const MUSIC_BASE = new URL("../Truly-music/", import.meta.url);
const NS = "http://www.w3.org/2000/svg";
const $ = (id) => document.getElementById(id);

function svg(w, h, label) {
  const el = document.createElementNS(NS, "svg");
  el.setAttribute("viewBox", `0 0 ${w} ${h}`);
  el.setAttribute("class", "chart");
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", label);
  return el;
}

function add(parent, tag, attrs = {}, text = "") {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text) el.textContent = text;
  parent.append(el);
  return el;
}

function seeded(seed) {
  let x = seed;
  return () => (x = (x * 16807) % 2147483647) / 2147483647;
}

// Path explorer

const state = { catalogue: null, seed: 7, path: [], points: [], built: [], step: 1 };

function settings() {
  const form = $("explorer-form");
  return {
    mood: Number(form.mood.value),
    energy: Number(form.energy.value),
    direction: form.direction.value,
    length: Number(form.length.value),
    instruments: [...form.querySelectorAll('input[name="instrument"]:checked')].map((c) => c.value),
  };
}

function buildScale(group, initial) {
  const box = document.querySelector(`[data-group="${group}"]`);
  for (let i = 1; i <= 5; i++) {
    const input = Object.assign(document.createElement("input"), { type: "radio", name: group, id: `x-${group}-${i}`, value: String(i), checked: i === initial });
    const label = Object.assign(document.createElement("label"), { htmlFor: input.id, textContent: String(i) });
    label.setAttribute("aria-label", `${group} ${i} of 5`);
    box.append(input, label);
  }
}

function renderExplorer() {
  const { catalogue } = state;
  if (!catalogue) return;
  const s = settings();
  const { stats } = catalogue;
  const prefs = lib.preferences({ instruments: s.instruments });
  const start = lib.startPoint(s.mood, s.energy, stats);
  const goal = lib.goalPoint(start, s.direction, stats);
  state.points = lib.pathPoints(start, goal, s.length);
  state.path = lib.buildPath(catalogue, state.points, { rng: seeded(state.seed), prefs });
  state.prefs = prefs;
  drawMap(start, goal);
  const list = $("x-list");
  list.replaceChildren();
  state.path.forEach((song, i) => {
    const li = document.createElement("li");
    li.append(
      Object.assign(document.createElement("span"), { className: "t", textContent: song.title }),
      Object.assign(document.createElement("span"), { className: "w", textContent: `${song.composer}. ${lib.explain(state.path, i, stats, s.direction, prefs)}` }),
    );
    list.append(li);
  });
  $("x-status").textContent = `${state.path.length} pieces, ${s.direction === "steady" ? "staying close to the start" : `moving ${s.direction === "calmer" ? "towards calmer" : "towards brighter"} music`}.`;
  state.step = Math.min(state.step, state.path.length - 1);
  renderSteps();
}

function drawMap(start, goal) {
  const { songs, stats } = state.catalogue;
  // Draw at roughly the size shown, so text stays readable on phones.
  const narrow = $("x-map").clientWidth < 480;
  const W = narrow ? 360 : 520, H = narrow ? 320 : 380, L = 40, R = 14, T = 14, B = 44;
  const vs = songs.map((s) => s.valence), as = songs.map((s) => s.arousal);
  const pad = (lo, hi) => [lo - (hi - lo) * 0.08, hi + (hi - lo) * 0.08];
  const [v0, v1] = pad(Math.min(...vs, start.v, goal.v), Math.max(...vs, start.v, goal.v));
  const [a0, a1] = pad(Math.min(...as, start.a, goal.a), Math.max(...as, start.a, goal.a));
  const x = (v) => L + ((v - v0) / (v1 - v0)) * (W - L - R);
  const y = (a) => H - B - ((a - a0) / (a1 - a0)) * (H - T - B);
  const chart = svg(W, H, `Map of ${songs.length} recordings by valence and arousal, with the planned points and the ${state.path.length} pieces of the path`);
  if (narrow) chart.classList.add("narrow");
  for (let i = 0; i <= 4; i++) {
    const gx = L + (i * (W - L - R)) / 4, gy = T + (i * (H - T - B)) / 4;
    add(chart, "line", { x1: gx, y1: T, x2: gx, y2: H - B, class: "gridline" });
    add(chart, "line", { x1: L, y1: gy, x2: W - R, y2: gy, class: "gridline" });
  }
  add(chart, "line", { x1: L, y1: H - B, x2: W - R, y2: H - B, class: "axis" });
  add(chart, "line", { x1: L, y1: T, x2: L, y2: H - B, class: "axis" });
  add(chart, "text", { x: (L + W - R) / 2, y: H - 12, "text-anchor": "middle", class: "strong" }, "Mood (valence) →");
  add(chart, "text", { x: 14, y: (T + H - B) / 2, "text-anchor": "middle", transform: `rotate(-90 14 ${(T + H - B) / 2})`, class: "strong" }, "Energy (arousal) →");
  add(chart, "text", { x: L, y: H - B + 18 }, "darker");
  add(chart, "text", { x: W - R, y: H - B + 18, "text-anchor": "end" }, "brighter");
  const inPath = new Set(state.path.map((s) => s.id));
  for (const s of songs) {
    if (inPath.has(s.id)) continue;
    const c = add(chart, "circle", { cx: x(s.valence), cy: y(s.arousal), r: 6, class: "piece" });
    add(c, "title", {}, `${s.title} (${s.instruments.join(", ")})`);
  }
  add(chart, "polyline", { points: state.points.map((p) => `${x(p.v)},${y(p.a)}`).join(" "), class: "line-plan" });
  for (const p of state.points) add(chart, "circle", { cx: x(p.v), cy: y(p.a), r: 4, class: "planned" });
  add(chart, "polyline", { points: state.path.map((s) => `${x(s.valence)},${y(s.arousal)}`).join(" "), class: "line-path" });
  state.path.forEach((s, i) => {
    const c = add(chart, "circle", { cx: x(s.valence), cy: y(s.arousal), r: 10, class: "piece in-path" });
    add(c, "title", {}, `${i + 1}. ${s.title}`);
    add(chart, "text", { x: x(s.valence), y: y(s.arousal) + 4, "text-anchor": "middle", class: "num" }, String(i + 1));
  });
  add(chart, "circle", { cx: x(start.v), cy: y(start.a), r: 15, class: "start" });
  $("x-map").replaceChildren(chart);
}

// Cost chart

function renderSteps() {
  const box = $("c-steps");
  box.replaceChildren();
  state.path.forEach((_, i) => {
    const b = Object.assign(document.createElement("button"), { type: "button", textContent: String(i + 1) });
    b.setAttribute("aria-pressed", String(i === state.step));
    b.setAttribute("aria-label", `Step ${i + 1}`);
    b.addEventListener("click", () => { state.step = i; renderSteps(); });
    box.append(b);
  });
  drawCosts();
}

function drawCosts() {
  const { catalogue, path, points, prefs, step } = state;
  if (!path.length) return;
  const { stats, songs } = catalogue;
  const heading = lib.headingOf(points, stats);
  const before = path.slice(0, step);
  const prev = before.at(-1) ?? null;
  const used = new Set(before.map((s) => s.id));
  const performers = new Set(before.map((s) => s.artist));
  const rows = songs
    .filter((s) => !used.has(s.id) && !performers.has(s.artist))
    .map((s) => ({ s, c: lib.cost(s, points[step], prev, heading, stats, prefs) }))
    .sort((a, b) => a.c.total - b.c.total);
  const top = rows.slice(0, 8);
  const inPath = rows.find((r) => r.s.id === path[step].id);
  if (inPath && !top.includes(inPath)) top.push(inPath);
  rows.length = 0;
  rows.push(...top);
  const PARTS = [["closeness", "var(--accent)"], ["step", "var(--sun)"], ["backward", "var(--plum)"], ["tempo", "var(--soft-ink)"], ["instrument", "var(--muted-bar)"]];
  const max = Math.max(...rows.map((r) => PARTS.reduce((a, [k]) => a + r.c[k], 0)), 0.5);
  const narrow = $("c-chart").clientWidth < 560;
  const W = narrow ? 380 : 640, ROW = 34, LABEL = narrow ? 150 : 250, H = rows.length * ROW + (narrow ? 48 : 30);
  const room = narrow ? 14 : 34;
  const chart = svg(W, H, `Cost of the ${rows.length} cheapest candidates at step ${step + 1}`);
  if (narrow) chart.classList.add("narrow");
  const scale = (W - LABEL - 60) / max;
  rows.forEach((r, i) => {
    const yy = 10 + i * ROW;
    const chosen = r.s.id === path[step].id;
    const name = r.s.title.length > room ? `${r.s.title.slice(0, room - 1)}…` : r.s.title;
    add(chart, "text", { x: 0, y: yy + 17, class: chosen ? "strong" : "" }, `${chosen ? "▶ " : ""}${name}`);
    let xx = LABEL;
    for (const [k, colour] of PARTS) {
      const w = r.c[k] * scale;
      if (w <= 0) continue;
      const rect = add(chart, "rect", { x: xx, y: yy + 4, width: Math.max(w, 1), height: 18, rx: 3, style: `fill: ${colour}` });
      add(rect, "title", {}, `${k}: ${r.c[k].toFixed(2)}`);
      xx += w;
    }
    add(chart, "text", { x: xx + 6, y: yy + 17, class: chosen ? "strong" : "" }, r.c.total.toFixed(2));
  });
  const note = step === 0 ? "Step 1 has no piece before it, so only closeness and preferences count." : "▶ marks the piece in the path.";
  add(chart, "text", { x: 0, y: H - 4 }, note);
  $("c-chart").replaceChildren(chart);
}

async function startExplorer() {
  buildScale("mood", 2);
  buildScale("energy", 4);
  document.getElementById(`x-dir-${lib.defaultDirection(2, 4)}`).checked = true;
  try {
    state.catalogue = await lib.loadCatalogue(MUSIC_BASE);
  } catch {
    $("x-status").textContent = "The music list could not be loaded, so the explorer is not available right now.";
    return;
  }
  $("explorer-form").addEventListener("change", (e) => {
    if (e.target.name === "mood" || e.target.name === "energy") {
      const s = settings();
      document.getElementById(`x-dir-${lib.defaultDirection(s.mood, s.energy)}`).checked = true;
    }
    renderExplorer();
  });
  $("x-shuffle").addEventListener("click", () => { state.seed = (state.seed * 31 + 11) % 2147483647; renderExplorer(); });
  renderExplorer();
  fillTracks();
}

// Spectrogram demo: the voice model's front end, rebuilt in the page.

const SR = 16000, N_FFT = 400, HOP = 160, N_MELS = 64, F_MIN = 50, F_MAX = 8000, SAMPLES = 5 * SR;

// Mel filter bank with the Slaney mel scale and area normalisation, matching
// librosa.filters.mel as used in training.
function melBank() {
  const fSp = 200 / 3, minLogHz = 1000, minLogMel = minLogHz / fSp, logStep = Math.log(6.4) / 27;
  const toMel = (f) => (f < minLogHz ? f / fSp : minLogMel + Math.log(f / minLogHz) / logStep);
  const toHz = (m) => (m < minLogMel ? m * fSp : minLogHz * Math.exp(logStep * (m - minLogMel)));
  const bins = N_FFT / 2 + 1;
  const lo = toMel(F_MIN), hi = toMel(F_MAX);
  const edges = Array.from({ length: N_MELS + 2 }, (_, i) => toHz(lo + ((hi - lo) * i) / (N_MELS + 1)));
  const bank = [];
  for (let m = 0; m < N_MELS; m++) {
    const row = new Float32Array(bins);
    const norm = 2 / (edges[m + 2] - edges[m]);
    for (let k = 0; k < bins; k++) {
      const f = (k * SR) / N_FFT;
      const up = (f - edges[m]) / (edges[m + 1] - edges[m]);
      const down = (edges[m + 2] - f) / (edges[m + 2] - edges[m + 1]);
      row[k] = Math.max(0, Math.min(up, down)) * norm;
    }
    bank.push(row);
  }
  return bank;
}

function logMel(audio) {
  const bins = N_FFT / 2 + 1;
  const frames = Math.floor((audio.length - N_FFT) / HOP) + 1;
  const cos = new Float32Array(bins * N_FFT), sin = new Float32Array(bins * N_FFT);
  for (let k = 0; k < bins; k++) {
    for (let n = 0; n < N_FFT; n++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N_FFT);
      const angle = (2 * Math.PI * k * n) / N_FFT;
      cos[k * N_FFT + n] = Math.cos(angle) * w;
      sin[k * N_FFT + n] = -Math.sin(angle) * w;
    }
  }
  const bank = melBank();
  const out = new Float32Array(N_MELS * frames);
  const power = new Float32Array(bins);
  for (let t = 0; t < frames; t++) {
    const off = t * HOP;
    for (let k = 0; k < bins; k++) {
      let re = 0, im = 0;
      const base = k * N_FFT;
      for (let n = 0; n < N_FFT; n++) {
        const x = audio[off + n];
        re += x * cos[base + n];
        im += x * sin[base + n];
      }
      power[k] = re * re + im * im;
    }
    for (let m = 0; m < N_MELS; m++) {
      let e = 0;
      const row = bank[m];
      for (let k = 0; k < bins; k++) e += row[k] * power[k];
      out[m * frames + t] = Math.log(e + 1e-6);
    }
  }
  let mean = 0;
  for (const v of out) mean += v;
  mean /= out.length;
  let sd = 0;
  for (const v of out) sd += (v - mean) ** 2;
  sd = Math.sqrt(sd / (out.length - 1)) + 1e-5;
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - mean) / sd;
  return { data: out, frames };
}

function cssColour(name) {
  const probe = document.createElement("span");
  probe.style.color = `var(${name})`;
  document.body.append(probe);
  const rgb = getComputedStyle(probe).color.match(/\d+/g).slice(0, 3).map(Number);
  probe.remove();
  return rgb;
}

function drawWave(canvas, audio) {
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  const [r, g, b] = cssColour("--accent");
  ctx.fillStyle = `rgb(${r} ${g} ${b})`;
  const per = Math.floor(audio.length / w);
  for (let x = 0; x < w; x++) {
    let peak = 0;
    for (let i = x * per; i < (x + 1) * per; i++) peak = Math.max(peak, Math.abs(audio[i]));
    const bar = Math.max(1, peak * h);
    ctx.fillRect(x, (h - bar) / 2, 1, bar);
  }
}

function drawSpec(canvas, { data, frames }) {
  const ctx = canvas.getContext("2d");
  canvas.width = frames;
  canvas.height = N_MELS;
  const img = ctx.createImageData(frames, N_MELS);
  const stops = [cssColour("--page"), cssColour("--accent"), cssColour("--sun")];
  for (let m = 0; m < N_MELS; m++) {
    for (let t = 0; t < frames; t++) {
      const z = Math.max(0, Math.min(1, (data[m * frames + t] + 2.5) / 5));
      const [a, b, f] = z < 0.5 ? [stops[0], stops[1], z * 2] : [stops[1], stops[2], (z - 0.5) * 2];
      const p = ((N_MELS - 1 - m) * frames + t) * 4;
      for (let c = 0; c < 3; c++) img.data[p + c] = a[c] + (b[c] - a[c]) * f;
      img.data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function rms(x) {
  let s = 0;
  for (const v of x) s += v * v;
  return Math.sqrt(s / x.length);
}

function fillTracks() {
  const select = $("s-track");
  for (const s of state.catalogue.songs) {
    select.append(Object.assign(document.createElement("option"), { value: String(s.id), textContent: `${s.title} (${s.composer})` }));
  }
}

async function runSpectrogram() {
  const status = $("s-status");
  const song = state.catalogue?.songs[Number($("s-track").value)];
  if (!song) return;
  $("s-run").disabled = true;
  status.textContent = "Downloading and decoding the recording.";
  try {
    const bytes = await fetch(song.audio).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.arrayBuffer();
    });
    // Decoding in a 16 kHz context resamples, as the voice input does.
    const decoded = await new OfflineAudioContext(1, SR, SR).decodeAudioData(bytes);
    const full = decoded.getChannelData(0);
    const from = Math.min(Math.max(0, full.length - SAMPLES), 20 * SR);
    const clip = full.slice(from, from + SAMPLES);
    status.textContent = "Computing the spectrogram.";
    await new Promise((r) => setTimeout(r, 20));
    const ready = normalise(clip);
    if (!ready) {
      status.textContent = "This part of the recording is too quiet to read. Try another one.";
      return;
    }
    $("s-out").hidden = false;
    drawWave($("s-wave-in"), clip);
    drawWave($("s-wave-out"), ready);
    $("s-rms-in").textContent = `RMS ${rms(clip).toFixed(3)}`;
    $("s-rms-out").textContent = `RMS ${rms(ready).toFixed(3)}`;
    drawSpec($("s-spec"), logMel(ready));
    status.textContent = `Five seconds from 0:${String(Math.round(from / SR)).padStart(2, "0")} of ${song.title}.`;
  } catch {
    status.textContent = "The recording could not be loaded. Please try again.";
  } finally {
    $("s-run").disabled = false;
  }
}

// Training charts, from the model cards.

function barChart(el, { groups, series, min, max, label, chance }) {
  const W = el.clientWidth && el.clientWidth < 420 ? 340 : 460, H = 240, L = 40, B = 46, T = 14, R = 8;
  const chart = svg(W, H, label);
  if (W < 460) chart.classList.add("narrow");
  const y = (v) => H - B - ((v - min) / (max - min)) * (H - T - B);
  for (let i = 0; i <= 4; i++) {
    const v = min + ((max - min) * i) / 4;
    add(chart, "line", { x1: L, y1: y(v), x2: W - R, y2: y(v), class: "gridline" });
    add(chart, "text", { x: L - 6, y: y(v) + 4, "text-anchor": "end" }, Number.isInteger(v) ? String(v) : v.toFixed(2));
  }
  const gw = (W - L - R) / groups.length;
  const bw = Math.min(22, (gw - 12) / series.length);
  groups.forEach((g, i) => {
    const gx = L + i * gw + (gw - bw * series.length) / 2;
    series.forEach((s, j) => {
      const v = s.values[i];
      const rect = add(chart, "rect", { x: gx + j * bw, y: y(v), width: bw - 2, height: H - B - y(v), rx: 3, style: `fill: ${s.colour}` });
      add(rect, "title", {}, `${g}, ${s.name}: ${v}`);
    });
    add(chart, "text", { x: L + i * gw + gw / 2, y: H - B + 16, "text-anchor": "middle" }, g);
  });
  if (chance !== undefined) {
    add(chart, "line", { x1: L, y1: y(chance), x2: W - R, y2: y(chance), class: "line-plan" });
  }
  add(chart, "line", { x1: L, y1: H - B, x2: W - R, y2: H - B, class: "axis" });
  el.replaceChildren(chart);
}

function trainingCharts() {
  barChart($("t-voice"), {
    groups: ["anger", "disgust", "fear", "happy", "neutral", "sad"],
    series: [
      { name: "teacher", colour: "var(--sun)", values: [1.34, 1.07, 1.17, 1.25, 0.90, 0.95] },
      { name: "student", colour: "var(--accent)", values: [1.35, 1.05, 1.16, 1.20, 0.92, 0.93] },
    ],
    min: 0.8, max: 1.4,
    label: "Average arousal by heard emotion on CREMA-D test actors: the student closely follows the teacher for every emotion.",
  });
  barChart($("t-face"), {
    groups: ["FER-2013", "FER+", "CREMA-D"],
    series: [{ name: "accuracy %", colour: "var(--accent)", values: [51.0, 59.5, 36.2] }],
    min: 0, max: 70, chance: 14.3,
    label: "Face model accuracy: 51.0% on FER-2013, 59.5% on FER+, 36.2% on CREMA-D frames, against 14.3% chance.",
  });
}

trainingCharts();
$("s-run").addEventListener("click", runSpectrogram);
let resizing = null;
window.addEventListener("resize", () => {
  clearTimeout(resizing);
  resizing = setTimeout(() => { trainingCharts(); renderExplorer(); }, 200);
});
startExplorer();
