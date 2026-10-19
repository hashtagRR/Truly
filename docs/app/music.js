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

export async function loadCatalogue(base) {
  const data = await fetch(new URL("tracks.json", base)).then((r) => r.json());
  return makeCatalogue(data, base);
}

export function makeCatalogue(data, base) {
  const songs = data.tracks.map((t, id) => ({
    id,
    key: t.key,
    title: t.title,
    composer: t.composer,
    artist: t.performer,
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

// Scores songs by closeness to the planned point, with gentle steps from the
// previous song and no movement back against the path's direction. When
// bounds are given, only pieces between them along the direction qualify.
function pick(catalogue, point, prev, avoid, rng, heading = null, bounds = null) {
  const { songs, stats } = catalogue;
  const scored = [];
  for (const s of songs) {
    if (avoid.ids.has(s.id) || avoid.artists.has(s.artist)) continue;
    if (bounds && heading) {
      const x = along(s, heading, stats);
      if (x < bounds.lo || x > bounds.hi) continue;
    }
    let d = ((s.valence - point.v) / stats.sdV) ** 2 + ((s.arousal - point.a) / stats.sdA) ** 2;
    if (prev) {
      const dv = (s.valence - prev.valence) / stats.sdV;
      const da = (s.arousal - prev.arousal) / stats.sdA;
      d += CONTINUITY * (dv * dv + da * da);
      if (heading) {
        const along = dv * heading.v + da * heading.a;
        if (along < 0) d += BACKWARD * along * along;
      }
    }
    if (prev?.bpm && s.bpm) d += 0.3 * ((s.bpm - prev.bpm) / 30) ** 2;
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

function headingOf(points, stats) {
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
export function buildPath(catalogue, points, { rng = Math.random, keep = [] } = {}) {
  const heading = headingOf(points, catalogue.stats);
  const path = [...keep];
  const avoid = { ids: new Set(path.map((s) => s.id)), artists: new Set(path.map((s) => s.artist)) };
  for (const point of points.slice(keep.length)) {
    const song = pick(catalogue, point, path[path.length - 1], avoid, rng, heading);
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
export function replaceSong(catalogue, path, points, index, skipped, rng = Math.random) {
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
  const song = pick(catalogue, points[index], path[index - 1], avoid, rng, heading, bounds)
    ?? pick(catalogue, points[index], path[index - 1], avoid, rng, heading);
  if (!song) return path;
  const next = [...path];
  next[index] = song;
  return forwardOrder(next, heading, stats);
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
export function explain(path, i, stats, direction) {
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
