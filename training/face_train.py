# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 hashtagRR
"""Train a face expression model on EmoNet-Face and evaluate it on real faces.

Training data: EmoNet-Face Binary (expert yes/no judgements, 40 categories).
Synthetic test: EmoNet-Face HQ (four experts rate all 40 categories, 0 to 7).
Real face test: FER-2013 PublicTest and PrivateTest, original and FER+ labels,
scored through the 40-to-7 mapping in emonet_categories.json.

MODE = "smoke" runs a few hundred images for one epoch to check the pipeline.
"""
import ast
import glob
import io
import json
import os
import random
import time
from concurrent.futures import ThreadPoolExecutor

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
STORE = 256  # cached short side before random crops
EPOCHS = 1 if MODE == "smoke" else 15
BATCH = 64
LR = 3e-4
WORKERS = os.cpu_count() or 4
SMOKE_N = 512
FER_CLASSES = ["angry", "disgust", "fear", "happy", "neutral", "sad", "surprise"]
FER_TO_IDX = {0: 0, 1: 1, 2: 2, 3: 3, 4: 5, 5: 6, 6: 4}  # fer2013.csv label -> FER_CLASSES index
FERPLUS = {"anger": 0, "disgust": 1, "fear": 2, "happiness": 3, "neutral": 4, "sadness": 5, "surprise": 6}
FERPLUS_COLS = ["neutral", "happiness", "surprise", "sadness", "anger", "disgust", "fear", "contempt", "unknown", "NF"]
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
HQ_PRESENT = 2.0  # mean expert intensity at or above this counts as present for AUROC

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
skipped = {}
FER_GROUPS = [[CAT_IDX[c] for c, v in mapping["categories"].items() if v["fer7"] == k]
              for k in FER_CLASSES]


def short_side(img, n):
    img = img.convert("RGB")
    w, h = img.size
    s = n / min(w, h)
    return np.asarray(img.resize((max(n, round(w * s)), max(n, round(h * s))), Image.BICUBIC))


def center(arr, n):
    h, w = arr.shape[:2]
    t, l = (h - n) // 2, (w - n) // 2
    return arr[t:t + n, l:l + n]


def decode(blob):
    return center(short_side(Image.open(io.BytesIO(blob)), STORE), STORE)


def load_parquet(repo):
    path = snapshot_download(repo, repo_type="dataset", allow_patterns=["data/*.parquet"], cache_dir=CACHE)
    files = sorted(glob.glob(f"{path}/data/*.parquet"))
    return pd.concat([pd.read_parquet(f, columns=["path", "emotion", "label"]) for f in files], ignore_index=True)


def binary_targets(df):
    y = np.zeros((len(df), len(CATS)), np.float32)
    m = np.zeros_like(y)
    for i, raw in enumerate(df["label"]):
        votes = {}
        for judge in ast.literal_eval(raw):
            for cat, val in next(iter(judge.values())).items():
                cat = ALIASES.get(cat, cat)
                if cat not in CAT_IDX:
                    skipped[cat] = skipped.get(cat, 0) + 1
                    continue
                votes.setdefault(cat, []).append(bool(val))
        for cat, vs in votes.items():
            yes, no = sum(vs), len(vs) - sum(vs)
            if yes != no:
                y[i, CAT_IDX[cat]] = float(yes > no)
                m[i, CAT_IDX[cat]] = 1.0
    return y, m


def hq_targets(df):
    out = np.zeros((len(df), len(CATS)), np.float32)
    for i, raw in enumerate(df["label"]):
        experts = [next(iter(d.values())) for d in ast.literal_eval(raw)]
        for e in experts:
            for key, val in e.items():
                cat = ALIASES.get(key.split("|", 1)[-1], key.split("|", 1)[-1])
                if cat not in CAT_IDX:
                    skipped[cat] = skipped.get(cat, 0) + 1
                    continue
                out[i, CAT_IDX[cat]] += float(val) / len(experts)
    return out


def decode_all(blobs):
    with ThreadPoolExecutor(WORKERS * 2) as pool:
        return np.stack(list(pool.map(decode, blobs, chunksize=64)))


class FaceSet(Dataset):
    def __init__(self, images, y=None, m=None, train=False):
        self.images, self.y, self.m, self.train = images, y, m, train

    def __len__(self):
        return len(self.images)

    def __getitem__(self, i):
        img = Image.fromarray(self.images[i])
        if self.train:
            s = random.uniform(0.7, 1.0)
            n = int(STORE * s)
            t, l = random.randint(0, STORE - n), random.randint(0, STORE - n)
            img = img.crop((l, t, l + n, t + n))
            if random.random() < 0.5:
                img = img.transpose(Image.FLIP_LEFT_RIGHT)
            img = img.rotate(random.uniform(-12, 12), resample=Image.BILINEAR)
            if random.random() < 0.35:  # FER-2013 is grey, 48x48
                img = img.convert("L").convert("RGB")
            if random.random() < 0.35:
                small = random.choice([40, 48, 64, 96])
                img = img.resize((small, small), Image.BILINEAR)
        img = img.resize((SIZE, SIZE), Image.BILINEAR)
        x = (np.asarray(img, np.float32) / 255.0 - MEAN) / STD
        if self.train:
            x = x * random.uniform(0.75, 1.25) + random.uniform(-0.25, 0.25)
        x = torch.from_numpy(x.transpose(2, 0, 1).copy())
        if self.y is None:
            return x
        return x, torch.from_numpy(self.y[i]), torch.from_numpy(self.m[i])


