# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 hashtagRR
"""Distil the LAION face teacher into a small on-device model.

Student: EfficientNet-B0, trained to reproduce the teacher's 40 raw scores on
FairFace, EmoNet-Face Big and EmoNet-Face Binary images (teacher output from
truly-face-teacher). No FER-2013 image or label is used for training or
calibration.

Readout to the 7 FER classes: mean raw score per class group from
emonet_categories.json, neutral = minus the highest emotional group mean.
Calibration: per-class offsets fitted on CREMA-D actors with even ids (surprise
is not in CREMA-D and keeps offset 0). Test: CREMA-D odd actors, FER-2013
PublicTest and PrivateTest (original and FER+ labels), EmoNet-Face HQ.
"""
import ast
import glob
import io
import json
import os
import random
import time

import numpy as np
import pandas as pd
import timm
import torch
import torch.nn.functional as F
from huggingface_hub import snapshot_download
from PIL import Image
from scipy.stats import spearmanr
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, roc_auc_score
from torch.utils.data import DataLoader, Dataset

MODE = "smoke"
OUT = "/kaggle/working"
CACHE = "/tmp/hf"
SEED = 13
ARCH = "efficientnet_b0.ra_in1k"
SIZE = 224
EPOCHS = 1 if MODE == "smoke" else 8
BATCH = 128
LR = 1e-3
WORKERS = os.cpu_count() or 4
TRAIN_SOURCES = ["fairface", "big", "binary"]
FER = ["angry", "disgust", "fear", "happy", "neutral", "sad", "surprise"]
NEUTRAL = FER.index("neutral")
CREMA_TO_FER = {"A": 0, "D": 1, "F": 2, "H": 3, "N": 4, "S": 5}
FER_TO_IDX = {0: 0, 1: 1, 2: 2, 3: 3, 4: 5, 5: 6, 6: 4}
FERPLUS = {"anger": 0, "disgust": 1, "fear": 2, "happiness": 3, "neutral": 4, "sadness": 5, "surprise": 6}
FERPLUS_COLS = ["neutral", "happiness", "surprise", "sadness", "anger", "disgust", "fear", "contempt", "unknown", "NF"]
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

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


mapping = json.load(open(find("emonet_categories.json")))
CATS = sorted(mapping["categories"])
CAT_IDX = {c: i for i, c in enumerate(CATS)}
ALIASES = mapping.get("aliases", {})
GROUPS = [[CAT_IDX[c] for c, v in mapping["categories"].items() if v["fer7"] == k] for k in FER]
EMOTIONAL = [k for k, g in enumerate(GROUPS) if g]


class Faces(Dataset):
    def __init__(self, jpegs, targets=None, train=False):
        self.jpegs, self.targets, self.train = jpegs, targets, train

    def __len__(self):
        return len(self.jpegs)

    def __getitem__(self, i):
        img = Image.open(io.BytesIO(self.jpegs[i])).convert("RGB")
        if self.train:
            w = img.size[0]
            n = int(w * random.uniform(0.8, 1.0))
            t, l = random.randint(0, w - n), random.randint(0, w - n)
            img = img.crop((l, t, l + n, t + n))
            if random.random() < 0.5:
                img = img.transpose(Image.FLIP_LEFT_RIGHT)
            img = img.rotate(random.uniform(-10, 10), resample=Image.BILINEAR)
            if random.random() < 0.25:
                img = img.convert("L").convert("RGB")
            if random.random() < 0.25:
                small = random.choice([48, 64, 96])
                img = img.resize((small, small), Image.BILINEAR)
        x = (np.asarray(img.resize((SIZE, SIZE), Image.BILINEAR), np.float32) / 255.0 - MEAN) / STD
        if self.train:
            x = x * random.uniform(0.8, 1.2) + random.uniform(-0.2, 0.2)
        x = torch.from_numpy(x.transpose(2, 0, 1).copy())
        return x if self.targets is None else (x, torch.from_numpy(self.targets[i]))


