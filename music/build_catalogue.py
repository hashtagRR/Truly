# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 hashtagRR
"""Build the app's music catalogue from MCUD 1.0.

Keeps the songs used in music therapy trials that MCUD marks as having no
lyrics, drops any song whose title or artist matches music/blocklist.txt,
and writes docs/app/music/catalogue.json.

Usage: python music/build_catalogue.py
Needs pandas and openpyxl.
"""
import json
import re
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "docs" / "app" / "music" / "catalogue.json"


def blocklist():
    lines = (ROOT / "music" / "blocklist.txt").read_text().splitlines()
    terms = [line.strip().lower() for line in lines if line.strip() and not line.startswith("#")]
    return re.compile(r"\b(?:" + "|".join(re.escape(t).replace(r"\-", "[- ]?").replace(r"\ ", r"\s+") for t in terms) + r")\b")


def clinical_songs():
    labels = pd.read_excel(DATA / "mcud" / "Song_Emotional_Labels.xlsx")
    usage = pd.read_excel(DATA / "mcud" / "Song_Clinical_Usage.xlsx", usecols=["Song ID", "Lyrics"])
    labels = labels.merge(usage, on="Song ID")
    labels = labels[labels["Lyrics"].astype(str).str.upper().str.strip() == "NO"]
    links = pd.read_excel(DATA / "mcud" / "Song_Source_Links.xlsx")
    tempo = pd.read_excel(DATA / "mcud" / "Song_Acoustic_Features.xlsx", usecols=["Song ID", "BPM"])
    songs = labels.merge(links[["Song ID", "Song Title", "Artist", "Public Source Link"]], on="Song ID")
    songs = songs.merge(tempo.rename(columns={"BPM": "bpm"}), on="Song ID", how="left")
    youtube = songs["Public Source Link"].where(songs["Public Source Link"].astype(str).str.contains("youtu"))
    return pd.DataFrame({
        "title": songs["Song Title"], "artist": songs["Artist"].astype(str).str.split(";").str[0],
        "valence": songs["Valence"], "arousal": songs["Arousal"],
        "bpm": songs["bpm"], "spotify": None, "youtube": youtube, "clinical": 1,
    })


def main():
    songs = clinical_songs()
    songs = songs.dropna(subset=["title", "artist", "valence", "arousal"])
    key = (songs["title"].str.lower().str.strip() + "|" + songs["artist"].str.lower().str.strip())
    songs = songs[~key.duplicated()]
    block = blocklist()
    text = (songs["title"].astype(str) + " " + songs["artist"].astype(str)).str.lower()
    blocked = text.str.contains(block)
    kept = songs[~blocked]

    rows = []
    for r in kept.itertuples(index=False):
        rows.append([
            str(r.title), str(r.artist), round(float(r.valence), 2), round(float(r.arousal), 2),
            None if pd.isna(r.bpm) else round(float(r.bpm)),
            None if pd.isna(r.spotify) else str(r.spotify),
            None if pd.isna(r.youtube) else str(r.youtube),
            int(r.clinical),
        ])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {"fields": ["title", "artist", "valence", "arousal", "bpm", "spotify", "youtube", "clinical"],
               "songs": rows}
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(rows)} songs from {kept['artist'].nunique()} artists, {int(blocked.sum())} blocked, "
          f"{OUT.stat().st_size / 1e3:.0f} kB")


if __name__ == "__main__":
    main()
