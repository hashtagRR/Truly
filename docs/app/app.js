// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 hashtagRR

import * as store from "./store.js";
import { isMasking } from "./readout.js";

const $ = (id) => document.getElementById(id);
const VIEWS = ["checkin", "music", "history", "privacy"];
const TONE_TEXT = {
  bright: "Your expression looked bright.",
  calm: "Your expression looked calm.",
  heavy: "Your expression looked heavy.",
};

let questions = null;
let faceTone = null;
let camera = null;

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
}

// Camera check

async function startCameraCheck() {
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
    faceTone = result?.tone ?? null;
    status.textContent = result
      ? `${TONE_TEXT[result.tone]} This is only a rough reading. Your own answers matter most.`
      : "Truly could not see your face clearly. That is fine, the camera check is optional.";
  } catch (err) {
    if (signal.aborted) return;
    status.textContent = err?.name === "NotAllowedError"
      ? "Camera access was not allowed. That is fine, the camera check is optional."
      : "The camera check is not available on this device. That is fine, it is optional.";
  } finally {
    if (camera === check) stopCameraCheck(false);
  }
}

function stopCameraCheck(userStopped = true) {
  if (camera) {
    camera.abort.abort();
    const video = $("camera-video");
    if (camera.stream) camera.stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
    camera = null;
  }
  $("camera-stage").hidden = true;
  $("camera-stop").hidden = true;
  $("camera-start").hidden = false;
  $("camera-start").textContent = "Start camera check again";
  if (userStopped) $("camera-status").textContent = "Camera stopped.";
}

// Saving

function saveCheckin(event) {
  event.preventDefault();
  const form = event.target;
  const feeling = Number(form.feeling?.value || 0);
  const energy = Number(form.energy?.value || 0);
  if (!feeling || !energy) {
    $("form-error").textContent = "Please choose how you feel and how much energy you have.";
    return;
  }
  $("form-error").textContent = "";
  const entry = {
    at: new Date().toISOString(),
    feeling,
    energy,
    note: form.note.value.trim() || null,
    face: faceTone,
  };
  const ok = store.add(entry);
  const message = [];
  if (!ok) message.push("This browser would not let Truly save. Private browsing can cause this.");
  if (isMasking(faceTone, feeling)) {
    message.push("You said you feel low, while your face looked bright. Many people smile through heavy days. Thank you for answering honestly. Your answer is the one that counts.");
  } else {
    message.push(`You said you feel ${labelFor("feeling", feeling).toLowerCase()}, with ${labelFor("energy", energy).toLowerCase()} energy.`);
  }
  $("saved-message").textContent = message.join(" ");
  $("saved-help").hidden = feeling > 1;
  form.hidden = true;
  $("saved").hidden = false;
  $("saved").focus();
}

function newCheckin() {
  const form = $("checkin-form");
  form.reset();
  faceTone = null;
  $("camera-status").textContent = "";
  $("camera-start").textContent = "Start camera check";
  $("saved").hidden = true;
  form.hidden = false;
  $("checkin-title").scrollIntoView({ block: "start" });
}

// Music path

const STEPS = 6;
const SLOW_STEPS = 9;
const music = { catalogue: null, entry: null, direction: null, steps: STEPS, points: [], path: [], skipped: new Set() };

