// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 hashtagRR

// Check-in history, kept only in this browser.

const KEY = "truly.checkins.v1";
const COUNTRY_KEY = "truly.country.v1";

export function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function add(entry) {
  const all = load();
  all.push(entry);
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

export function clear() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(COUNTRY_KEY);
  } catch {
    // Nothing stored, or storage blocked: nothing to remove.
  }
}

// A country the person chose themselves, kept only in this browser.
export function chosenCountry() {
  try {
    return localStorage.getItem(COUNTRY_KEY);
  } catch {
    return null;
  }
}

export function chooseCountry(code) {
  try {
    if (code) localStorage.setItem(COUNTRY_KEY, code);
    else localStorage.removeItem(COUNTRY_KEY);
  } catch {
    // Storage blocked: the choice lasts for this visit only.
  }
}

export function exportFile() {
  const blob = new Blob([JSON.stringify(load(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `truly-checkins-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
