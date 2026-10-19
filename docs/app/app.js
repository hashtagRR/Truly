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
// Slowing down spreads the same journey over half as many pieces again.
const SLOWER = 1.5;
const MUSIC_BASE = new URL("../../Truly-music/", import.meta.url);
const STALL_MS = 15000;

let questions = null;
let camera = null;
let voiceCheck = null;
// The current check-in lives here for this visit only; mood answers are never saved.
// A camera reading waits in pendingFace and belongs only to the next check-in;
// it is kept in memory with that check-in and never saved.
const session = { entry: null, entryFace: null, pendingFace: null, entryVoice: null, pendingVoice: null };
const music = { lib: null, catalogue: null, entry: null, direction: null, steps: 6, slow: false, points: [], path: [], skipped: new Set(), playing: -1, record: null };
// Music preferences. They are saved only when saving is on; pieces marked
// "not for me" with saving off are left out for this visit only.
const prefs = { instruments: new Set(), length: "standard", notForMe: new Set() };
// Playback state for the current piece: one retry after an error, a stall
// timer for slow connections, and the next piece fetched ahead of time.
const playback = { retried: false, failed: 0, stall: null, ahead: null, seeking: false };

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
  if (view === "privacy") $("saving").checked = store.savingOn();
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
    session.pendingFace = result?.tone ?? null;
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

// Voice input: an optional nudge to where the music starts

function voiceText(v) {
  if (v.arousal > 0.5) return "Your voice suggests starting a little livelier.";
  if (v.arousal < -0.5) return "Your voice suggests starting a little calmer.";
  return "Your voice suggests starting about where you are.";
}

async function startVoice() {
  const status = $("voice-status");
  $("voice-start").hidden = true;
  $("voice-stop").hidden = false;
  status.textContent = "Getting ready.";
  const check = new AbortController();
  voiceCheck = check;
  try {
    const voice = await import("./voice.js");
    await voice.loadModel();
    if (check.signal.aborted) return;
    status.textContent = "Listening for five seconds. Hum, read a line or talk about anything.";
    const result = await voice.readVoice(check.signal);
    if (check.signal.aborted) return;
    session.pendingVoice = result;
    status.textContent = result
      ? `${voiceText(result)} It is only a playful guess, and your answers above still lead.`
      : "Truly could not hear enough sound. That is fine, it is optional.";
  } catch (err) {
    if (check.signal.aborted) return;
    status.textContent = err?.name === "NotAllowedError"
      ? "Microphone access was not allowed. That is fine, it is optional."
      : "The voice check is not available on this device. That is fine, it is optional.";
  } finally {
    if (voiceCheck === check) stopVoice(false);
  }
}

function stopVoice(userStopped = true) {
  if (voiceCheck) {
    voiceCheck.abort();
    voiceCheck = null;
  }
  $("voice-stop").hidden = true;
  $("voice-start").hidden = false;
  $("voice-start").textContent = "Try your voice again";
  if (userStopped) $("voice-status").textContent = "Stopped.";
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
  const entry = { at: new Date().toISOString(), feeling, energy };
  session.entry = entry;
  session.entryFace = session.pendingFace;
  session.pendingFace = null;
  session.entryVoice = session.pendingVoice;
  session.pendingVoice = null;
  form.reset();
  $("camera-status").textContent = "";
  $("camera-start").textContent = "Try the camera";
  $("voice-status").textContent = "";
  $("voice-start").textContent = "Try your voice";
  location.hash = "#music";
}

function currentEntry() {
  return session.entry;
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
    $("music-retry").hidden = true;
    try {
      music.lib ??= await import("./music.js");
      music.catalogue = await music.lib.loadCatalogue(MUSIC_BASE);
      status.textContent = "";
    } catch {
      status.textContent = "The music library could not be reached right now.";
      $("music-retry").hidden = false;
      return;
    }
  }
  if (music.entry !== entry.at) {
    music.entry = entry.at;
    music.direction = music.lib.defaultDirection(entry.feeling, entry.energy);
    music.slow = false;
    music.steps = baseSteps();
    $(`dir-${music.direction}`).checked = true;
    newPath(entry);
  }
}

