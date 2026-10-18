# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 hashtagRR
"""Prepare the Truly-music repository from music/recordings.json.

Downloads each recording from Wikimedia Commons into data/music-src/, converts
it to a 96 kbps MP3 with matched loudness, and writes into OUT_DIR:

    audio/<key>.mp3   the recordings
    tracks.json       title, credits, licence and the valence, arousal and
                      tempo averaged from the MCUD songs each recording stands for
    CREDITS.md        attribution for every recording

Usage: python music/prepare_audio.py OUT_DIR [--ffmpeg PATH]
Needs pandas and openpyxl, and ffmpeg with ffprobe next to it.
"""
import argparse
import json
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "music-src"
UA = {"User-Agent": "Truly music catalogue (52541122+hashtagRR@users.noreply.github.com)"}
LICENCES = {
    "Public domain": "https://creativecommons.org/publicdomain/mark/1.0/",
    "CC0": "https://creativecommons.org/publicdomain/zero/1.0/",
    "CC BY 3.0": "https://creativecommons.org/licenses/by/3.0/",
    "CC BY 4.0": "https://creativecommons.org/licenses/by/4.0/",
    "CC BY-SA 2.0": "https://creativecommons.org/licenses/by-sa/2.0/",
    "CC BY-SA 3.0": "https://creativecommons.org/licenses/by-sa/3.0/",
    "CC BY-SA 4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
}


def download(rec):
    url = rec["file"].split("?")[0]
    dest = SRC / (rec["key"] + Path(url).suffix)
    for attempt in range(6):
        if dest.exists():
            break
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r:
                dest.write_bytes(r.read())
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
            time.sleep(int(e.headers.get("Retry-After", "30")) + 2 ** attempt)
        time.sleep(2)
    return dest


def convert(ffmpeg, src, dest):
    subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", str(src), "-vn", "-ac", "2", "-ar", "44100",
                    "-af", "loudnorm=I=-18:TP=-1.5:LRA=11", "-b:a", "96k", "-map_metadata", "-1", str(dest)], check=True)


def duration(ffprobe, path):
    out = subprocess.run([ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return round(float(out))


def mood():
    labels = pd.read_excel(ROOT / "data" / "mcud" / "Song_Emotional_Labels.xlsx", usecols=["Song ID", "Valence", "Arousal"])
    tempo = pd.read_excel(ROOT / "data" / "mcud" / "Song_Acoustic_Features.xlsx", usecols=["Song ID", "BPM"])
    return labels.merge(tempo, on="Song ID", how="left").set_index("Song ID")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out_dir", type=Path)
    ap.add_argument("--ffmpeg", default="ffmpeg")
    args = ap.parse_args()
    ffprobe = str(Path(args.ffmpeg).with_name("ffprobe")) if "/" in args.ffmpeg else "ffprobe"

    recs = json.loads((ROOT / "music" / "recordings.json").read_text())["recordings"]
    SRC.mkdir(parents=True, exist_ok=True)
    (args.out_dir / "audio").mkdir(parents=True, exist_ok=True)
    sources = [download(rec) for rec in recs]
    print(f"downloaded {len(sources)} recordings")

    m = mood()
    tracks = []
    for rec, src in zip(recs, sources):
        dest = args.out_dir / "audio" / f"{rec['key']}.mp3"
        convert(args.ffmpeg, src, dest)
        rows = m.loc[rec["mcud"]]
        tracks.append({
            "key": rec["key"], "title": rec["title"], "composer": rec["composer"], "performer": rec["performer"],
            "audio": f"audio/{rec['key']}.mp3", "seconds": duration(ffprobe, dest),
            "valence": round(float(rows["Valence"].mean()), 2), "arousal": round(float(rows["Arousal"].mean()), 2),
            "bpm": None if rows["BPM"].isna().all() else round(float(rows["BPM"].mean())),
            "licence": rec["licence"], "licence_url": LICENCES[rec["licence"]], "source": rec["source"], "mcud": rec["mcud"],
        })
        print(f"  {rec['key']}: {tracks[-1]['seconds']}s, {dest.stat().st_size / 1e6:.1f} MB")

    (args.out_dir / "tracks.json").write_text(json.dumps({
        "description": "Freely licensed recordings of public domain works from MCUD 1.0, a published dataset of music used in studies. Valence, arousal and tempo are averaged from MCUD 1.0 (Du et al., 2026, CC BY 4.0).",
        "tracks": tracks}, indent=2, ensure_ascii=False) + "\n")
    lines = ["# Credits", "",
             "Each recording keeps its own licence. The recordings were converted to 96 kbps MP3 and their loudness was evened out; nothing else was changed. Valence, arousal and tempo come from MCUD 1.0 (Du et al., 2026, CC BY 4.0).", "",
             "| Recording | Composer | Performer | Licence | Source |", "|---|---|---|---|---|"]
    for t in tracks:
        lines.append(f"| {t['title']} | {t['composer']} | {t['performer']} | [{t['licence']}]({t['licence_url']}) | [Wikimedia Commons]({t['source']}) |")
    (args.out_dir / "CREDITS.md").write_text("\n".join(lines) + "\n")
    total = sum((args.out_dir / t["audio"]).stat().st_size for t in tracks) / 1e6
    print(f"{len(tracks)} tracks, {total:.0f} MB of audio")


if __name__ == "__main__":
    main()
