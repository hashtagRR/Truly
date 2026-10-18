// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 hashtagRR

// Music paths following the iso principle: start close to how the person
// feels, then move a little at a time towards a calmer or brighter place.
// Pure functions apart from loadCatalogue.

const LEVELS = [0.08, 0.25, 0.5, 0.75, 0.92];
const CANDIDATES = 8;
const CONTINUITY = 0.35;
const BACKWARD = 1.0;

export async function loadCatalogue(url) {
  const data = await fetch(url).then((r) => r.json());
  return makeCatalogue(data);
}

export function makeCatalogue(data) {
  const at = Object.fromEntries(data.fields.map((f, i) => [f, i]));
  const songs = data.songs.map((row, id) => ({
    id,
    title: row[at.title],
    artist: row[at.artist],
    valence: row[at.valence],
    arousal: row[at.arousal],
    bpm: row[at.bpm],
    spotify: row[at.spotify],
    youtube: row[at.youtube],
    clinical: row[at.clinical] === 1,
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

// Targets sit where music therapy playlists sit: calm and moderately positive.
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

// Scores songs by closeness to the planned point, with gentle steps from the
// previous song and no movement back against the path's direction.
function pick(catalogue, point, prev, avoid, rng, heading = null) {
  const { songs, stats } = catalogue;
  const scored = [];
  for (const s of songs) {
    if (avoid.ids.has(s.id) || avoid.artists.has(s.artist)) continue;
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
    if (s.clinical) d -= 0.05;
    if (scored.length < CANDIDATES) {
      scored.push([d, s]);
      scored.sort((x, y) => x[0] - y[0]);
    } else if (d < scored[CANDIDATES - 1][0]) {
      scored[CANDIDATES - 1] = [d, s];
      scored.sort((x, y) => x[0] - y[0]);
    }
  }
  if (!scored.length) return null;
  const weights = scored.map((_, rank) => 1 / (1 + rank));
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < scored.length; i++) {
    r -= weights[i];
    if (r <= 0) return scored[i][1];
  }
  return scored[0][1];
}

// Builds a path of songs, one per point, never repeating a song or an artist.
function headingOf(points, stats) {
  const first = points[0];
  const last = points[points.length - 1];
  const v = (last.v - first.v) / stats.sdV;
  const a = (last.a - first.a) / stats.sdA;
  const n = Math.hypot(v, a);
  return n > 1e-6 ? { v: v / n, a: a / n } : null;
}

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
  return path;
}

// Swaps one song for another close to the same point.
export function replaceSong(catalogue, path, points, index, skipped, rng = Math.random) {
  const others = path.filter((_, i) => i !== index);
  const avoid = {
    ids: new Set([...others.map((s) => s.id), ...skipped]),
    artists: new Set(others.map((s) => s.artist)),
  };
  const song = pick(catalogue, points[index], path[index - 1], avoid, rng, headingOf(points, catalogue.stats));
  if (!song) return path;
  const next = [...path];
  next[index] = song;
  return next;
}

export function songLinks(song) {
  const links = [];
  if (song.spotify) links.push({ label: "Open in Spotify", href: `https://open.spotify.com/track/${song.spotify}` });
  const query = encodeURIComponent(`${song.artist} ${song.title}`);
  links.push({ label: "Find on YouTube", href: song.youtube || `https://www.youtube.com/results?search_query=${query}` });
  return links;
}
