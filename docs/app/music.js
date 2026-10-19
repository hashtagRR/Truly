// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 hashtagRR

// Music paths following the iso principle: start close to how the person
// feels, then move a little at a time towards a calmer or brighter place.
// Pure functions apart from loadCatalogue.

const LEVELS = [0.08, 0.25, 0.5, 0.75, 0.92];
const CANDIDATES = 8;
const POOL = 4;
const POOL_MARGIN = 0.25;
const CONTINUITY = 0.35;
const BACKWARD = 1.0;
// Listener preferences shift the choice without overriding the path: a piece
// without a preferred instrument counts as a little further away, and a
// favourite as a little closer. Pieces marked "not for me" are never chosen.
const INSTRUMENT_MISS = 0.6;
const FAVOURITE_PULL = 0.25;
// Pieces the listener usually plays to the end come up a little more often,
// and pieces they usually leave early a little less, by at most this much.
const LISTENING_PULL = 0.24;
const LISTENING_CAP = 3;
export const INSTRUMENTS = ["piano", "strings", "orchestra", "winds"];
export const LENGTHS = { short: 4, standard: 6, long: 9 };
const INSTRUMENT_WORDS = { piano: "piano", strings: "strings", orchestra: "a full orchestra", winds: "wind instruments" };

// Normalises listener preferences; every field is optional.
export function preferences({ instruments = [], favourites = [], ruledOut = [], listening = {} } = {}) {
  return { instruments: new Set(instruments), favourites: new Set(favourites), ruledOut: new Set(ruledOut), listening };
}

// From -1 (usually left early) to 1 (usually played to the end).
export function listeningLean(counts) {
  if (!counts) return 0;
  const lean = (counts.full ?? 0) - (counts.early ?? 0);
  return Math.max(-LISTENING_CAP, Math.min(LISTENING_CAP, lean)) / LISTENING_CAP;
}

function prefersInstrument(song, prefs) {
  return !prefs.instruments.size || song.instruments.some((i) => prefs.instruments.has(i));
}

// Fetches tracks.json, retrying slow or failed requests a few times.
export async function loadCatalogue(base, { fetcher = fetch, attempts = 3, timeout = 10000, wait = 1000 } = {}) {
  let last;
  for (let i = 0; i < attempts; i++) {
    if (i) await new Promise((r) => setTimeout(r, wait * 2 ** (i - 1)));
    try {
      const res = await fetcher(new URL("tracks.json", base), { signal: AbortSignal.timeout(timeout) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return makeCatalogue(await res.json(), base);
    } catch (err) {
      last = err;
    }
  }
  throw last;
}

export function makeCatalogue(data, base) {
  const songs = data.tracks.map((t, id) => ({
    id,
    key: t.key,
    title: t.title,
    composer: t.composer,
    artist: t.performer,
    instruments: Array.isArray(t.instruments) ? t.instruments : [],
    valence: t.valence,
    arousal: t.arousal,
    bpm: t.bpm,
    seconds: t.seconds,
    audio: new URL(t.audio, base).href,
    licence: t.licence,
    licenceUrl: t.licence_url,
    source: t.source,
  }));
  const v = songs.map((s) => s.valence).sort((a, b) => a - b);
  const a = songs.map((s) => s.arousal).sort((a, b) => a - b);
  return { songs, stats: { v, a, sdV: sd(v), sdA: sd(a) } };
}

function sd(xs) {
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length) || 1;
}

export function quantile(sorted, q) {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i];
}

// Self-report answers (1 to 5) to a point in the catalogue's own valence/arousal spread.
export function startPoint(feeling, energy, stats) {
  return { v: quantile(stats.v, LEVELS[feeling - 1]), a: quantile(stats.a, LEVELS[energy - 1]) };
}

export function defaultDirection(feeling, energy) {
  if (feeling >= 4) return "steady";
  if (feeling <= 2 && energy >= 4) return "calmer";
  return "brighter";
}

// Targets favour calm, moderately positive music, where most of the catalogue sits.
// Each direction moves mainly one thing: calmer lowers energy with a small lift
// in mood; brighter lifts mood with a gentle nudge of energy towards the middle.
export function goalPoint(start, direction, stats) {
  const towards = (from, to, share) => from + (to - from) * share;
  if (direction === "calmer") {
    return {
      v: towards(start.v, Math.max(start.v, quantile(stats.v, 0.55)), 0.4),
      a: Math.min(start.a, quantile(stats.a, 0.25)),
    };
  }
  if (direction === "brighter") {
    return {
      v: Math.max(start.v, quantile(stats.v, 0.7)),
      a: towards(start.a, quantile(stats.a, 0.45), 0.4),
    };
  }
  return { ...start };
}

