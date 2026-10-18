// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 hashtagRR

import * as store from "./store.js";

const $ = (id) => document.getElementById(id);
const VIEWS = ["checkin", "music", "history", "privacy"];
const TONE_TEXT = {
  bright: "The camera suggests starting a little brighter.",
  calm: "The camera suggests starting where you are.",
  heavy: "The camera suggests starting a little calmer and softer.",
};
const STEPS = 6;
const SLOW_STEPS = 9;
const MUSIC_BASE = new URL("../../Truly-music/", import.meta.url);

let questions = null;
let camera = null;
// The current check-in lives here for this visit; it is saved only if history is on.
const session = { entry: null, face: null };
const music = { lib: null, catalogue: null, entry: null, direction: null, steps: STEPS, points: [], path: [], skipped: new Set(), playing: -1 };

function labelFor(group, value) {
  return questions[group].options.find((o) => o.value === value)?.label ?? String(value);
}

function renderScale(group) {
  const q = questions[group];
  $(`${group}-question`).textContent = q.question;
  const box = $(`${group}-options`);
  box.replaceChildren();
  for (const option of q.options) {
    const id = `${group}-${option.value}`;
    const input = Object.assign(document.createElement("input"), {
      type: "radio", name: group, id, value: String(option.value),
    });
    const label = Object.assign(document.createElement("label"), { htmlFor: id, textContent: option.label });
    box.append(input, label);
  }
}

