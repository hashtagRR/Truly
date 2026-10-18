"""Save raw emotion scores from two models for offline readout experiments.

Models: the EfficientNet-B0 trained in truly-face-train, and LAION
Empathic-Insight-Face-Large (SigLIP2 so400m embeddings with 40 MLP heads).
Images: FER-2013 PublicTest and PrivateTest, and EmoNet-Face HQ.
Output: scores.npz with per-image scores, labels and SigLIP2 embeddings.
"""
import ast
import glob
import io
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import pandas as pd
import timm
import torch
from huggingface_hub import snapshot_download
from PIL import Image
from transformers import AutoModel, AutoProcessor

OUT = "/kaggle/working"
CACHE = "/tmp/hf"
SIGLIP = "google/siglip2-so400m-patch16-384"
LAION = "laion/Empathic-Insight-Face-Large"
ARCH = "efficientnet_b0.ra_in1k"
SIZE = 224
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
FER_TO_IDX = {0: 0, 1: 1, 2: 2, 3: 3, 4: 5, 5: 6, 6: 4}
FERPLUS = {"anger": 0, "disgust": 1, "fear": 2, "happiness": 3, "neutral": 4, "sadness": 5, "surprise": 6}
FERPLUS_COLS = ["neutral", "happiness", "surprise", "sadness", "anger", "disgust", "fear", "contempt", "unknown", "NF"]
dev = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def find(name):
    hits = glob.glob(f"/kaggle/input/**/{name}", recursive=True)
    if not hits:
        raise FileNotFoundError(name)
    return hits[0]


mapping = json.load(open(find("emonet_categories.json")))
CATS = sorted(mapping["categories"])
CAT_IDX = {c: i for i, c in enumerate(CATS)}
ALIASES = mapping.get("aliases", {})


def slug(name):
    return re.sub(r"[^a-z&]+", "_", name.lower()).strip("_")


def fer_split(split):
    fer = pd.read_csv(find("fer2013.csv"))
    plus = pd.read_csv(find("fer2013new.csv"))
    sel = (fer["Usage"] == split).to_numpy()
    votes = plus[FERPLUS_COLS].to_numpy()[sel]
    top = votes.argmax(axis=1)
    tie = (votes == votes.max(axis=1, keepdims=True)).sum(axis=1) > 1
    plus_lab = np.array([FERPLUS.get(FERPLUS_COLS[t], -1) for t in top])
    plus_lab[tie | (votes.sum(axis=1) == 0)] = -1
    images = [Image.fromarray(np.array(p.split(), dtype=np.uint8).reshape(48, 48)).convert("RGB")
              for p in fer.loc[sel, "pixels"]]
    return images, fer.loc[sel, "emotion"].map(FER_TO_IDX).to_numpy(), plus_lab


def hq_set():
    path = snapshot_download("laion/emonet-face-hq", repo_type="dataset", allow_patterns=["data/*.parquet"],
                             cache_dir=CACHE)
    df = pd.concat([pd.read_parquet(f, columns=["path", "label"]) for f in sorted(glob.glob(f"{path}/data/*.parquet"))],
                   ignore_index=True)
    target = np.zeros((len(df), len(CATS)), np.float32)
    for i, raw in enumerate(df["label"]):
        experts = [next(iter(d.values())) for d in ast.literal_eval(raw)]
        for e in experts:
            for key, val in e.items():
                cat = ALIASES.get(key.split("|", 1)[-1], key.split("|", 1)[-1])
                target[i, CAT_IDX[cat]] += float(val) / len(experts)
    with ThreadPoolExecutor(8) as pool:
        images = list(pool.map(lambda p: Image.open(io.BytesIO(p["bytes"])).convert("RGB"), df["path"]))
    return images, target


def effnet_scores(model, images):
    out = []
    for i in range(0, len(images), 256):
        batch = []
        for img in images[i:i + 256]:
            w, h = img.size
            s = min(w, h)
            img = img.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((SIZE, SIZE),
                                                                                                    Image.BILINEAR)
            batch.append(((np.asarray(img, np.float32) / 255.0 - MEAN) / STD).transpose(2, 0, 1))
        with torch.no_grad(), torch.autocast(dev.type, enabled=dev.type == "cuda"):
            out.append(model(torch.from_numpy(np.stack(batch)).to(dev)).float().cpu().numpy())
    return np.concatenate(out)


