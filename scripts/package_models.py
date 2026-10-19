# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 hashtagRR
"""Packs the Truly face and voice models for a release.

Writes build/release/truly-models-<version>.zip with the ONNX weights, their
readout settings, model cards and licence notice. The weights are licensed
under CC BY 4.0; the code that uses them is AGPL-3.0-or-later.

    python scripts/package_models.py 0.1.0
"""
import hashlib
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = {
    "face/truly-face-v1.onnx": "docs/app/models/truly-face-v1.onnx",
    "face/readout.json": "docs/app/models/truly-face-v1-readout.json",
    "face/MODEL_CARD.md": "models/face/MODEL_CARD.md",
    "voice/truly-voice-v1.onnx": "docs/app/models/truly-voice-v1.onnx",
    "voice/readout.json": "docs/app/models/truly-voice-v1-readout.json",
    "voice/MODEL_CARD.md": "models/voice/MODEL_CARD.md",
    "NOTICE.md": "docs/app/models/NOTICE.md",
}
README = """# Truly models {version}

Truly face model v1 and Truly voice model v1, as used by the Truly web app.
Each folder holds the ONNX weights, the readout settings that turn the model
output into the values the app uses, and the model card.

The weights are licensed under the Creative Commons Attribution 4.0
International licence (https://creativecommons.org/licenses/by/4.0/). They
were distilled from LAION models released under the same licence; see
NOTICE.md and the model cards for attribution.

The models are not designed or intended for medical, diagnostic,
psychological assessment, therapeutic or clinical purposes.

Source code: https://github.com/hashtagRR/Truly

SHA-256:
{sums}
"""


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: python scripts/package_models.py VERSION")
    version = sys.argv[1]
    out = ROOT / "build" / "release" / f"truly-models-{version}.zip"
    out.parent.mkdir(parents=True, exist_ok=True)
    sums = []
    for name, src in FILES.items():
        path = ROOT / src
        if not path.is_file():
            sys.exit(f"missing: {src}")
        sums.append(f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {name}")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("README.md", README.format(version=version, sums="\n".join(sums)))
        for name, src in FILES.items():
            z.write(ROOT / src, name)
    print(f"{out.relative_to(ROOT)}: {out.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