@torch.no_grad()
def predict(model, jpegs, t_mean, t_std):
    model.eval()
    out = []
    for x in DataLoader(Faces(jpegs), batch_size=256, num_workers=WORKERS):
        with torch.autocast(dev.type, enabled=dev.type == "cuda"):
            out.append(model(x.to(dev)).float().cpu().numpy())
    return np.concatenate(out) * t_std + t_mean


def groups7(raw):
    g = np.zeros((len(raw), 7), np.float32)
    for k in EMOTIONAL:
        g[:, k] = raw[:, GROUPS[k]].mean(axis=1)
    g[:, NEUTRAL] = -g[:, EMOTIONAL].max(axis=1)
    return g


def fit_offsets(g, y, frozen=(FER.index("surprise"),), rounds=4):
    """Per-class offsets maximising macro F1 over the classes present in y."""
    present = sorted(set(y.tolist()))
    b = np.zeros(7, np.float32)
    grid = np.linspace(-3 * g.std(), 3 * g.std(), 61)
    for _ in range(rounds):
        for k in range(7):
            if k in frozen:
                continue
            best = (-1.0, b[k])
            for v in grid:
                b2 = b.copy()
                b2[k] = v
                f = f1_score(y, (g + b2).argmax(1), average="macro", labels=present, zero_division=0)
                if f > best[0]:
                    best = (f, v)
            b[k] = best[1]
    return b


def metrics(y, pred, labels=range(7)):
    labels = list(labels)
    keep = y >= 0
    y, pred = y[keep], pred[keep]
    cm = confusion_matrix(y, pred, labels=list(range(7)))
    return {"n": int(len(y)), "accuracy": float(accuracy_score(y, pred)),
            "macro_f1": float(f1_score(y, pred, average="macro", labels=labels, zero_division=0)),
            "recall": {FER[k]: float(cm[k, k] / max(cm[k].sum(), 1)) for k in labels},
            "confusion_matrix": cm.tolist()}


def fer_sets():
    fer = pd.read_csv(find("fer2013.csv"))
    plus = pd.read_csv(find("fer2013new.csv"))
    votes = plus[FERPLUS_COLS].to_numpy()
    top = votes.argmax(axis=1)
    tie = (votes == votes.max(axis=1, keepdims=True)).sum(axis=1) > 1
    plus_lab = np.array([FERPLUS.get(FERPLUS_COLS[t], -1) for t in top])
    plus_lab[tie | (votes.sum(axis=1) == 0)] = -1
    out = {}
    for split in ["PublicTest", "PrivateTest"]:
        sel = (fer["Usage"] == split).to_numpy()
        if MODE == "smoke":
            sel &= np.cumsum(sel) <= 300
        jpegs = []
        for p in fer.loc[sel, "pixels"]:
            buf = io.BytesIO()
            Image.fromarray(np.array(p.split(), dtype=np.uint8).reshape(48, 48)).convert("RGB").save(buf, "PNG")
            jpegs.append(buf.getvalue())
        out[split] = (jpegs, fer.loc[sel, "emotion"].map(FER_TO_IDX).to_numpy(), plus_lab[sel])
    return out


