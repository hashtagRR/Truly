"""Score face images with the LAION teacher and save them for distillation.

Teacher: Empathic-Insight-Face-Large (40 MLP heads on SigLIP2 so400m embeddings).
Sources, all licensed for redistribution of derived models:
  fairface   real faces, no emotion labels (CC BY 4.0)
  big        EmoNet-Face Big synthetic faces (CC BY 4.0)
  binary     EmoNet-Face Binary synthetic faces with expert judgements (CC BY 4.0)
  cremad     CREMA-D video frames of 91 actors with face-only crowd votes (ODbL / DbCL)
Output per source: <source>.parquet with a 256 px JPEG crop, the 40 raw teacher
scores and source metadata, plus <source>_emb.npy with SigLIP2 embeddings.
"""
import glob
import io
import json
import os
import re
import tarfile
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np
import pandas as pd
import torch
from huggingface_hub import hf_hub_download, snapshot_download
from PIL import Image
from torch.utils.data import DataLoader, Dataset
from transformers import AutoModel

MODE = "smoke"
OUT = "/kaggle/working"
CACHE = "/tmp/hf"
SIGLIP = "google/siglip2-so400m-patch16-384"
LAION = "laion/Empathic-Insight-Face-Large"
TEACHER_SIZE = 384
STORE = 256
WORKERS = os.cpu_count() or 4
SEED = 13
N = {"fairface": 40000, "big_tars": 2, "binary": None, "cremad_clips": None} if MODE == "full" else \
    {"fairface": 200, "big_tars": 1, "binary": 200, "cremad_clips": 60}
BIG_PER_TAR = None if MODE == "full" else 200
CREMA = "https://media.githubusercontent.com/media/CheyneyComputerScience/CREMA-D/master"
CREMA_RAW = "https://raw.githubusercontent.com/CheyneyComputerScience/CREMA-D/master"
FRAME_POS = (0.35, 0.65)
dev = torch.device("cuda" if torch.cuda.is_available() else "cpu")
rng = np.random.default_rng(SEED)


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def find(name):
    hits = glob.glob(f"/kaggle/input/**/{name}", recursive=True)
    if not hits:
        raise FileNotFoundError(name)
    return hits[0]


CATS = sorted(json.load(open(find("emonet_categories.json")))["categories"])


def slug(name):
    return re.sub(r"[^a-z&]+", "_", name.lower()).strip("_")