def masked_bce(logits, y, m):
    loss = F.binary_cross_entropy_with_logits(logits, y, reduction="none")
    return (loss * m).sum() / m.sum().clamp(min=1)


@torch.no_grad()
def predict(model, images):
    model.eval()
    out = []
    for x in DataLoader(FaceSet(images), batch_size=256, num_workers=WORKERS):
        with torch.autocast(dev.type, enabled=dev.type == "cuda"):
            out.append(torch.sigmoid(model(x.to(dev)).float()).cpu())
    return torch.cat(out).numpy()


def to_fer7(probs):
    scores = np.zeros((len(probs), 7), np.float32)
    for k, idx in enumerate(FER_GROUPS):
        if idx:
            scores[:, k] = probs[:, idx].max(axis=1)
    emotional = [k for k, idx in enumerate(FER_GROUPS) if idx]
    scores[:, FER_CLASSES.index("neutral")] = 1.0 - scores[:, emotional].max(axis=1)
    return scores


def fer_metrics(y_true, y_pred):
    labels = list(range(7))
    rec = confusion_matrix(y_true, y_pred, labels=labels)
    per = {}
    for k, c in enumerate(FER_CLASSES):
        tp = rec[k, k]
        per[c] = {"precision": float(tp / max(rec[:, k].sum(), 1)), "recall": float(tp / max(rec[k].sum(), 1)),
                  "support": int(rec[k].sum())}
    return {"n": int(len(y_true)), "accuracy": float(accuracy_score(y_true, y_pred)),
            "macro_f1": float(f1_score(y_true, y_pred, average="macro", labels=labels, zero_division=0)),
            "per_class": per, "confusion_matrix": rec.tolist()}


def fer_images(pixels):
    def one(p):
        a = np.array(p.split(), dtype=np.uint8).reshape(48, 48)
        return np.asarray(Image.fromarray(a).convert("RGB").resize((STORE, STORE), Image.BILINEAR))
    with ThreadPoolExecutor(WORKERS * 2) as pool:
        return np.stack(list(pool.map(one, pixels, chunksize=256)))


def evaluate_fer(model, report):
    fer = pd.read_csv(find("fer2013.csv"))
    plus = pd.read_csv(find("fer2013new.csv"))
    assert len(fer) == len(plus) and (fer["Usage"].values == plus["Usage"].values).all()
    votes = plus[FERPLUS_COLS].to_numpy()
    top = votes.argmax(axis=1)
    tie = (votes == votes.max(axis=1, keepdims=True)).sum(axis=1) > 1
    plus_lab = np.array([FERPLUS.get(FERPLUS_COLS[t], -1) for t in top])
    keep_plus = (plus_lab >= 0) & ~tie & (votes.sum(axis=1) > 0)
    for split in ["PublicTest", "PrivateTest"]:
        sel = (fer["Usage"] == split).to_numpy()
        if MODE == "smoke":
            sel &= np.cumsum(sel) <= 300
        pred = to_fer7(predict(model, fer_images(fer.loc[sel, "pixels"]))).argmax(axis=1)
        report[f"fer2013_{split}"] = fer_metrics(fer.loc[sel, "emotion"].map(FER_TO_IDX).to_numpy(), pred)
        kp = keep_plus[sel]
        report[f"ferplus_{split}"] = fer_metrics(plus_lab[sel][kp], pred[kp])
        for k in (f"fer2013_{split}", f"ferplus_{split}"):
            log(f"{k}: n={report[k]['n']} accuracy={report[k]['accuracy']:.4f} macro_f1={report[k]['macro_f1']:.4f}")


def evaluate_hq(model, images, target, report):
    probs = predict(model, images)
    rhos, aucs = {}, {}
    for c, j in CAT_IDX.items():
        rho = spearmanr(probs[:, j], target[:, j]).statistic
        rhos[c] = float(rho) if np.isfinite(rho) else None
        present = target[:, j] >= HQ_PRESENT
        if 0 < present.sum() < len(present):
            aucs[c] = float(roc_auc_score(present, probs[:, j]))
    valid_r = [r for r in rhos.values() if r is not None]
    report["emonet_hq"] = {"n": int(len(images)), "mean_spearman": float(np.mean(valid_r)),
                           "macro_auroc": float(np.mean(list(aucs.values()))), "present_threshold": HQ_PRESENT,
                           "spearman": rhos, "auroc": aucs}
    log(f"emonet_hq: mean spearman={report['emonet_hq']['mean_spearman']:.4f} "
        f"macro auroc={report['emonet_hq']['macro_auroc']:.4f}")