function show(view) {
  if (!VIEWS.includes(view)) view = "checkin";
  for (const v of VIEWS) $(`view-${v}`).hidden = v !== view;
  document.querySelectorAll("nav a").forEach((a) => {
    if (a.dataset.view === view) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  if (view === "history") renderHistory();
  if (view === "music") openMusic();
  if (view === "privacy") $("keep-history").checked = store.keepsHistory();
}

// Camera input: an optional nudge to where the music starts

async function startCamera() {
  const status = $("camera-status");
  $("camera-start").hidden = true;
  $("camera-stop").hidden = false;
  status.textContent = "Getting ready. The first time, this downloads about 30 MB.";
  const check = { abort: new AbortController(), stream: null };
  camera = check;
  const { signal } = check.abort;
  try {
    const face = await import("./face.js");
    await face.loadModels();
    if (signal.aborted) return;
    $("camera-stage").hidden = false;
    const stream = await face.startCamera($("camera-video"));
    if (signal.aborted) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    check.stream = stream;
    status.textContent = "Look at the screen as you normally would. This takes a few seconds.";
    const result = await face.readExpression($("camera-video"), { signal });
    if (signal.aborted) return;
    session.face = result?.tone ?? null;
    status.textContent = result
      ? `${TONE_TEXT[result.tone]} It is only a playful guess, and your answers above still lead.`
      : "The camera could not see a face clearly. That is fine, it is optional.";
  } catch (err) {
    if (signal.aborted) return;
    status.textContent = err?.name === "NotAllowedError"
      ? "Camera access was not allowed. That is fine, it is optional."
      : "The camera is not available on this device. That is fine, it is optional.";
  } finally {
    if (camera === check) stopCamera(false);
  }
}

function stopCamera(userStopped = true) {
  if (camera) {
    camera.abort.abort();
    if (camera.stream) camera.stream.getTracks().forEach((t) => t.stop());
    $("camera-video").srcObject = null;
    camera = null;
  }
  $("camera-stage").hidden = true;
  $("camera-stop").hidden = true;
  $("camera-start").hidden = false;
  $("camera-start").textContent = "Try the camera again";
  if (userStopped) $("camera-status").textContent = "Camera stopped.";
}

// Check-in

function submitCheckin(event) {
  event.preventDefault();
  const form = event.target;
  const feeling = Number(form.feeling?.value || 0);
  const energy = Number(form.energy?.value || 0);
  if (!feeling || !energy) {
    $("form-error").textContent = "Please choose a mood and an energy level.";
    return;
  }
  $("form-error").textContent = "";
  const entry = { at: new Date().toISOString(), feeling, energy, note: form.note.value.trim() || null };
  session.entry = entry;
  if (store.keepsHistory()) store.add(entry);
  form.reset();
  $("camera-status").textContent = "";
  $("camera-start").textContent = "Try the camera";
  location.hash = "#music";
}

function currentEntry() {
  if (session.entry) return session.entry;
  const entries = store.load();
  return entries[entries.length - 1] ?? null;
}

// Music path

async function openMusic() {
  const entry = currentEntry();
  $("music-needs-checkin").hidden = Boolean(entry);
  $("music-body").hidden = !entry;
  if (!entry) return;
  const status = $("music-status");
  if (!music.catalogue) {
    status.textContent = "Loading the music list.";
    try {
      music.lib = await import("./music.js");
      music.catalogue = await music.lib.loadCatalogue(MUSIC_BASE);
      status.textContent = "";
    } catch {
      status.textContent = "The music could not be loaded. Please check your connection and try again.";
      return;
    }
  }
  if (music.entry !== entry.at) {
    music.entry = entry.at;
    music.direction = music.lib.defaultDirection(entry.feeling, entry.energy);
    music.steps = STEPS;
    $(`dir-${music.direction}`).checked = true;
    newPath(entry);
  }
}

function newPath(entry = currentEntry(), keep = []) {
  const { lib, catalogue } = music;
  const start = lib.nudgeStart(lib.startPoint(entry.feeling, entry.energy, catalogue.stats), session.face, catalogue.stats);
  const goal = lib.goalPoint(start, music.direction, catalogue.stats);
  music.points = lib.pathPoints(start, goal, music.steps);
  music.path = lib.buildPath(catalogue, music.points, { keep });
  music.skipped = new Set();
  resetPlayer();
  renderMusic();
}

function renderCurve() {
  const { points } = music;
  const box = $("music-curve");
  box.replaceChildren();
  const vs = points.map((p) => p.v);
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const W = 640, H = 120, L = 24, R = 24, T = 26, B = 30;
  const x = (i) => L + (i * (W - L - R)) / Math.max(1, points.length - 1);
  const y = (v) => (hi - lo < 0.05 ? (T + H - B) / 2 : T + ((hi - v) * (H - T - B)) / (hi - lo));
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "curve chart");
  svg.setAttribute("role", "img");
  const label = music.direction === "steady" ? "staying close to the mood you chose"
    : music.direction === "calmer" ? "moving step by step towards calmer music" : "moving step by step towards brighter music";
  svg.setAttribute("aria-label", `A path of ${points.length} pieces, ${label}`);
  const el = (tag, attrs, text) => {
    const n = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text) n.textContent = text;
    svg.append(n);
  };
  el("polyline", { points: points.map((p, i) => `${x(i)},${y(p.v)}`).join(" "), class: "path" });
  points.forEach((p, i) => el("circle", { cx: x(i), cy: y(p.v), r: i === 0 || i === points.length - 1 ? 7 : 4, class: "stop" }));
  el("text", { x: L, y: H - 8, class: "label" }, "your mood");
  const endLabel = music.direction === "steady" ? "staying with you" : music.direction === "calmer" ? "calmer" : "brighter";
  el("text", { x: W - R, y: H - 8, "text-anchor": "end", class: "label" }, endLabel);
  box.append(svg);
}

function credit(song) {
  return `${song.composer}. Performed by ${song.artist}.`;
}