export function pathPoints(start, goal, steps) {
  return Array.from({ length: steps }, (_, i) => {
    const t = steps === 1 ? 0 : i / (steps - 1);
    return { v: start.v + (goal.v - start.v) * t, a: start.a + (goal.a - start.a) * t };
  });
}

// Position of a piece along the path's direction.
function along(s, heading, stats) {
  return (s.valence / stats.sdV) * heading.v + (s.arousal / stats.sdA) * heading.a;
}

// The parts of a piece's cost at one planned point; lower is better. Every
// distance is in standard deviations of the catalogue.
export function cost(s, point, prev, heading, stats, prefs = preferences()) {
  const parts = {
    closeness: ((s.valence - point.v) / stats.sdV) ** 2 + ((s.arousal - point.a) / stats.sdA) ** 2,
    step: 0,
    backward: 0,
    tempo: 0,
    instrument: prefersInstrument(s, prefs) ? 0 : INSTRUMENT_MISS,
    favourite: prefs.favourites.has(s.key) ? -FAVOURITE_PULL : 0,
    listening: -LISTENING_PULL * listeningLean(prefs.listening?.[s.key]),
  };
  if (prev) {
    const dv = (s.valence - prev.valence) / stats.sdV;
    const da = (s.arousal - prev.arousal) / stats.sdA;
    parts.step = CONTINUITY * (dv * dv + da * da);
    if (heading) {
      const forward = dv * heading.v + da * heading.a;
      if (forward < 0) parts.backward = BACKWARD * forward * forward;
    }
    if (prev.bpm && s.bpm) parts.tempo = 0.3 * ((s.bpm - prev.bpm) / 30) ** 2;
  }
  parts.total = Object.values(parts).reduce((a, b) => a + b, 0);
  return parts;
}

// Scores songs by closeness to the planned point, with gentle steps from the
// previous song and no movement back against the path's direction. When
// bounds are given, only pieces between them along the direction qualify.
function pick(catalogue, point, prev, avoid, rng, heading = null, bounds = null, prefs = preferences()) {
  const { songs, stats } = catalogue;
  const scored = [];
  for (const s of songs) {
    if (avoid.ids.has(s.id) || avoid.artists.has(s.artist) || prefs.ruledOut.has(s.key)) continue;
    if (bounds && heading) {
      const x = along(s, heading, stats);
      if (x < bounds.lo || x > bounds.hi) continue;
    }
    const d = cost(s, point, prev, heading, stats, prefs).total;
    if (scored.length < CANDIDATES) {
      scored.push([d, s]);
      scored.sort((x, y) => x[0] - y[0]);
    } else if (d < scored[CANDIDATES - 1][0]) {
      scored[CANDIDATES - 1] = [d, s];
      scored.sort((x, y) => x[0] - y[0]);
    }
  }
  if (!scored.length) return null;
  // Vary only among pieces nearly as close as the best match.
  const pool = scored.filter(([d], rank) => rank < POOL && d <= scored[0][0] + POOL_MARGIN);
  const weights = pool.map((_, rank) => 1 / (1 + rank) ** 2);
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i][1];
  }
  return pool[0][1];
}

export function headingOf(points, stats) {
  const first = points[0];
  const last = points[points.length - 1];
  const v = (last.v - first.v) / stats.sdV;
  const a = (last.a - first.a) / stats.sdA;
  const n = Math.hypot(v, a);
  return n > 1e-6 ? { v: v / n, a: a / n } : null;
}

// Builds a path of songs, one per point, never repeating a song or an artist.
// Pieces passed in keep stay in the path; the whole path is then ordered
// along its direction so it never steps backwards.
export function buildPath(catalogue, points, { rng = Math.random, keep = [], prefs = preferences() } = {}) {
  const heading = headingOf(points, catalogue.stats);
  const path = [...keep];
  const avoid = { ids: new Set(path.map((s) => s.id)), artists: new Set(path.map((s) => s.artist)) };
  for (const point of points.slice(keep.length)) {
    const song = pick(catalogue, point, path[path.length - 1], avoid, rng, heading, null, prefs);
    if (!song) break;
    path.push(song);
    avoid.ids.add(song.id);
    avoid.artists.add(song.artist);
  }
  return forwardOrder(path, heading, catalogue.stats);
}

// Orders a path along its direction so it only moves forward.
function forwardOrder(path, heading, stats) {
  if (!heading) return path;
  return [...path].sort((x, y) => along(x, heading, stats) - along(y, heading, stats));
}

