// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 hashtagRR

// Safety layer rules. Pure functions, no browser APIs.

const DAY_MS = 24 * 60 * 60 * 1000;

// True when low self-reported mood persists: enough of the most recent
// check-ins within the window report a low feeling. Self-report is always
// required; no model output can trigger the prompt on its own.
export function persistentLow(entries, rules, now = Date.now()) {
  const since = now - rules.window_days * DAY_MS;
  const recent = entries
    .filter((e) => Date.parse(e.at) >= since)
    .slice(-rules.recent_checkins);
  const low = recent.filter((e) => e.feeling <= rules.low_feeling_at_most).length;
  return low >= rules.low_checkins_needed;
}

// Country from the device's time zone, falling back to the region in the
// browser language (for example en-GB). Nothing is sent anywhere.
export function guessCountry(timeZone, languages, zones) {
  if (timeZone && zones[timeZone]) return zones[timeZone];
  for (const lang of languages || []) {
    const region = lang.split("-")[1];
    if (region && /^[A-Za-z]{2}$/.test(region)) return region.toUpperCase();
  }
  return null;
}