function formatTime(sec) {
  if (!Number.isFinite(sec)) return "0:00";
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

function renderMusic() {
  renderCurve();
  const list = $("music-list");
  list.replaceChildren();
  music.path.forEach((song, i) => {
    const li = document.createElement("li");
    if (i === music.playing) li.className = "playing";
    const text = document.createElement("div");
    const licence = Object.assign(document.createElement("a"), { href: song.licenceUrl, textContent: song.licence, target: "_blank", rel: "noopener" });
    const source = Object.assign(document.createElement("a"), { href: song.source, textContent: "source", target: "_blank", rel: "noopener" });
    const creditLine = Object.assign(document.createElement("div"), { className: "credit" });
    creditLine.append(`${credit(song)} `, licence, ", ", source, ".");
    text.append(
      Object.assign(document.createElement("div"), { className: "title", textContent: song.title }),
      Object.assign(document.createElement("div"), { className: "why", textContent: music.lib.explain(music.path, i, music.catalogue.stats, music.direction) }),
      Object.assign(document.createElement("div"), { className: "artist", textContent: formatTime(song.seconds) }),
      creditLine,
    );
    const links = Object.assign(document.createElement("div"), { className: "links" });
    const play = Object.assign(document.createElement("button"), { type: "button", className: "link", textContent: i === music.playing ? "Playing" : "Play" });
    play.setAttribute("aria-label", `Play ${song.title}`);
    play.addEventListener("click", () => playAt(i));
    const swap = Object.assign(document.createElement("button"), { type: "button", className: "link", textContent: "Not this one" });
    swap.setAttribute("aria-label", `Choose another piece instead of ${song.title}`);
    swap.addEventListener("click", () => {
      music.skipped.add(song.id);
      const was = music.playing === i;
      music.path = music.lib.replaceSong(music.catalogue, music.path, music.points, i, music.skipped);
      if (was) playAt(i);
      else renderMusic();
      $("music-status").textContent = `Piece ${i + 1} changed.`;
    });
    links.append(play, swap);
    li.append(text, links);
    list.append(li);
  });
  $("music-slower").disabled = music.steps === SLOW_STEPS;
  if (!music.path.length) $("music-status").textContent = "No pieces matched. Please try another direction.";
}

function setDirection(direction) {
  music.direction = direction;
  newPath();
  $("music-status").textContent = "A new path is ready.";
}

function slowDown() {
  music.steps = SLOW_STEPS;
  newPath(currentEntry(), music.path.slice(0, 1));
  $("music-status").textContent = `The path now takes ${SLOW_STEPS} smaller steps.`;
}

function stopMusic() {
  resetPlayer();
  $("music-list").replaceChildren();
  $("music-curve").replaceChildren();
  $("music-status").textContent = "Stopped. You can come back to the music any time.";
}

// Player

function playAt(i) {
  const song = music.path[i];
  if (!song) return;
  const audio = $("np-audio");
  music.playing = i;
  audio.src = song.audio;
  audio.play().catch(() => { $("music-status").textContent = "The piece could not start. Please press play again."; });
  $("np-label").textContent = `Piece ${i + 1} of ${music.path.length}`;
  $("np-title").textContent = song.title;
  $("np-credit").textContent = `${credit(song)} ${song.licence}.`;
  $("np-next").hidden = i >= music.path.length - 1;
  renderMusic();
}

function togglePlay() {
  const audio = $("np-audio");
  if (music.playing < 0) return playAt(0);
  if (audio.paused) audio.play().catch(() => {});
  else audio.pause();
}

function resetPlayer() {
  const audio = $("np-audio");
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  music.playing = -1;
  $("np-label").textContent = "Ready when you are";
  $("np-title").textContent = "";
  $("np-credit").textContent = "";
  $("np-progress").value = 0;
  $("np-time").textContent = "0:00";
  $("np-toggle").textContent = "Play the path";
  $("np-next").hidden = true;
}

function wirePlayer() {
  const audio = $("np-audio");
  audio.addEventListener("play", () => { $("np-toggle").textContent = "Pause"; });
  audio.addEventListener("pause", () => { if (music.playing >= 0) $("np-toggle").textContent = "Play"; });
  audio.addEventListener("timeupdate", () => {
    if (audio.duration) $("np-progress").value = audio.currentTime / audio.duration;
    $("np-time").textContent = formatTime(audio.currentTime);
  });
  audio.addEventListener("ended", () => {
    if (music.playing < music.path.length - 1) playAt(music.playing + 1);
    else {
      $("music-status").textContent = "That is the end of this path.";
      resetPlayer();
      renderMusic();
    }
  });
  $("np-toggle").addEventListener("click", togglePlay);
  $("np-next").addEventListener("click", () => playAt(music.playing + 1));
}

// History

function renderChart(entries) {
  const recent = entries.slice(-14);
  const box = $("history-chart");
  box.replaceChildren();
  if (recent.length < 2) return;
  const W = 640, H = 200, L = 84, R = 16, T = 14, B = 26;
  const x = (i) => L + (i * (W - L - R)) / (recent.length - 1);
  const y = (v) => T + ((5 - v) * (H - T - B)) / 4;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "chart");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Your mood answers across your last ${recent.length} check-ins`);
  const el = (tag, attrs, text) => {
    const n = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text) n.textContent = text;
    svg.append(n);
  };
  for (const o of questions.feeling.options) {
    el("line", { x1: L, x2: W - R, y1: y(o.value), y2: y(o.value), class: "grid" });
    el("text", { x: L - 10, y: y(o.value) + 4, "text-anchor": "end", class: "label" }, o.label);
  }
  el("polyline", { points: recent.map((e, i) => `${x(i)},${y(e.feeling)}`).join(" "), class: "line" });
  recent.forEach((e, i) => el("circle", { cx: x(i), cy: y(e.feeling), r: 5, class: "point" }));
  el("text", { x: L, y: H - 6, class: "label" }, "older");
  el("text", { x: W - R, y: H - 6, "text-anchor": "end", class: "label" }, "newest");
  box.append(svg);
}

function renderHistory() {
  const entries = store.load();
  const list = $("history-list");
  list.replaceChildren();
  $("history-empty").hidden = entries.length > 0;
  renderChart(entries);
  const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" });
  for (const e of [...entries].reverse()) {
    const li = document.createElement("li");
    const time = Object.assign(document.createElement("time"), { dateTime: e.at, textContent: fmt.format(new Date(e.at)) });
    const values = Object.assign(document.createElement("div"), {
      className: "values",
      textContent: `Mood ${labelFor("feeling", e.feeling).toLowerCase()}, energy ${labelFor("energy", e.energy).toLowerCase()}`,
    });
    li.append(time, values);
    if (e.note) li.append(Object.assign(document.createElement("p"), { className: "note", textContent: e.note }));
    list.append(li);
  }
}

async function init() {
  questions = await fetch(new URL("./checkin.json", import.meta.url)).then((r) => r.json());
  renderScale("feeling");
  renderScale("energy");
  $("note-label").textContent = questions.note.label;
  $("note-hint").textContent = questions.note.hint;

  $("checkin-form").addEventListener("submit", submitCheckin);
  $("camera-start").addEventListener("click", startCamera);
  $("camera-stop").addEventListener("click", () => stopCamera(true));

  document.querySelectorAll('input[name="direction"]').forEach((r) =>
    r.addEventListener("change", () => setDirection(r.value)));
  $("music-slower").addEventListener("click", slowDown);
  $("music-new").addEventListener("click", () => { newPath(); $("music-status").textContent = "A new path is ready."; });
  $("music-stop").addEventListener("click", stopMusic);
  wirePlayer();

  $("keep-history").addEventListener("change", (e) => {
    store.setKeepHistory(e.target.checked);
    $("data-status").textContent = e.target.checked
      ? "Check-ins will be kept on this device."
      : "Check-ins will no longer be saved. Existing ones stay until you delete them.";
  });
  $("export").addEventListener("click", () => {
    store.exportFile();
    $("data-status").textContent = "Your check-ins were downloaded.";
  });
  $("delete").addEventListener("click", () => { $("delete-confirm").hidden = false; $("delete-yes").focus(); });
  $("delete-no").addEventListener("click", () => { $("delete-confirm").hidden = true; });
  $("delete-yes").addEventListener("click", () => {
    store.clear();
    $("delete-confirm").hidden = true;
    $("data-status").textContent = "All check-ins were deleted from this device.";
  });

  window.addEventListener("hashchange", () => show(location.hash.slice(1)));
  show(location.hash.slice(1));
}

init();
