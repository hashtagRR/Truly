# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 hashtagRR
"""Build the time zone to country table the app uses to suggest local helplines.

Source: the IANA time zone database (public domain), files zone.tab and
backward. Writes docs/app/help/timezones.json.

Usage: python3 -I tools/build_timezones.py [TZDB_TAG]
"""
import json
import sys
import urllib.request
from pathlib import Path

TAG = sys.argv[1] if len(sys.argv) > 1 else "2026e"
BASE = f"https://raw.githubusercontent.com/eggert/tz/{TAG}"
OUT = Path(__file__).resolve().parent.parent / "docs" / "app" / "help" / "timezones.json"


def fetch(name):
    with urllib.request.urlopen(f"{BASE}/{name}", timeout=60) as r:
        return r.read().decode("utf-8").splitlines()


def main():
    zones = {}
    for line in fetch("zone.tab"):
        if line and not line.startswith("#"):
            code, _, zone = line.split("\t")[:3]
            zones[zone] = code
    for line in fetch("backward"):
        parts = line.split()
        if len(parts) >= 3 and parts[0] == "Link" and parts[1] in zones:
            zones.setdefault(parts[2], zones[parts[1]])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"source": f"IANA time zone database {TAG}, public domain", "zones": dict(sorted(zones.items()))},
                              separators=(",", ":")))
    print(f"{len(zones)} zones, {OUT.stat().st_size / 1e3:.1f} kB")


if __name__ == "__main__":
    main()