function newPath(entry = currentEntry(), keep = []) {
  const { lib, catalogue } = music;
  const current = entry === session.entry;
  const fromFace = lib.nudgeStart(lib.startPoint(entry.feeling, entry.energy, catalogue.stats), current ? session.entryFace : null, catalogue.stats);
  const start = lib.nudgeVoice(fromFace, current ? session.entryVoice : null, catalogue.stats);
  const goal = lib.goalPoint(start, music.direction, catalogue.stats);
  music.points = lib.pathPoints(start, goal, music.steps);
  music.path = lib.buildPath(catalogue, music.points, { keep, prefs: currentPrefs() });
  music.skipped = new Set();
  music.record = null;
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
  const listPrefs = currentPrefs();
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
      Object.assign(document.createElement("div"), { className: "why", textContent: music.lib.explain(music.path, i, music.catalogue.stats, music.direction, listPrefs) }),
      Object.assign(document.createElement("div"), { className: "artist", textContent: formatTime(song.seconds) }),
      creditLine,
    );
    const links = Object.assign(document.createElement("div"), { className: "links" });
    const play = Object.assign(document.createElement("button"), { type: "button", className: "link", textContent: i === music.playing ? "Playing" : "Play" });
    play.setAttribute("aria-label", `Play ${song.title}`);
    play.addEventListener("click", () => playAt(i));
    const swap = Object.assign(document.createElement("button"), { type: "button", className: "link", textContent: "Not this one" });
    swap.setAttribute("aria-label", `Choose another piece instead of ${song.title}`);
    swap.addEventListener("click", () => replaceAt(i, song));
    const notForMe = Object.assign(document.createElement("button"), { type: "button", className: "link", textContent: "Not for me" });
    notForMe.setAttribute("aria-label", `Leave ${song.title} out of new paths`);
    notForMe.addEventListener("click", () => {
      prefs.notForMe.add(song.key);
      const saved = store.addNotForMe({ key: song.key, title: song.title, composer: song.composer, performer: song.artist });
      replaceAt(i, song);
      $("music-status").textContent = saved
        ? `${song.title} will be left out of new paths. You can allow it again in Your listening.`
        : `${song.title} is left out for this visit. Switch saving on in Privacy to remember this.`;
    });

    const fav = Object.assign(document.createElement("button"), { type: "button", className: "link" });
    const isFav = store.isFavourite(song.key);
    fav.textContent = isFav ? "Favourite" : "Add to favourites";
    fav.setAttribute("aria-pressed", String(isFav));
    fav.addEventListener("click", () => {
      if (isFav) {
        store.removeFavourite(song.key);
        $("music-status").textContent = `${song.title} is no longer a favourite.`;
        renderMusic();
        return;
      }
      const now = store.toggleFavourite({ key: song.key, title: song.title, composer: song.composer, performer: song.artist });
      if (now === null) {
        $("music-status").textContent = "Favourites need saving switched on. You can switch it on in Privacy.";
        return;
      }
      $("music-status").textContent = now ? `${song.title} is now a favourite.` : `${song.title} is no longer a favourite.`;
      renderMusic();
    });
    links.append(play, swap, fav, notForMe);
    li.append(text, links);
    list.append(li);
  });
  $("music-slower").disabled = music.slow;
  if (!music.path.length) $("music-status").textContent = "No pieces matched. Please try another direction.";
}