def square(img, box=None, margin=0.25):
    """Square crop around box (x, y, w, h) with margin, or the centre square."""
    w, h = img.size
    if box is None:
        s = min(w, h)
        return img.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
    x, y, bw, bh = box
    s = int(max(bw, bh) * (1 + 2 * margin))
    cx, cy = x + bw // 2, y + bh // 2
    left, top = max(0, cx - s // 2), max(0, cy - s // 2)
    return img.crop((left, top, min(w, left + s), min(h, top + s)))


def load_fairface():
    path = snapshot_download("HuggingFaceM4/FairFace", repo_type="dataset", allow_patterns=["0.25/train-*.parquet"],
                             cache_dir=CACHE)
    df = pd.concat([pd.read_parquet(f) for f in sorted(glob.glob(f"{path}/0.25/train-*.parquet"))], ignore_index=True)
    df = df.iloc[rng.permutation(len(df))[:N["fairface"]]].reset_index(drop=True)
    meta = [json.dumps({k: (int(v) if isinstance(v, (np.integer, int)) else str(v)) for k, v in r.items() if k != "image"})
            for r in df.to_dict("records")]
    return [r["bytes"] for r in df["image"]], meta, [f"fairface_{i}" for i in range(len(df))]


def load_big():
    blobs, meta, ids = [], [], []
    for t in range(N["big_tars"]):
        tar_path = hf_hub_download("laion/emonet-face-big", f"{t:05d}.tar", repo_type="dataset", cache_dir=CACHE)
        pending = {}
        with tarfile.open(tar_path) as tf:
            for m in tf:
                stem, ext = os.path.splitext(m.name)
                pending.setdefault(stem, {})[ext] = tf.extractfile(m).read()
                if {".jpg", ".json"} <= pending[stem].keys():
                    p = pending.pop(stem)
                    blobs.append(p[".jpg"])
                    meta.append(p[".json"].decode())
                    ids.append(f"big_{stem}")
                    if BIG_PER_TAR and len(ids) >= BIG_PER_TAR * (t + 1):
                        break
    return blobs, meta, ids


def load_binary():
    path = snapshot_download("laion/emonet-face-binary", repo_type="dataset", allow_patterns=["data/*.parquet"],
                             cache_dir=CACHE)
    df = pd.concat([pd.read_parquet(f, columns=["path", "label"]) for f in sorted(glob.glob(f"{path}/data/*.parquet"))],
                   ignore_index=True)
    if N["binary"]:
        df = df.iloc[:N["binary"]]
    return [p["bytes"] for p in df["path"]], list(df["label"]), [f"binary_{i}" for i in range(len(df))]


def load_cremad():
    table = pd.read_csv(io.StringIO(urllib.request.urlopen(f"{CREMA_RAW}/processedResults/summaryTable.csv",
                                                           timeout=60).read().decode()))
    table = table[table["FaceVote"].isin(list("ADFHNS"))].reset_index(drop=True)
    if N["cremad_clips"]:
        table = table.iloc[rng.permutation(len(table))[:N["cremad_clips"]]].reset_index(drop=True)
    os.makedirs("/tmp/cremad", exist_ok=True)

    def fetch(name):
        dst = f"/tmp/cremad/{name}.flv"
        if not os.path.exists(dst):
            for attempt in range(4):
                try:
                    urllib.request.urlretrieve(f"{CREMA}/VideoFlash/{name}.flv", dst)
                    break
                except OSError:
                    time.sleep(2 ** attempt)
        return dst if os.path.exists(dst) else None

    with ThreadPoolExecutor(32) as pool:
        paths = list(pool.map(fetch, table["FileName"]))
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    blobs, meta, ids, misses = [], [], [], 0
    for row, p in zip(table.to_dict("records"), paths):
        if p is None:
            misses += 1
            continue
        cap = cv2.VideoCapture(p)
        n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        for k, pos in enumerate(FRAME_POS):
            cap.set(cv2.CAP_PROP_POS_FRAMES, max(0, int(n * pos)))
            ok, frame = cap.read()
            if not ok:
                continue
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = cascade.detectMultiScale(gray, 1.1, 5, minSize=(60, 60))
            img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            box = max(faces, key=lambda f: f[2] * f[3]) if len(faces) else None
            buf = io.BytesIO()
            square(img, box).save(buf, format="JPEG", quality=92)
            blobs.append(buf.getvalue())
            meta.append(json.dumps({"clip": row["FileName"], "actor": row["FileName"][:4], "frame": k,
                                    "face_vote": row["FaceVote"], "face_level": float(row["FaceLevel"]),
                                    "face_found": box is not None}))
            ids.append(f"cremad_{row['FileName']}_{k}")
        cap.release()
    log(f"cremad: {len(table)} clips, {misses} downloads failed, {len(blobs)} frames")
    return blobs, meta, ids


class Images(Dataset):
    def __init__(self, blobs):
        self.blobs = blobs

    def __len__(self):
        return len(self.blobs)

    def __getitem__(self, i):
        img = square(Image.open(io.BytesIO(self.blobs[i])).convert("RGB"))
        t = img.resize((TEACHER_SIZE, TEACHER_SIZE), Image.BICUBIC)
        x = (np.asarray(t, np.float32) / 255.0 - 0.5) / 0.5
        buf = io.BytesIO()
        img.resize((STORE, STORE), Image.BICUBIC).save(buf, format="JPEG", quality=90)
        return torch.from_numpy(x.transpose(2, 0, 1).copy()), buf.getvalue()


def collate(batch):
    return torch.stack([b[0] for b in batch]), [b[1] for b in batch]


class Embedder(torch.nn.Module):
    def __init__(self, siglip):
        super().__init__()
        self.siglip = siglip

    def forward(self, x):
        f = self.siglip.get_image_features(pixel_values=x)
        if not torch.is_tensor(f):
            f = f.pooler_output
        f = f.float()
        return f / f.norm(dim=-1, keepdim=True).clamp(min=1e-12)


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


def main():
    t0 = time.time()
    log(f"mode={MODE} gpus={torch.cuda.device_count()} workers={WORKERS}")
    laion_dir = snapshot_download(LAION, cache_dir=CACHE)
    heads = []
    for c in CATS:
        m = MLP()
        m.load_state_dict(torch.load(f"{laion_dir}/model_{slug(c)}_best.pth", map_location="cpu"))
        heads.append(m.eval())
    heads = torch.nn.ModuleList(heads).to(dev)
    siglip = AutoModel.from_pretrained(SIGLIP, cache_dir=CACHE, dtype=torch.float16).eval()
    embed = Embedder(siglip).to(dev)
    if torch.cuda.device_count() > 1:
        embed = torch.nn.DataParallel(embed)

    summary = {}
    for source, loader in [("cremad", load_cremad), ("binary", load_binary), ("big", load_big),
                           ("fairface", load_fairface)]:
        ts = time.time()
        blobs, meta, ids = loader()
        log(f"{source}: {len(blobs)} images loaded in {time.time() - ts:.0f}s")
        ts = time.time()
        embs, scores, stored = [], [], []
        dl = DataLoader(Images(blobs), batch_size=96, num_workers=WORKERS, collate_fn=collate, pin_memory=True)
        with torch.no_grad():
            for x, jpgs in dl:
                with torch.autocast(dev.type, dtype=torch.float16, enabled=dev.type == "cuda"):
                    e = embed(x.to(dev, non_blocking=True).half())
                e = e.float()
                scores.append(torch.cat([h(e) for h in heads], dim=1).cpu().numpy())
                embs.append(e.half().cpu().numpy())
                stored.extend(jpgs)
        scores, embs = np.concatenate(scores), np.concatenate(embs)
        rate = len(blobs) / max(time.time() - ts, 1e-6)
        pd.DataFrame({"id": ids, "jpeg": stored, "teacher": list(scores.astype(np.float32)), "meta": meta}).to_parquet(
            f"{OUT}/{source}.parquet")
        np.save(f"{OUT}/{source}_emb.npy", embs)
        summary[source] = {"images": len(blobs), "teacher_img_per_s": round(rate, 1)}
        log(f"{source}: scored at {rate:.1f} img/s")
        del blobs, meta, ids, stored
    json.dump({"categories": CATS, "mode": MODE, "sources": summary, "minutes": round((time.time() - t0) / 60, 1)},
              open(f"{OUT}/teacher_meta.json", "w"), indent=2)
    log(f"done in {(time.time() - t0) / 60:.1f} min")


if __name__ == "__main__":
    main()
