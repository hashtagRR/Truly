# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 hashtagRR
"""Score short voice clips with a non-clinical teacher for distillation.

Teacher: LAION Empathic-Insight-Voice-Small Valence and Arousal heads (CC BY 4.0)
on embeddings from laion/BUD-E-Whisper (CC BY 4.0). Only these two heads are
downloaded; no other attribute is ever computed.

Sources:
  gottalent  LAION's Got Talent synthetic voice acting (Apache-2.0)
  yodas      real speech from the YODAS part of Emolia (CC BY 4.0)
  cremad     CREMA-D actors (ODbL / DbCL), kept for testing, with voice-only votes

Each recording is brought to a common speech loudness, then cut into 5 second
windows at 16 kHz, skipping near silence. The app applies the same loudness
step to microphone audio, so teacher, student and app see consistent input.
Output per source: <source>.npz with int16 audio [N, 80000], teacher valence and
arousal [N, 2] and metadata.
"""
import glob
import io
import json
import os
import random
import re
import tarfile
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import librosa
import numpy as np
import pandas as pd
import soundfile as sf
import torch
from huggingface_hub import hf_hub_download, list_repo_files
from transformers import WhisperFeatureExtractor, WhisperModel

MODE = "smoke"
OUT = "/kaggle/working"
CACHE = "/tmp/hf"
SR = 16000
WINDOW = 5 * SR
MAX_WINDOWS = 3
MIN_RMS = 0.01
TARGET_RMS = 0.05
SEED = 13
ENCODER = "laion/BUD-E-Whisper"
HEADS = "laion/Empathic-Insight-Voice-Small"
GOTTALENT = "laion/laions_got_talent_with_voice_emotion_speed_tags_for_orpheus_tuning"
EMOLIA = "laion/Emolia"
CREMA = "https://media.githubusercontent.com/media/CheyneyComputerScience/CREMA-D/master"
CREMA_RAW = "https://raw.githubusercontent.com/CheyneyComputerScience/CREMA-D/master"
N = ({"gottalent_files": 8, "gottalent_per_file": 1200, "yodas_shards": 2, "yodas_items": 6000, "cremad": None}
     if MODE == "full" else {"gottalent_files": 1, "gottalent_per_file": 40, "yodas_shards": 1, "yodas_items": 40, "cremad": 40})
WORKERS = os.cpu_count() or 4
dev = torch.device("cuda" if torch.cuda.is_available() else "cpu")
rng = random.Random(SEED)


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def to_mono16k(data, sr):
    data = np.asarray(data, dtype=np.float32)
    if data.ndim > 1:
        data = data.mean(axis=1)
    if sr != SR:
        data = librosa.resample(data, orig_sr=sr, target_sr=SR)
    return data


def decode(blob):
    try:
        data, sr = sf.read(io.BytesIO(blob), dtype="float32", always_2d=False)
    except Exception:
        data, sr = librosa.load(io.BytesIO(blob), sr=None, mono=True)
    return to_mono16k(data, sr)