function replaceAt(i, song) {
  music.skipped.add(song.id);
  const was = music.playing === i;
  const before = new Set(music.path.map((s) => s.id));
  const playingId = music.playing >= 0 ? music.path[music.playing].id : null;
  music.path = music.lib.replaceSong(music.catalogue, music.path, music.points, i, music.skipped, Math.random, currentPrefs());
  let added = music.path.findIndex((s) => !before.has(s.id));
  if (added < 0 && (prefs.notForMe.has(song.key))) {
    // Nothing else fits here, but a piece marked "not for me" still leaves.
    music.path = music.path.filter((s) => s.id !== song.id);
    if (was) {
      if (i < music.path.length) playAt(i);
      else resetPlayer();
      renderMusic();
      $("music-status").textContent = "";
      return;
    }
  }
  if (was && added >= 0) playAt(added);
  else {
    if (playingId !== null) {
      music.playing = music.path.findIndex((s) => s.id === playingId);
      $("np-label").textContent = `Piece ${music.playing + 1} of ${music.path.length}`;
      updateSteps();
    }
    renderMusic();
  }
  $("music-status").textContent = added >= 0 ? `Piece ${added + 1} is new.` : music.path.some((s) => s.id === song.id) ? "No other piece fits here." : "";
}

function setDirection(direction) {
  music.direction = direction;
  newPath();
  $("music-status").textContent = "A new path is ready.";
}

function slowDown() {
  music.slow = true;
  music.steps = Math.round(baseSteps() * SLOWER);
  newPath(currentEntry(), music.path.slice(0, 1));
  $("music-status").textContent = `The path now takes ${music.path.length} smaller steps.`;
}

// Preferences

function baseSteps() {
  return music.lib?.LENGTHS[prefs.length] ?? 6;
}

function currentPrefs() {
  return music.lib.preferences({
    instruments: prefs.instruments,
    favourites: store.loadFavourites().map((f) => f.key),
    ruledOut: [...store.loadNotForMe().map((p) => p.key), ...prefs.notForMe],
  });
}

function prefsNote() {
  $("prefs-note").textContent = store.savingOn()
    ? "Your preferences are kept in this browser."
    : "These preferences last for this visit. Switch saving on in Privacy to keep them.";
}

function loadPrefs() {
  const saved = store.loadPreferences();
  if (Array.isArray(saved.instruments)) prefs.instruments = new Set(saved.instruments);
  if (["short", "standard", "long"].includes(saved.length)) prefs.length = saved.length;
  document.querySelectorAll('input[name="instrument"]').forEach((c) => { c.checked = prefs.instruments.has(c.value); });
  $(`len-${prefs.length}`).checked = true;
  prefsNote();
}

function changePrefs() {
  prefs.instruments = new Set([...document.querySelectorAll('input[name="instrument"]:checked')].map((c) => c.value));
  prefs.length = document.querySelector('input[name="length"]:checked')?.value ?? "standard";
  store.savePreferences(prefs);
  prefsNote();
  if (!music.catalogue || !currentEntry()) return;
  music.slow = false;
  music.steps = baseSteps();
  newPath();
  $("music-status").textContent = "A new path is ready with your preferences.";
}

function stopMusic() {
  resetPlayer();
  $("music-list").replaceChildren();
  $("music-curve").replaceChildren();
  $("music-status").textContent = "Stopped. You can come back to the music any time.";
}

// Player

// Records the path being played, only when saving is on.
function recordPlay(song) {
  if (!store.savingOn()) return;
  if (!music.record) {
    music.record = { id: `${Date.now()}`, at: new Date().toISOString(), direction: music.direction, pieces: [], played: [] };
  }
  music.record.pieces = music.path.map((s) => ({ key: s.key, title: s.title, composer: s.composer }));
  if (!music.record.played.includes(song.key)) music.record.played.push(song.key);
  store.savePath(music.record);
}