def hq_set():
    path = snapshot_download("laion/emonet-face-hq", repo_type="dataset", allow_patterns=["data/*.parquet"],
                             cache_dir=CACHE)
    df = pd.concat([pd.read_parquet(f, columns=["path", "label"]) for f in sorted(glob.glob(f"{path}/data/*.parquet"))],
                   ignore_index=True)
    if MODE == "smoke":
        df = df.iloc[:200]
    target = np.zeros((len(df), len(CATS)), np.float32)
    for i, raw in enumerate(df["label"]):
        experts = [next(iter(d.values())) for d in ast.literal_eval(raw)]
        for e in experts:
            for key, val in e.items():
                cat = ALIASES.get(key.split("|", 1)[-1], key.split("|", 1)[-1])
                target[i, CAT_IDX[cat]] += float(val) / len(experts)
    jpegs = []
    for p in df["path"]:
        img = Image.open(io.BytesIO(p["bytes"])).convert("RGB")
        s = min(img.size)
        img = img.crop(((img.size[0] - s) // 2, (img.size[1] - s) // 2, (img.size[0] + s) // 2, (img.size[1] + s) // 2))
        buf = io.BytesIO()
        img.resize((256, 256), Image.BICUBIC).save(buf, format="JPEG", quality=90)
        jpegs.append(buf.getvalue())
    return jpegs, target


def hq_metrics(raw, target):
    rho = [spearmanr(raw[:, j], target[:, j]).statistic for j in range(len(CATS))]
    auc = [roc_auc_score(target[:, j] >= 2, raw[:, j]) for j in range(len(CATS))
           if 0 < (target[:, j] >= 2).sum() < len(target)]
    return {"mean_spearman": float(np.nanmean(rho)), "macro_auroc": float(np.mean(auc))}


def main():
    t0 = time.time()
    log(f"mode={MODE} device={dev} gpus={torch.cuda.device_count()} workers={WORKERS}")
    frames = {s: pd.read_parquet(find(f"{s}.parquet")) for s in TRAIN_SOURCES + ["cremad"]}
    train_df = pd.concat([frames[s] for s in TRAIN_SOURCES], ignore_index=True)
    jpegs = list(train_df["jpeg"])
    raw_t = np.stack(train_df["teacher"].to_numpy()).astype(np.float32)
    t_mean, t_std = raw_t.mean(0), raw_t.std(0) + 1e-6
    target = (raw_t - t_mean) / t_std
    log(f"train images: { {s: len(frames[s]) for s in TRAIN_SOURCES} }")

    order = np.random.permutation(len(jpegs))
    n_val = max(256, len(jpegs) // 20)
    val_i, tr_i = order[:n_val], order[n_val:]
    train_dl = DataLoader(Faces([jpegs[i] for i in tr_i], target[tr_i], train=True), batch_size=BATCH, shuffle=True,
                          num_workers=WORKERS, drop_last=True, persistent_workers=True, pin_memory=True)
    val_dl = DataLoader(Faces([jpegs[i] for i in val_i], target[val_i]), batch_size=256, num_workers=WORKERS)

    model = timm.create_model(ARCH, pretrained=True, num_classes=len(CATS)).to(dev)
    opt = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=0.02)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=LR, total_steps=EPOCHS * len(train_dl), pct_start=0.1)
    scaler = torch.amp.GradScaler(enabled=dev.type == "cuda")
    best, history = float("inf"), []
    for epoch in range(EPOCHS):
        model.train()
        total, steps, te = 0.0, 0, time.time()
        for x, y in train_dl:
            with torch.autocast(dev.type, enabled=dev.type == "cuda"):
                loss = F.smooth_l1_loss(model(x.to(dev, non_blocking=True)).float(), y.to(dev))
            opt.zero_grad(set_to_none=True)
            scaler.scale(loss).backward()
            scaler.step(opt)
            scaler.update()
            sched.step()
            total, steps = total + loss.item(), steps + 1
        model.eval()
        vl, vn = 0.0, 0
        with torch.no_grad():
            for x, y in val_dl:
                with torch.autocast(dev.type, enabled=dev.type == "cuda"):
                    vl += F.smooth_l1_loss(model(x.to(dev)).float(), y.to(dev), reduction="sum").item() / len(CATS)
                vn += len(x)
        vl /= vn
        history.append({"epoch": epoch + 1, "train_loss": total / steps, "val_loss": vl})
        log(f"epoch {epoch + 1}/{EPOCHS} train_loss={total / steps:.4f} val_loss={vl:.4f} ({time.time() - te:.0f}s)")
        if vl < best:
            best = vl
            torch.save(model.state_dict(), f"{OUT}/face_student.pt")
    model.load_state_dict(torch.load(f"{OUT}/face_student.pt", map_location=dev))

    report = {"mode": MODE, "arch": ARCH, "history": history, "train_images": int(len(tr_i))}
    crema = frames["cremad"]
    cmeta = [json.loads(m) for m in crema["meta"]]
    actor = np.array([int(m["actor"]) for m in cmeta])
    y_crema = np.array([CREMA_TO_FER[m["face_vote"]] for m in cmeta])
    clips = np.array([m["clip"] for m in cmeta])
    raw_c = {"student": predict(model, list(crema["jpeg"]), t_mean, t_std),
             "teacher": np.stack(crema["teacher"].to_numpy()).astype(np.float32)}
    calib, test = actor % 2 == 0, actor % 2 == 1
    offsets = {}
    for who, raw in raw_c.items():
        g = groups7(raw)
        offsets[who] = fit_offsets(g[calib], y_crema[calib]) if calib.sum() else np.zeros(7, np.float32)
        for name, b in [("fixed", np.zeros(7, np.float32)), ("calibrated", offsets[who])]:
            frame_pred = (g[test] + b).argmax(1)
            clip_ids, inv = np.unique(clips[test], return_inverse=True)
            clip_g = np.zeros((len(clip_ids), 7), np.float32)
            np.add.at(clip_g, inv, g[test] + b)
            clip_y = np.zeros(len(clip_ids), int)
            clip_y[inv] = y_crema[test]
            report[f"cremad_test_{who}_{name}"] = {
                "frames": metrics(y_crema[test], frame_pred, labels=range(6)),
                "clips": metrics(clip_y, clip_g.argmax(1), labels=range(6))}
            log(f"cremad test {who} {name}: frame acc={report[f'cremad_test_{who}_{name}']['frames']['accuracy']:.4f} "
                f"clip acc={report[f'cremad_test_{who}_{name}']['clips']['accuracy']:.4f}")
    report["offsets"] = {k: v.tolist() for k, v in offsets.items()}

    for split, (fj, fy, fyp) in fer_sets().items():
        g = groups7(predict(model, fj, t_mean, t_std))
        for name, b in [("fixed", np.zeros(7, np.float32)), ("calibrated", offsets["student"])]:
            p = (g + b).argmax(1)
            report[f"fer2013_{split}_{name}"] = metrics(fy, p)
            report[f"ferplus_{split}_{name}"] = metrics(fyp, p)
            log(f"{split} {name}: FER acc={report[f'fer2013_{split}_{name}']['accuracy']:.4f} "
                f"FER+ acc={report[f'ferplus_{split}_{name}']['accuracy']:.4f} "
                f"sad recall={report[f'fer2013_{split}_{name}']['recall']['sad']:.2f}")

    hq_j, hq_t = hq_set()
    report["emonet_hq_student"] = hq_metrics(predict(model, hq_j, t_mean, t_std), hq_t)
    log(f"emonet hq student: {report['emonet_hq_student']}")

    json.dump({"categories": CATS, "target_mean": t_mean.tolist(), "target_std": t_std.tolist(),
               "fer7": FER, "groups": GROUPS, "offsets": offsets["student"].tolist(), "input_size": SIZE,
               "normalise_mean": MEAN.tolist(), "normalise_std": STD.tolist()},
              open(f"{OUT}/face_student_readout.json", "w"), indent=2)
    model.eval().cpu()
    export = dict(input_names=["image"], output_names=["scores"], opset_version=17,
                  dynamic_axes={"image": {0: "batch"}, "scores": {0: "batch"}})
    try:
        try:
            torch.onnx.export(model, torch.zeros(1, 3, SIZE, SIZE), f"{OUT}/face_student.onnx", dynamo=False, **export)
        except TypeError:
            torch.onnx.export(model, torch.zeros(1, 3, SIZE, SIZE), f"{OUT}/face_student.onnx", **export)
        report["onnx_mb"] = round(os.path.getsize(f"{OUT}/face_student.onnx") / 1e6, 1)
    except Exception as e:  # export problems must not lose the trained weights
        log(f"onnx export failed: {e!r}")
    report["minutes"] = round((time.time() - t0) / 60, 1)
    json.dump(report, open(f"{OUT}/face_student_metrics.json", "w"), indent=2)
    open(f"{OUT}/distill.log", "w").write("\n".join(log_lines) + "\n")
    log(f"done in {report['minutes']} min")


if __name__ == "__main__":
    main()
