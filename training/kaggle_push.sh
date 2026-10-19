#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 hashtagRR
# Push a training script to Kaggle as a private kernel.
#
# Usage: training/kaggle_push.sh SCRIPT USER [MODE]
#   SCRIPT  name in training/kernels without .json, e.g. face_distill
#   USER    Kaggle username that owns the kernel and its private inputs
#   MODE    smoke or full; replaces the MODE line in the pushed copy only
#
# Credentials: KAGGLE_CONFIG_DIR and KAGGLE_API_TOKEN for USER must be set.
# KAGGLE_BIN overrides the kaggle executable.
set -euo pipefail

script=${1:?script name}
user=${2:?kaggle user}
mode=${3:-}
here=$(cd "$(dirname "$0")" && pwd)
root=$(dirname "$here")
template="$here/kernels/$script.json"
[ -f "$template" ] || { echo "no kernel template: $template" >&2; exit 1; }

out="$root/build/kernels/$script-$user"
rm -rf "$out"
mkdir -p "$out"
sed "s#{user}#$user#g" "$template" > "$out/kernel-metadata.json"
cp "$here/$script.py" "$out/"
if [ -n "$mode" ]; then
    case "$mode" in smoke|full) ;; *) echo "mode must be smoke or full" >&2; exit 1 ;; esac
    grep -q '^MODE = ' "$out/$script.py" || { echo "$script.py has no MODE line" >&2; exit 1; }
    sed -i "s/^MODE = .*/MODE = \"$mode\"/" "$out/$script.py"
fi
grep -n '^MODE = ' "$out/$script.py" || true
# A GPU kernel without a named accelerator gets Kaggle's default T4 x2, which
# can queue for a long time; the templates name a single P100 instead.
accelerator=$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1])).get("machine_shape") or "")' "$out/kernel-metadata.json")
if [ -n "$accelerator" ]; then
    "${KAGGLE_BIN:-kaggle}" kernels push -p "$out" --accelerator "$accelerator"
else
    "${KAGGLE_BIN:-kaggle}" kernels push -p "$out"
fi