function playAt(i, { from = 0, retry = false } = {}) {
  const song = music.path[i];
  if (!song) return;
  recordPlay(song);
  const audio = $("np-audio");
  if (!retry) playback.retried = false;
  music.playing = i;
  audio.src = song.audio;
  if (from) audio.currentTime = from;
  startStallTimer();
  audio.play().catch((err) => {
    if (err?.name === "NotAllowedError") $("music-status").textContent = "Press play to start the music.";
  });
  $("np-label").textContent = `Piece ${i + 1} of ${music.path.length}`;
  $("np-title").textContent = song.title;
  $("np-credit").textContent = `${credit(song)} ${song.licence}.`;
  updateSteps();
  setMediaSession(song);
  renderMusic();
}

function updateSteps() {
  $("np-prev").hidden = music.playing <= 0;
  $("np-next").hidden = music.playing < 0 || music.playing >= music.path.length - 1;
}

function togglePlay() {
  const audio = $("np-audio");
  if (music.playing < 0) return playAt(0);
  if (audio.paused) audio.play().catch(() => {});
  else audio.pause();
}

function startStallTimer() {
  clearTimeout(playback.stall);
  playback.stall = setTimeout(() => {
    $("music-status").textContent = "The piece is taking a while to load. The connection may be slow; it will start when it is ready.";
  }, STALL_MS);
}

function clearStall() {
  clearTimeout(playback.stall);
  playback.stall = null;
}

// Starts downloading the next piece once the current one is ready, so the
// change between pieces does not wait on the network.
function fetchAhead() {
  const next = music.path[music.playing + 1];
  if (!next || playback.ahead?.dataset.key === next.key) return;
  const ahead = new Audio();
  ahead.preload = "auto";
  ahead.dataset.key = next.key;
  ahead.src = next.audio;
  playback.ahead = ahead;
}

function pieceFailed() {
  const audio = $("np-audio");
  clearStall();
  if (music.playing < 0 || !audio.getAttribute("src")) return;
  if (!playback.retried) {
    playback.retried = true;
    const at = audio.currentTime || 0;
    $("music-status").textContent = "The connection dropped. Trying the piece again.";
    const piece = music.playing;
    setTimeout(() => { if (music.playing === piece) playAt(piece, { from: at, retry: true }); }, 2000);
    return;
  }
  playback.failed += 1;
  const failedAt = music.playing;
  if (playback.failed >= 3 || failedAt >= music.path.length - 1) {
    $("music-status").textContent = "The music could not be played. Please check the connection and press play to try again.";
    playback.failed = 0;
    const keep = failedAt;
    resetPlayer();
    music.resumeAt = keep;
    renderMusic();
    return;
  }
  $("music-status").textContent = `Piece ${failedAt + 1} could not be played, so the path moves on to the next one.`;
  playAt(failedAt + 1);
}

function setMediaSession(song) {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: song.title, artist: song.artist, album: "Truly" });
  } catch {
    // Older browsers have mediaSession without MediaMetadata.
  }
}

function wireMediaSession() {
  if (!("mediaSession" in navigator)) return;
  const audio = $("np-audio");
  const handlers = {
    play: () => (music.playing < 0 ? playAt(0) : audio.play().catch(() => {})),
    pause: () => audio.pause(),
    nexttrack: () => playAt(music.playing + 1),
    previoustrack: () => playAt(Math.max(0, music.playing - 1)),
    seekto: (d) => { if (Number.isFinite(d.seekTime)) audio.currentTime = d.seekTime; },
  };
  for (const [action, fn] of Object.entries(handlers)) {
    try {
      navigator.mediaSession.setActionHandler(action, fn);
    } catch {
      // Not every browser supports every action.
    }
  }
}

function resetPlayer() {
  const audio = $("np-audio");
  clearStall();
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  music.playing = -1;
  music.resumeAt = null;
  playback.ahead = null;
  $("np-label").textContent = "Ready when you are";
  $("np-title").textContent = "";
  $("np-credit").textContent = "";
  const seek = $("np-seek");
  seek.value = 0;
  seek.disabled = true;
  seek.setAttribute("aria-valuetext", "0:00");
  $("np-time").textContent = "0:00";
  $("np-toggle").textContent = "Play the path";
  updateSteps();
  if ("mediaSession" in navigator) navigator.mediaSession.metadata = null;
}