async function openMusic() {
  const entries = store.load();
  const entry = entries[entries.length - 1];
  $("music-needs-checkin").hidden = Boolean(entry);
  $("music-body").hidden = !entry;
  if (!entry) return;
  const status = $("music-status");
  if (!music.catalogue) {
    status.textContent = "Loading songs. The first time, this downloads about 1 MB.";
    try {
      const lib = await import("./music.js");
      music.lib = lib;
      music.catalogue = await lib.loadCatalogue(new URL("./music/catalogue.json", import.meta.url));
    } catch {
      status.textContent = "The songs could not be loaded. Please check your connection and try again.";
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

function currentEntry() {
  const entries = store.load();
  return entries[entries.length - 1];
}

function newPath(entry = currentEntry(), keep = []) {
  const { lib, catalogue } = music;
  const start = lib.startPoint(entry.feeling, entry.energy, catalogue.stats);
  const goal = lib.goalPoint(start, music.direction, catalogue.stats);
  music.points = lib.pathPoints(start, goal, music.steps);
  music.path = lib.buildPath(catalogue, music.points, { keep });
  music.skipped = new Set();
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
  const label = music.direction === "steady" ? "staying close to how you feel"
    : music.direction === "calmer" ? "moving step by step towards calmer" : "moving step by step towards brighter";
  svg.setAttribute("aria-label", `A path of ${points.length} songs, ${label}`);
  const el = (tag, attrs, text) => {
    const n = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text) n.textContent = text;
    svg.append(n);
  };
  el("polyline", { points: points.map((p, i) => `${x(i)},${y(p.v)}`).join(" "), class: "path" });
  points.forEach((p, i) => el("circle", { cx: x(i), cy: y(p.v), r: i === 0 || i === points.length - 1 ? 7 : 4, class: "stop" }));
  el("text", { x: L, y: H - 8, class: "label" }, "where you are");
  const endLabel = music.direction === "steady" ? "staying with you" : music.direction === "calmer" ? "calmer" : "brighter";
  el("text", { x: W - R, y: H - 8, "text-anchor": "end", class: "label" }, endLabel);
  box.append(svg);
}

function renderMusic() {
  renderCurve();
  const list = $("music-list");
  list.replaceChildren();
  music.path.forEach((song, i) => {
    const li = document.createElement("li");
    const text = document.createElement("div");
    text.append(
      Object.assign(document.createElement("div"), { className: "title", textContent: song.title }),
      Object.assign(document.createElement("div"), { className: "artist", textContent: song.artist }),
    );
    const links = Object.assign(document.createElement("div"), { className: "links" });
    for (const l of music.lib.songLinks(song)) {
      links.append(Object.assign(document.createElement("a"), { href: l.href, textContent: l.label, target: "_blank", rel: "noopener" }));
    }
    const swap = Object.assign(document.createElement("button"), { type: "button", className: "link", textContent: "Not this one" });
    swap.setAttribute("aria-label", `Choose another song instead of ${song.title}`);
    swap.addEventListener("click", () => {
      music.skipped.add(song.id);
      music.path = music.lib.replaceSong(music.catalogue, music.path, music.points, i, music.skipped);
      renderMusic();
      $("music-status").textContent = `Song ${i + 1} changed.`;
    });
    links.append(swap);
    li.append(text, links);
    list.append(li);
  });
  $("music-slower").disabled = music.steps === SLOW_STEPS;
  if (!music.path.length) $("music-status").textContent = "No songs matched. Please try another direction.";
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
  $("music-list").replaceChildren();
  $("music-curve").replaceChildren();
  $("music-status").textContent = "Stopped. You can come back to music any time.";
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
  svg.setAttribute("aria-label", `How you felt across your last ${recent.length} check-ins`);
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
      textContent: `Feeling ${labelFor("feeling", e.feeling).toLowerCase()}, energy ${labelFor("energy", e.energy).toLowerCase()}`,
    });
    li.append(time, values);
    if (e.note) li.append(Object.assign(document.createElement("p"), { className: "note", textContent: e.note }));
    list.append(li);
  }
}

// Help

function openHelp() {
  const dialog = $("help");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else window.open("https://findahelpline.com", "_blank", "noopener");
}

async function init() {
  questions = await fetch(new URL("./checkin.json", import.meta.url)).then((r) => r.json());
  renderScale("feeling");
  renderScale("energy");
  $("note-label").textContent = questions.note.label;
  $("note-hint").textContent = questions.note.hint;

  $("checkin-form").addEventListener("submit", saveCheckin);
  $("camera-start").addEventListener("click", startCameraCheck);
  $("camera-stop").addEventListener("click", () => stopCameraCheck(true));
  $("new-checkin").addEventListener("click", newCheckin);
  $("open-help").addEventListener("click", openHelp);
  document.querySelectorAll("[data-open-help]").forEach((b) => b.addEventListener("click", openHelp));

  document.querySelectorAll('input[name="direction"]').forEach((r) =>
    r.addEventListener("change", () => setDirection(r.value)));
  $("music-slower").addEventListener("click", slowDown);
  $("music-new").addEventListener("click", () => { newPath(); $("music-status").textContent = "A new path is ready."; });
  $("music-stop").addEventListener("click", stopMusic);

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
