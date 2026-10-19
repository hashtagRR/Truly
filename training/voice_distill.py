# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 hashtagRR
"""Distil the voice teacher into a small model that runs in the browser.

Input: 5 seconds of 16 kHz mono audio, already brought to a common speech
loudness (the app does the same). The model computes a log-mel spectrogram
with fixed convolution layers, so the whole thing exports to ONNX, then a
small CNN predicts two values: arousal (energy) and valence (mood), on the
teacher's scale.

Training data: teacher output from truly-voice-teacher (LAION's Got Talent,
Emolia YODAS, and CREMA-D actors with even ids). Test: CREMA-D actors with
odd ids. No audio is transcribed and no other attribute is learned.
"""
import glob
import json
import os
import random
import time

import librosa
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset

MODE = "smoke"
OUT = "/kaggle/working"
SEED = 13
SR = 16000
N_FFT = 400
HOP = 160
N_MELS = 64
EPOCHS = 1 if MODE == "smoke" else 30
BATCH = 64
LR = 2e-3
WORKERS = os.cpu_count() or 4
TARGETS = ["valence", "arousal"]
VOTES = ["A", "D", "F", "H", "N", "S"]

random.seed(SEED)
np.random.seed(SEED)
torch.manual_seed(SEED)
dev = torch.device("cuda" if torch.cuda.is_available() else "cpu")
log_lines = []


def log(msg):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    log_lines.append(line)


def find(name):
    hits = glob.glob(f"/kaggle/input/**/{name}", recursive=True)
    if not hits:
        raise FileNotFoundError(name)
    return hits[0]