function showTime() {
  const audio = $("np-audio");
  const seek = $("np-seek");
  const total = Number.isFinite(audio.duration) ? audio.duration : 0;
  if (total && !playback.seeking) seek.value = Math.round((audio.currentTime / total) * 1000);
  seek.disabled = !total;
  const text = total ? `${formatTime(audio.currentTime)} / ${formatTime(total)}` : formatTime(audio.currentTime);
  $("np-time").textContent = text;
  seek.setAttribute("aria-valuetext", total ? `${formatTime(audio.currentTime)} of ${formatTime(total)}` : text);
}

function wirePlayer() {
  const audio = $("np-audio");
  audio.addEventListener("play", () => { $("np-toggle").textContent = "Pause"; });
  audio.addEventListener("pause", () => { if (music.playing >= 0) $("np-toggle").textContent = "Play"; });
  audio.addEventListener("waiting", startStallTimer);
  audio.addEventListener("playing", () => {
    clearStall();
    playback.failed = 0;
    const status = $("music-status");
    if (/taking a while|Trying the piece again|Press play to start/.test(status.textContent)) status.textContent = "";
  });
  audio.addEventListener("canplaythrough", fetchAhead);
  audio.addEventListener("error", pieceFailed);
  audio.addEventListener("timeupdate", showTime);
  audio.addEventListener("durationchange", showTime);
  audio.addEventListener("ended", () => {
    clearStall();
    if (music.playing < music.path.length - 1) playAt(music.playing + 1);
    else {
      $("music-status").textContent = "That is the end of this path.";
      resetPlayer();
      renderMusic();
    }
  });
  const seek = $("np-seek");
  seek.addEventListener("input", () => {
    playback.seeking = true;
    if (audio.duration) $("np-time").textContent = `${formatTime((seek.value / 1000) * audio.duration)} / ${formatTime(audio.duration)}`;
  });
  // Arrow keys move 10 seconds and Page Up or Down 30, which suits a piece of
  // music better than the slider's own small steps.
  const JUMP = { ArrowRight: 10, ArrowUp: 10, ArrowLeft: -10, ArrowDown: -10, PageUp: 30, PageDown: -30 };
  seek.addEventListener("keydown", (e) => {
    if (!audio.duration) return;
    let to = null;
    if (e.key in JUMP) to = audio.currentTime + JUMP[e.key];
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = audio.duration - 1;
    if (to === null) return;
    e.preventDefault();
    audio.currentTime = Math.max(0, Math.min(audio.duration - 0.5, to));
    showTime();
  });
  seek.addEventListener("change", () => {
    playback.seeking = false;
    if (audio.duration) audio.currentTime = (seek.value / 1000) * audio.duration;
  });
  $("np-toggle").addEventListener("click", () => {
    if (music.playing < 0 && music.resumeAt != null) return playAt(music.resumeAt);
    togglePlay();
  });
  $("np-next").addEventListener("click", () => playAt(music.playing + 1));
  $("np-prev").addEventListener("click", () => playAt(Math.max(0, music.playing - 1)));
  wireMediaSession();
}

// Your listening

const DIRECTION_TEXT = { calmer: "Calmer path", brighter: "Gently brighter path", steady: "Steady path" };

function item(title, detail) {
  const li = document.createElement("li");
  li.append(
    Object.assign(document.createElement("div"), { className: "values", textContent: title }),
    Object.assign(document.createElement("div"), { className: "detail", textContent: detail }),
  );
  return li;
}