// Swaps one song for another close to the same point. The replacement is
// chosen between its neighbours along the path's direction when possible,
// and the path is reordered afterwards so it still only moves forward.
export function replaceSong(catalogue, path, points, index, skipped, rng = Math.random, prefs = preferences()) {
  const { stats } = catalogue;
  const heading = headingOf(points, stats);
  const others = path.filter((_, i) => i !== index);
  const avoid = {
    ids: new Set([...others.map((s) => s.id), ...skipped]),
    artists: new Set(others.map((s) => s.artist)),
  };
  let bounds = null;
  if (heading) {
    bounds = {
      lo: index > 0 ? along(path[index - 1], heading, stats) : -Infinity,
      hi: index < path.length - 1 ? along(path[index + 1], heading, stats) : Infinity,
    };
  }
  const song = pick(catalogue, points[index], path[index - 1], avoid, rng, heading, bounds, prefs)
    ?? pick(catalogue, points[index], path[index - 1], avoid, rng, heading, null, prefs);
  if (!song) return path;
  const next = [...path];
  next[index] = song;
  return forwardOrder(next, heading, stats);
}

// Measures of how gradual a path is, in catalogue standard deviations:
// the average and largest step between neighbouring pieces, the step
// variation (standard deviation of the steps over their mean; 0 means every
// step is the same size) and the largest tempo change in beats per minute.
export function pathQuality(path, stats) {
  const steps = path.slice(1).map((s, i) => Math.hypot(
    (s.valence - path[i].valence) / stats.sdV,
    (s.arousal - path[i].arousal) / stats.sdA,
  ));
  if (!steps.length) return { steps, averageStep: 0, largestStep: 0, stepVariation: 0, largestTempoChange: 0 };
  const averageStep = steps.reduce((a, b) => a + b, 0) / steps.length;
  const spread = Math.sqrt(steps.reduce((a, b) => a + (b - averageStep) ** 2, 0) / steps.length);
  const tempo = path.slice(1).map((s, i) => (s.bpm && path[i].bpm ? Math.abs(s.bpm - path[i].bpm) : 0));
  return {
    steps,
    averageStep,
    largestStep: Math.max(...steps),
    stepVariation: averageStep > 0 ? spread / averageStep : 0,
    largestTempoChange: Math.max(...tempo),
  };
}

// The optional camera input moves the start point a little; the mood answer
// stays in charge.
const NUDGE = { bright: 0.35, calm: 0, heavy: -0.35 };

export function nudgeStart(start, tone, stats) {
  if (!tone || !(tone in NUDGE)) return start;
  return { ...start, v: start.v + NUDGE[tone] * stats.sdV };
}

// The optional voice input moves mainly the starting energy and, very lightly,
// the starting mood. Scores are the voice model's standardised outputs, capped
// so the mood and energy answers always lead.
const VOICE_ENERGY = 0.4;
const VOICE_MOOD = 0.12;

export function nudgeVoice(start, voice, stats) {
  if (!voice) return start;
  const cap = (x) => Math.max(-1, Math.min(1, x / 1.5));
  return {
    v: start.v + cap(voice.valence) * VOICE_MOOD * stats.sdV,
    a: start.a + cap(voice.arousal) * VOICE_ENERGY * stats.sdA,
  };
}

// A short reason for each piece, from its place in the path.
export function explain(path, i, stats, direction, prefs = preferences()) {
  const notes = [];
  if (prefs.favourites.has(path[i].key)) notes.push("One of your favourites.");
  else if (prefs.instruments.size && prefersInstrument(path[i], prefs)) {
    const match = path[i].instruments.filter((x) => prefs.instruments.has(x)).map((x) => INSTRUMENT_WORDS[x] ?? x);
    notes.push(`Features ${match.length > 1 ? `${match.slice(0, -1).join(", ")} and ${match.at(-1)}` : match[0]}, as you asked.`);
  }
  if (!prefs.favourites.has(path[i].key) && listeningLean(prefs.listening?.[path[i].key]) >= 2 / LISTENING_CAP) {
    notes.push("You often listen to this one to the end.");
  }
  const extra = notes.length ? ` ${notes.join(" ")}` : "";
  return reason(path, i, stats, direction) + extra;
}

function reason(path, i, stats, direction) {
  if (i === 0) return "Chosen to match the mood and energy you described.";
  const prev = path[i - 1];
  const dv = (path[i].valence - prev.valence) / stats.sdV;
  const da = (path[i].arousal - prev.arousal) / stats.sdA;
  const parts = [];
  if (da < -0.15) parts.push("calmer");
  else if (da > 0.15) parts.push("livelier");
  if (dv > 0.15) parts.push("brighter");
  else if (dv < -0.15) parts.push("more reflective");
  const step = parts.length ? `A little ${parts.join(" and ")} than the piece before.` : "A similar feel to the piece before.";
  if (i === path.length - 1 && direction !== "steady") return `${step} This is where the path settles.`;
  return step;
}