class LogMel(nn.Module):
    """Log-mel spectrogram from fixed DFT and mel matrices, exportable to ONNX."""

    def __init__(self):
        super().__init__()
        n = np.arange(N_FFT)
        window = np.hanning(N_FFT + 1)[:-1]
        freqs = np.arange(N_FFT // 2 + 1)
        angle = 2 * np.pi * np.outer(freqs, n) / N_FFT
        cos = (np.cos(angle) * window).astype(np.float32)
        sin = (-np.sin(angle) * window).astype(np.float32)
        self.register_buffer("dft", torch.from_numpy(np.concatenate([cos, sin]))[:, None, :])
        mel = librosa.filters.mel(sr=SR, n_fft=N_FFT, n_mels=N_MELS, fmin=50, fmax=SR // 2).astype(np.float32)
        self.register_buffer("mel", torch.from_numpy(mel))

    def forward(self, audio):
        spec = F.conv1d(audio[:, None, :], self.dft, stride=HOP)
        half = spec.shape[1] // 2
        power = spec[:, :half] ** 2 + spec[:, half:] ** 2
        logmel = torch.log(torch.matmul(self.mel, power) + 1e-6)
        mean = logmel.mean(dim=(1, 2), keepdim=True)
        std = logmel.std(dim=(1, 2), keepdim=True) + 1e-5
        return ((logmel - mean) / std)[:, None]


def block(cin, cout):
    return nn.Sequential(nn.Conv2d(cin, cout, 3, padding=1, bias=False), nn.BatchNorm2d(cout), nn.ReLU(),
                         nn.Conv2d(cout, cout, 3, padding=1, bias=False), nn.BatchNorm2d(cout), nn.ReLU(),
                         nn.MaxPool2d(2))


class VoiceNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.frontend = LogMel()
        self.body = nn.Sequential(block(1, 24), block(24, 48), block(48, 96), block(96, 128))
        self.head = nn.Sequential(nn.Dropout(0.2), nn.Linear(128, 2))

    def forward(self, audio):
        x = self.body(self.frontend(audio))
        return self.head(x.mean(dim=(2, 3)))


class Clips(Dataset):
    def __init__(self, audio, targets=None, train=False):
        self.audio, self.targets, self.train = audio, targets, train

    def __len__(self):
        return len(self.audio)

    def __getitem__(self, i):
        x = self.audio[i].astype(np.float32) / 32767
        if self.train:
            x = np.roll(x, random.randint(-SR // 2, SR // 2))
            x = x * random.uniform(0.5, 1.6)
            if random.random() < 0.7:
                noise = np.random.randn(len(x)).astype(np.float32)
                snr = random.uniform(15, 40)
                x = x + noise * (np.sqrt((x ** 2).mean() + 1e-9) / 10 ** (snr / 20))
            x = np.clip(x, -1, 1)
        x = torch.from_numpy(x)
        return x if self.targets is None else (x, torch.from_numpy(self.targets[i]))


def load(name):
    d = np.load(find(f"{name}.npz"))
    return d["audio"], d["teacher"].astype(np.float32), [json.loads(m) for m in d["meta"]]


@torch.no_grad()
def predict(model, audio, t_mean, t_std):
    model.eval()
    out = []
    for x in DataLoader(Clips(audio), batch_size=256, num_workers=WORKERS):
        out.append(model(x.to(dev)).float().cpu().numpy())
    return np.concatenate(out) * t_std + t_mean


def corr(a, b):
    return float(np.corrcoef(a, b)[0, 1]) if len(a) > 2 else float("nan")


def main():
    t0 = time.time()
    gpu = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "none"
    log(f"mode={MODE} device={dev} gpu={gpu} workers={WORKERS} torch={torch.__version__}")
    g_audio, g_t, _ = load("gottalent")
    y_audio, y_t, _ = load("yodas")
    c_audio, c_t, c_meta = load("cremad")
    actor = np.array([int(m["actor"]) for m in c_meta])
    votes = np.array([m["voice_vote"] for m in c_meta])
    c_train, c_test = actor % 2 == 0, actor % 2 == 1
    audio = np.concatenate([g_audio, y_audio, c_audio[c_train]])
    teacher = np.concatenate([g_t, y_t, c_t[c_train]])
    if MODE == "smoke":
        keep = np.random.permutation(len(audio))[:600]
        audio, teacher = audio[keep], teacher[keep]
    t_mean, t_std = teacher.mean(0), teacher.std(0) + 1e-6
    target = (teacher - t_mean) / t_std
    order = np.random.permutation(len(audio))
    n_val = max(200, len(audio) // 20)
    val_i, tr_i = order[:n_val], order[n_val:]
    log(f"train {len(tr_i)}, validation {len(val_i)}, test (CREMA-D odd actors) {int(c_test.sum())}")

    train_dl = DataLoader(Clips(audio[tr_i], target[tr_i], train=True), batch_size=BATCH, shuffle=True,
                          num_workers=WORKERS, drop_last=True, persistent_workers=True)
    val_dl = DataLoader(Clips(audio[val_i], target[val_i]), batch_size=256, num_workers=WORKERS)
    model = VoiceNet().to(dev)
    log(f"parameters: {sum(p.numel() for p in model.parameters() if p.requires_grad):,}")
    opt = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=0.01)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=LR, total_steps=EPOCHS * len(train_dl), pct_start=0.15)
    best, history = float("inf"), []
    for epoch in range(EPOCHS):
        model.train()
        total, steps = 0.0, 0
        for x, y in train_dl:
            loss = F.smooth_l1_loss(model(x.to(dev)), y.to(dev))
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            sched.step()
            total, steps = total + loss.item(), steps + 1
        model.eval()
        vl, vn = 0.0, 0
        with torch.no_grad():
            for x, y in val_dl:
                vl += F.smooth_l1_loss(model(x.to(dev)), y.to(dev), reduction="sum").item() / 2
                vn += len(x)
        vl /= vn
        history.append({"epoch": epoch + 1, "train_loss": total / steps, "val_loss": vl})
        log(f"epoch {epoch + 1}/{EPOCHS} train_loss={total / steps:.4f} val_loss={vl:.4f}")
        if vl < best:
            best = vl
            torch.save(model.state_dict(), f"{OUT}/voice_student.pt")
    model.load_state_dict(torch.load(f"{OUT}/voice_student.pt", map_location=dev))

    report = {"mode": MODE, "history": history, "targets": TARGETS}
    val_pred = predict(model, audio[val_i], t_mean, t_std)
    val_true = teacher[val_i]
    report["validation_correlation"] = {t: corr(val_pred[:, k], val_true[:, k]) for k, t in enumerate(TARGETS)}
    test_pred = predict(model, c_audio[c_test], t_mean, t_std)
    report["cremad_test_correlation_with_teacher"] = {t: corr(test_pred[:, k], c_t[c_test][:, k]) for k, t in enumerate(TARGETS)}
    report["cremad_test_means_by_vote"] = {
        who: {v: {t: float(src[votes[c_test] == v][:, k].mean()) for k, t in enumerate(TARGETS)}
              for v in VOTES if (votes[c_test] == v).any()}
        for who, src in (("student", test_pred), ("teacher", c_t[c_test]))}
    log(f"validation correlation with teacher: {report['validation_correlation']}")
    log(f"CREMA-D test correlation with teacher: {report['cremad_test_correlation_with_teacher']}")
    for who in ("student", "teacher"):
        means = report["cremad_test_means_by_vote"][who]
        log(f"{who} arousal by vote: " + ", ".join(f"{v} {means[v]['arousal']:.2f}" for v in means))
        log(f"{who} valence by vote: " + ", ".join(f"{v} {means[v]['valence']:.3f}" for v in means))

    json.dump({"targets": TARGETS, "target_mean": t_mean.tolist(), "target_std": t_std.tolist(), "sample_rate": SR,
               "seconds": 5, "input": "mono float32 audio in [-1, 1], brought to speech RMS 0.05"},
              open(f"{OUT}/voice_student_readout.json", "w"), indent=2)
    model.eval().cpu()
    export = dict(input_names=["audio"], output_names=["scores"], opset_version=17,
                  dynamic_axes={"audio": {0: "batch"}, "scores": {0: "batch"}})
    try:
        try:
            torch.onnx.export(model, torch.zeros(1, 5 * SR), f"{OUT}/voice_student.onnx", dynamo=False, **export)
        except TypeError:
            torch.onnx.export(model, torch.zeros(1, 5 * SR), f"{OUT}/voice_student.onnx", **export)
        report["onnx_mb"] = round(os.path.getsize(f"{OUT}/voice_student.onnx") / 1e6, 2)
        log(f"onnx export: {report['onnx_mb']} MB")
    except Exception as e:  # export problems must not lose the trained weights
        log(f"onnx export failed: {e!r}")
    report["minutes"] = round((time.time() - t0) / 60, 1)
    json.dump(report, open(f"{OUT}/voice_student_metrics.json", "w"), indent=2)
    open(f"{OUT}/voice_distill.log", "w").write("\n".join(log_lines) + "\n")
    log(f"done in {report['minutes']} min")


if __name__ == "__main__":
    main()
