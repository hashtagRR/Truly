#!/usr/bin/env bash
# Build the private Kaggle input dataset <USER>/truly-inputs and
# create it, or publish a new version if it exists.
#
# Contents: the original Keras CNN (from legacy/), FER+ labels with their MIT
# licence (from data/ferplus/), and mappings/emonet_categories.json.
#
# Usage: training/kaggle_inputs.sh USER [VERSION_MESSAGE]
# Credentials: KAGGLE_CONFIG_DIR and KAGGLE_API_TOKEN for USER must be set.
set -euo pipefail

user=${1:?kaggle user}
message=${2:-Update inputs}
here=$(cd "$(dirname "$0")" && pwd)
root=$(dirname "$here")
kaggle="${KAGGLE_BIN:-kaggle}"
out="$root/build/kaggle-inputs/$user"
rm -rf "$out"
mkdir -p "$out"

python3 -I - "$root/legacy/Face Emotion Recognition.zip" "$out" <<'EOF'
import sys
import zipfile

archive, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(archive) as z:
    for name in ("emotion_model.h5", "emotion_model.json"):
        with open(f"{out}/{name}", "wb") as f:
            f.write(z.read(f"Face Emotion Recognition/{name}"))
EOF
cp "$root/data/ferplus/fer2013new.csv" "$root/data/ferplus/LICENSE.md" "$out/"
cp "$root/mappings/emonet_categories.json" "$out/"
cat > "$out/dataset-metadata.json" <<EOF
{"title": "truly-inputs", "id": "$user/truly-inputs", "licenses": [{"name": "other"}]}
EOF

if "$kaggle" datasets status "$user/truly-inputs" >/dev/null 2>&1; then
    "$kaggle" datasets version -p "$out" -m "$message"
else
    "$kaggle" datasets create -p "$out"
fi