function renderHistory() {
  const on = store.savingOn();
  const favourites = store.loadFavourites();
  const paths = store.loadPaths();
  $("history-off").hidden = on;
  const favList = $("favourites-list");
  favList.replaceChildren();
  for (const f of [...favourites].reverse()) {
    const li = item(f.title, `${f.composer}. Performed by ${f.performer}.`);
    const remove = Object.assign(document.createElement("button"), { type: "button", className: "link", textContent: "Remove" });
    remove.setAttribute("aria-label", `Remove ${f.title} from favourites`);
    remove.addEventListener("click", () => {
      store.removeFavourite(f.key);
      renderHistory();
    });
    li.append(remove);
    favList.append(li);
  }
  $("favourites-empty").hidden = favourites.length > 0;
  const pathList = $("paths-list");
  pathList.replaceChildren();
  const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
  for (const p of [...paths].reverse()) {
    const played = p.pieces.filter((x) => p.played.includes(x.key)).map((x) => x.title);
    const li = item(`${DIRECTION_TEXT[p.direction] ?? "Path"}, ${fmt.format(new Date(p.at))}`,
      `Played ${played.length} of ${p.pieces.length}: ${played.join("; ")}`);
    pathList.append(li);
  }
  $("paths-empty").hidden = paths.length > 0;
  const notForMe = store.loadNotForMe();
  const notList = $("not-for-me-list");
  notList.replaceChildren();
  for (const n of [...notForMe].reverse()) {
    const li = item(n.title, `${n.composer}. Performed by ${n.performer}.`);
    const allow = Object.assign(document.createElement("button"), { type: "button", className: "link", textContent: "Allow again" });
    allow.setAttribute("aria-label", `Allow ${n.title} in new paths again`);
    allow.addEventListener("click", () => {
      store.removeNotForMe(n.key);
      prefs.notForMe.delete(n.key);
      renderHistory();
    });
    li.append(allow);
    notList.append(li);
  }
  $("not-for-me-empty").hidden = notForMe.length > 0;
}

async function init() {
  questions = await fetch(new URL("./checkin.json", import.meta.url)).then((r) => r.json());
  renderScale("feeling");
  renderScale("energy");
  store.removeLegacy();

  $("checkin-form").addEventListener("submit", submitCheckin);
  $("camera-start").addEventListener("click", startCamera);
  $("camera-stop").addEventListener("click", () => stopCamera(true));
  $("voice-start").addEventListener("click", startVoice);
  $("voice-stop").addEventListener("click", () => stopVoice(true));

  document.querySelectorAll('input[name="direction"]').forEach((r) =>
    r.addEventListener("change", () => setDirection(r.value)));
  $("music-slower").addEventListener("click", slowDown);
  $("music-new").addEventListener("click", () => { newPath(); $("music-status").textContent = "A new path is ready."; });
  $("music-stop").addEventListener("click", stopMusic);
  $("music-retry").addEventListener("click", openMusic);
  document.querySelectorAll('input[name="instrument"], input[name="length"]').forEach((c) => c.addEventListener("change", changePrefs));
  loadPrefs();
  wirePlayer();

  $("saving").addEventListener("change", (e) => {
    store.setSaving(e.target.checked);
    if (e.target.checked) store.savePreferences(prefs);
    prefsNote();
    $("data-status").textContent = e.target.checked
      ? "Your listening history, favourites and music preferences will be kept on this device."
      : "Nothing new will be saved. What is already saved stays until you delete it.";
  });
  $("export").addEventListener("click", () => {
    store.exportFile();
    $("data-status").textContent = "Your listening history was downloaded.";
  });
  $("delete").addEventListener("click", () => { $("delete-confirm").hidden = false; $("delete-yes").focus(); });
  $("delete-no").addEventListener("click", () => { $("delete-confirm").hidden = true; });
  $("delete-yes").addEventListener("click", () => {
    store.clear();
    $("delete-confirm").hidden = true;
    $("saving").checked = false;
    prefsNote();
    $("data-status").textContent = "Your listening history, favourites and music preferences were deleted from this device.";
  });

  window.addEventListener("hashchange", () => show(location.hash.slice(1)));
  show(location.hash.slice(1));
}

init();
