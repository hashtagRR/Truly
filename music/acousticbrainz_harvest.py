# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 hashtagRR
"""Fetch AcousticBrainz (CC0) tempo, loudness, key and mood probabilities for MuSe songs.

Usage: python3 -I music/acousticbrainz_harvest.py data/muse/muse_dataset.csv \
           data/acousticbrainz/muse_acousticbrainz.jsonl.gz
"""
import csv
import gzip
import json
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

API = "https://acousticbrainz.org/api/v1"
LOW_FEATURES = "rhythm.bpm;rhythm.danceability;lowlevel.average_loudness;tonal.key_key;tonal.key_scale"
MOODS = ["mood_happy", "mood_sad", "mood_relaxed", "mood_aggressive", "mood_party", "mood_acoustic", "mood_electronic"]
BATCH = 25
lock = threading.Lock()


def fetch(url):
    for attempt in range(8):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                if int(r.headers.get("X-RateLimit-Remaining", "10")) < 5:
                    time.sleep(int(r.headers.get("X-RateLimit-Reset-In", "5")) + 1)
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(int(e.headers.get("X-RateLimit-Reset-In", "10")) + 1)
                continue
            if e.code == 404:
                return {}
            time.sleep(2 ** attempt)
        except (urllib.error.URLError, TimeoutError):
            time.sleep(2 ** attempt)
    return None


def parse(low, high, mbid):
    rec = {"mbid": mbid}
    lo = (low.get(mbid) or {}).get("0")
    if lo:
        rec["bpm"] = lo.get("rhythm", {}).get("bpm")
        rec["danceability"] = lo.get("rhythm", {}).get("danceability")
        rec["loudness"] = lo.get("lowlevel", {}).get("average_loudness")
        rec["key"] = lo.get("tonal", {}).get("key_key")
        rec["scale"] = lo.get("tonal", {}).get("key_scale")
    hi = (high.get(mbid) or {}).get("0")
    if hi:
        hl = hi.get("highlevel", {})
        for m in MOODS:
            if m in hl:
                positive = m.replace("mood_", "")
                rec[m] = hl[m]["all"].get(positive)
    return rec if len(rec) > 1 else None


def work(ids, out, stats):
    q = ";".join(ids)
    low = fetch(f"{API}/low-level?recording_ids={q}&features={LOW_FEATURES}")
    high = fetch(f"{API}/high-level?recording_ids={q}")
    if low is None or high is None:
        with lock:
            stats["failed_batches"].append(ids)
        return
    with lock:
        for mbid in ids:
            rec = parse(low, high, mbid)
            if rec:
                out.write(json.dumps(rec) + "\n")
                stats["found"] += 1
        stats["done"] += len(ids)
        if stats["done"] % 5000 < BATCH:
            print(f"{stats['done']} queried, {stats['found']} found", flush=True)


def main(muse_csv, out_path):
    with open(muse_csv, newline="", encoding="utf-8") as f:
        mbids = sorted({r["mbid"] for r in csv.DictReader(f) if r.get("mbid")})
    print(f"{len(mbids)} MuSe songs with a MusicBrainz ID", flush=True)
    batches = [mbids[i:i + BATCH] for i in range(0, len(mbids), BATCH)]
    stats = {"done": 0, "found": 0, "failed_batches": []}
    with gzip.open(out_path, "wt", encoding="utf-8") as out, ThreadPoolExecutor(8) as pool:
        list(pool.map(lambda b: work(b, out, stats), batches))
    print(f"finished: {stats['done']} queried, {stats['found']} found, {len(stats['failed_batches'])} failed batches")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