def normalise(wave):
    """Scales the clip so its sounding parts reach TARGET_RMS, without clipping."""
    frames = wave[: len(wave) // 400 * 400].reshape(-1, 400)
    if not len(frames):
        return wave
    rms = np.sqrt((frames ** 2).mean(axis=1))
    loud = rms[rms > max(1e-4, rms.max() * 0.1)]
    if not len(loud):
        return wave
    gain = TARGET_RMS / float(np.sqrt((loud ** 2).mean()))
    peak = float(np.abs(wave).max()) * gain
    if peak > 0.99:
        gain *= 0.99 / peak
    return wave * gain


def windows(wave, max_windows=MAX_WINDOWS):
    """Non-overlapping 5 s windows with enough sound; short clips are zero padded."""
    wave = normalise(wave)
    if len(wave) < WINDOW:
        wave = np.pad(wave, (0, WINDOW - len(wave)))
    starts = list(range(0, len(wave) - WINDOW + 1, WINDOW))
    out = []
    for s in starts:
        w = wave[s:s + WINDOW]
        if float(np.sqrt(np.mean(w ** 2))) >= MIN_RMS:
            out.append(w)
        if len(out) >= max_windows:
            break
    return out


def as_int16(w):
    return (np.clip(w, -1, 1) * 32767).astype(np.int16)


def load_gottalent():
    files = sorted(f for f in list_repo_files(GOTTALENT, repo_type="dataset") if f.endswith(".arrow"))
    chosen = rng.sample(files, N["gottalent_files"])
    clips, meta = [], []
    from datasets import Audio, Dataset
    for f in chosen:
        path = hf_hub_download(GOTTALENT, f, repo_type="dataset", cache_dir=CACHE)
        ds = Dataset.from_file(path).cast_column("audio", Audio(decode=False))
        idx = rng.sample(range(len(ds)), min(N["gottalent_per_file"], len(ds)))
        for i in idx:
            row = ds[i]
            try:
                wave = decode(row["audio"]["bytes"])
            except Exception:
                continue
            for w in windows(wave, max_windows=1):
                clips.append(as_int16(w))
                meta.append({"emotion": row.get("emotion"), "language": row.get("language_code"), "voice": row.get("voice")})
        os.remove(path)
    return clips, meta


AUDIO_EXT = (".mp3", ".flac", ".wav", ".opus", ".ogg", ".m4a")


def load_yodas():
    files = sorted(f for f in list_repo_files(EMOLIA, repo_type="dataset") if f.startswith("EN-") and f.endswith("_yodas.tar.gz"))
    chosen = rng.sample(files, N["yodas_shards"])
    clips, meta = [], []
    per_shard = N["yodas_items"] // len(chosen)
    for f in chosen:
        path = hf_hub_download(EMOLIA, f, repo_type="dataset", cache_dir=CACHE)
        taken = 0
        with tarfile.open(path, "r:gz") as tf:
            for m in tf:
                if not m.isfile() or not m.name.lower().endswith(AUDIO_EXT):
                    continue
                try:
                    wave = decode(tf.extractfile(m).read())
                except Exception:
                    continue
                for w in windows(wave, max_windows=1):
                    clips.append(as_int16(w))
                    meta.append({"shard": f, "item": os.path.basename(m.name)})
                taken += 1
                if taken >= per_shard:
                    break
        os.remove(path)
    return clips, meta


def load_cremad():
    table = pd.read_csv(io.StringIO(urllib.request.urlopen(f"{CREMA_RAW}/processedResults/summaryTable.csv", timeout=60).read().decode()))
    table = table[table["VoiceVote"].isin(list("ADFHNS"))].reset_index(drop=True)
    if N["cremad"]:
        table = table.sample(N["cremad"], random_state=SEED).reset_index(drop=True)

    def fetch(name):
        for attempt in range(4):
            try:
                with urllib.request.urlopen(f"{CREMA}/AudioWAV/{name}.wav", timeout=60) as r:
                    return r.read()
            except OSError:
                time.sleep(2 ** attempt)
        return None

    with ThreadPoolExecutor(32) as pool:
        blobs = list(pool.map(fetch, table["FileName"]))
    clips, meta = [], []
    for row, blob in zip(table.to_dict("records"), blobs):
        if blob is None:
            continue
        wave = decode(blob)
        w = windows(wave, max_windows=1)
        if not w:
            continue
        clips.append(as_int16(w[0]))
        meta.append({"clip": row["FileName"], "actor": row["FileName"][:4], "voice_vote": row["VoiceVote"],
                     "voice_level": float(row["VoiceLevel"])})
    return clips, meta


class Head(torch.nn.Module):
    """The Empathic-Insight-Voice-Small regression head (full embedding variant)."""

    def __init__(self, seq_len=1500, embed_dim=768, proj=64, hidden=(64, 32, 16)):
        super().__init__()
        self.flatten = torch.nn.Flatten()
        self.proj = torch.nn.Linear(seq_len * embed_dim, proj)
        layers, d = [torch.nn.ReLU(), torch.nn.Dropout(0.0)], proj
        for h in hidden:
            layers += [torch.nn.Linear(d, h), torch.nn.ReLU(), torch.nn.Dropout(0.1)]
            d = h
        layers.append(torch.nn.Linear(d, 1))
        self.mlp = torch.nn.Sequential(*layers)

    def forward(self, x):
        return self.mlp(self.proj(self.flatten(x)))


def load_heads():
    heads = {}
    for name in ("Valence", "Arousal"):
        path = hf_hub_download(HEADS, f"model_{name}_best.pth", cache_dir=CACHE)
        head = Head()
        state = torch.load(path, map_location="cpu")
        if isinstance(state, dict) and "state_dict" in state:
            state = state["state_dict"]
        head.load_state_dict({k.replace("module.", "").replace("_orig_mod.", ""): v for k, v in state.items()})
        heads[name] = head.to(dev).eval()
    return heads


@torch.no_grad()
def score(clips, extractor, encoder, heads, batch=16):
    out = []
    for i in range(0, len(clips), batch):
        waves = [c.astype(np.float32) / 32767 for c in clips[i:i + batch]]
        feats = extractor(waves, sampling_rate=SR, return_tensors="pt").input_features.to(dev, torch.float16)
        emb = encoder(feats).last_hidden_state.float()
        out.append(torch.cat([heads["Valence"](emb), heads["Arousal"](emb)], dim=1).cpu().numpy())
    return np.concatenate(out) if out else np.zeros((0, 2), np.float32)


def main():
    t0 = time.time()
    log(f"mode={MODE} device={dev} gpus={torch.cuda.device_count()} workers={WORKERS}")
    extractor = WhisperFeatureExtractor.from_pretrained(ENCODER, cache_dir=CACHE)
    encoder = WhisperModel.from_pretrained(ENCODER, cache_dir=CACHE, dtype=torch.float16).get_encoder().to(dev).eval()
    heads = load_heads()
    log("teacher loaded: BUD-E-Whisper encoder with Valence and Arousal heads")
    summary = {}
    for name, loader in [("cremad", load_cremad), ("gottalent", load_gottalent), ("yodas", load_yodas)]:
        ts = time.time()
        clips, meta = loader()
        log(f"{name}: {len(clips)} windows loaded in {time.time() - ts:.0f}s")
        ts = time.time()
        va = score(clips, extractor, encoder, heads)
        rate = len(clips) / max(time.time() - ts, 1e-6)
        np.savez_compressed(f"{OUT}/{name}.npz", audio=np.stack(clips) if clips else np.zeros((0, WINDOW), np.int16),
                            teacher=va.astype(np.float32), meta=np.array([json.dumps(m) for m in meta]))
        summary[name] = {"windows": len(clips), "teacher_clips_per_s": round(rate, 1),
                         "valence_mean": float(va[:, 0].mean()) if len(va) else None,
                         "arousal_mean": float(va[:, 1].mean()) if len(va) else None}
        log(f"{name}: scored at {rate:.1f} clips/s; valence mean {summary[name]['valence_mean']}, arousal mean {summary[name]['arousal_mean']}")
        if name == "cremad" and len(va):
            votes = pd.Series([m["voice_vote"] for m in meta])
            by = pd.DataFrame({"vote": votes, "valence": va[:, 0], "arousal": va[:, 1]}).groupby("vote").mean().round(3)
            log("cremad teacher means by voice vote:\n" + by.to_string())
            summary[name]["by_vote"] = by.to_dict()
    json.dump({"mode": MODE, "sources": summary, "minutes": round((time.time() - t0) / 60, 1)},
              open(f"{OUT}/voice_teacher_meta.json", "w"), indent=2)
    log(f"done in {(time.time() - t0) / 60:.1f} min")


if __name__ == "__main__":
    main()