class MLP(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.layers = torch.nn.Sequential(
            torch.nn.Linear(1152, 1024), torch.nn.ReLU(), torch.nn.Dropout(0.2),
            torch.nn.Linear(1024, 512), torch.nn.ReLU(), torch.nn.Dropout(0.2),
            torch.nn.Linear(512, 256), torch.nn.ReLU(), torch.nn.Dropout(0.2),
            torch.nn.Linear(256, 1))

    def forward(self, x):
        return self.layers(x)


def siglip_embed(model, processor, images):
    out = []
    for i in range(0, len(images), 64):
        inputs = processor(images=images[i:i + 64], return_tensors="pt").to(dev)
        with torch.no_grad(), torch.autocast(dev.type, enabled=dev.type == "cuda"):
            feats = model.get_image_features(**inputs)
        if not torch.is_tensor(feats):  # newer transformers return an output object
            feats = feats.pooler_output
        feats = feats.float()
        out.append((feats / feats.norm(dim=-1, keepdim=True).clamp(min=1e-12)).cpu().numpy())
    return np.concatenate(out)


def main():
    t0 = time.time()
    sets = {}
    for split in ["PublicTest", "PrivateTest"]:
        imgs, y, yplus = fer_split(split)
        sets[split] = imgs
        np.save(f"{OUT}/y_{split}.npy", y)
        np.save(f"{OUT}/yplus_{split}.npy", yplus)
    hq_imgs, hq_target = hq_set()
    sets["HQ"] = hq_imgs
    np.save(f"{OUT}/y_HQ.npy", hq_target)
    log(f"loaded images: { {k: len(v) for k, v in sets.items()} } in {time.time() - t0:.0f}s")

    eff = timm.create_model(ARCH, pretrained=False, num_classes=len(CATS))
    eff.load_state_dict(torch.load(find("face_model.pt"), map_location="cpu"))
    eff = eff.to(dev).eval()
    for k, imgs in sets.items():
        np.save(f"{OUT}/effnet_logits_{k}.npy", effnet_scores(eff, imgs))
    log("effnet scores saved")
    del eff

    laion_dir = snapshot_download(LAION, cache_dir=CACHE)
    neutral = json.load(open(glob.glob(f"{laion_dir}/neutral_stats*.json")[0]))
    mlps, neutral_mean, neutral_std = [], [], []
    for c in CATS:
        key = f"model_{slug(c)}_best"
        m = MLP()
        m.load_state_dict(torch.load(f"{laion_dir}/{key}.pth", map_location="cpu"))
        mlps.append(m.to(dev).eval())
        neutral_mean.append(float(neutral.get(key, {}).get("mean", 0.0)))
        neutral_std.append(float(neutral.get(key, {}).get("std", 1.0)))
    np.save(f"{OUT}/laion_neutral_mean.npy", np.array(neutral_mean, np.float32))
    np.save(f"{OUT}/laion_neutral_std.npy", np.array(neutral_std, np.float32))
    log(f"loaded {len(mlps)} LAION heads; neutral means found for {sum(1 for c in CATS if f'model_{slug(c)}_best' in neutral)}")

    processor = AutoProcessor.from_pretrained(SIGLIP, cache_dir=CACHE)
    siglip = AutoModel.from_pretrained(SIGLIP, cache_dir=CACHE, torch_dtype=torch.float16).to(dev).eval()
    for k, imgs in sets.items():
        emb = siglip_embed(siglip, processor, imgs)
        with torch.no_grad():
            x = torch.from_numpy(emb).to(dev)
            raw = torch.cat([m(x) for m in mlps], dim=1).cpu().numpy()
        np.save(f"{OUT}/siglip_emb_{k}.npy", emb.astype(np.float16))
        np.save(f"{OUT}/laion_raw_{k}.npy", raw)
        log(f"{k}: siglip embeddings and LAION scores saved")
    json.dump({"categories": CATS, "minutes": round((time.time() - t0) / 60, 1)}, open(f"{OUT}/probe_meta.json", "w"))
    log(f"done in {(time.time() - t0) / 60:.1f} min")


if __name__ == "__main__":
    main()