def main():
    t0 = time.time()
    log(f"mode={MODE} device={dev} arch={ARCH} workers={WORKERS} torch={torch.__version__} timm={timm.__version__}")
    binary = load_parquet("laion/emonet-face-binary")
    hq = load_parquet("laion/emonet-face-hq")
    if MODE == "smoke":
        binary = binary.sample(SMOKE_N, random_state=SEED).reset_index(drop=True)
        hq = hq.iloc[:200].reset_index(drop=True)
    y, m = binary_targets(binary)
    keep = m.sum(axis=1) > 0
    binary, y, m = binary[keep].reset_index(drop=True), y[keep], m[keep]
    log(f"binary images with a usable judgement: {len(binary)}; positives={int(y.sum())} negatives={int((m - y).sum())}")

    images = decode_all([p["bytes"] for p in binary["path"]])
    hq_images = decode_all([p["bytes"] for p in hq["path"]])
    hq_target = hq_targets(hq)
    log(f"judgements skipped for unknown category names: {skipped or 'none'}")
    log(f"decoded {len(images)} training and {len(hq_images)} HQ images in {time.time() - t0:.0f}s")

    order = np.random.permutation(len(images))
    n_val = max(64, len(images) // 10)
    val_i, tr_i = order[:n_val], order[n_val:]
    train_dl = DataLoader(FaceSet(images[tr_i], y[tr_i], m[tr_i], train=True), batch_size=BATCH, shuffle=True,
                          num_workers=WORKERS, drop_last=True, persistent_workers=True, pin_memory=True)
    val_dl = DataLoader(FaceSet(images[val_i], y[val_i], m[val_i]), batch_size=256, num_workers=WORKERS)

    model = timm.create_model(ARCH, pretrained=True, num_classes=len(CATS)).to(dev)
    opt = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=0.05)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=LR, total_steps=EPOCHS * len(train_dl), pct_start=0.1)
    scaler = torch.amp.GradScaler(enabled=dev.type == "cuda")
    best, history = float("inf"), []
    for epoch in range(EPOCHS):
        model.train()
        total, steps = 0.0, 0
        for x, yy, mm in train_dl:
            x, yy, mm = x.to(dev, non_blocking=True), yy.to(dev), mm.to(dev)
            with torch.autocast(dev.type, enabled=dev.type == "cuda"):
                loss = masked_bce(model(x).float(), yy, mm)
            opt.zero_grad(set_to_none=True)
            scaler.scale(loss).backward()
            scaler.step(opt)
            scaler.update()
            sched.step()
            total, steps = total + loss.item(), steps + 1
        model.eval()
        vl, vn, vp, vt = 0.0, 0, [], []
        with torch.no_grad():
            for x, yy, mm in val_dl:
                with torch.autocast(dev.type, enabled=dev.type == "cuda"):
                    logits = model(x.to(dev)).float()
                vl += masked_bce(logits, yy.to(dev), mm.to(dev)).item() * len(x)
                vn += len(x)
                p = torch.sigmoid(logits).cpu().numpy()
                obs = mm.numpy() > 0
                vp.append(p[obs])
                vt.append(yy.numpy()[obs])
        vl /= vn
        vp, vt = np.concatenate(vp), np.concatenate(vt)
        vauc = float(roc_auc_score(vt, vp)) if 0 < vt.sum() < len(vt) else float("nan")
        history.append({"epoch": epoch + 1, "train_loss": total / steps, "val_loss": vl, "val_auroc": vauc})
        log(f"epoch {epoch + 1}/{EPOCHS} train_loss={total / steps:.4f} val_loss={vl:.4f} val_auroc={vauc:.4f}")
        if vl < best:
            best = vl
            torch.save(model.state_dict(), f"{OUT}/face_model.pt")

    model.load_state_dict(torch.load(f"{OUT}/face_model.pt", map_location=dev))
    report = {"mode": MODE, "arch": ARCH, "input_size": SIZE, "categories": CATS, "history": history,
              "train_images": int(len(tr_i)), "val_images": int(len(val_i))}
    evaluate_hq(model, hq_images, hq_target, report)
    evaluate_fer(model, report)

    model.eval().cpu()
    export = dict(input_names=["image"], output_names=["logits"], opset_version=17,
                  dynamic_axes={"image": {0: "batch"}, "logits": {0: "batch"}})
    try:
        try:
            torch.onnx.export(model, torch.zeros(1, 3, SIZE, SIZE), f"{OUT}/face_model.onnx", dynamo=False, **export)
        except TypeError:  # torch versions without the dynamo argument
            torch.onnx.export(model, torch.zeros(1, 3, SIZE, SIZE), f"{OUT}/face_model.onnx", **export)
        report["onnx_mb"] = round(os.path.getsize(f"{OUT}/face_model.onnx") / 1e6, 1)
        log(f"onnx export: {report['onnx_mb']} MB")
    except Exception as e:  # export problems must not lose the trained weights
        log(f"onnx export failed: {e!r}")
    report["minutes"] = round((time.time() - t0) / 60, 1)
    json.dump(report, open(f"{OUT}/face_metrics.json", "w"), indent=2)
    open(f"{OUT}/train.log", "w").write("\n".join(log_lines) + "\n")
    log(f"done in {report['minutes']} min")


if __name__ == "__main__":
    main()
