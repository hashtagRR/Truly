"""Honest evaluation of the original Keras CNN on the FER-2013 test splits.

Scores the model on PublicTest and PrivateTest with the original FER-2013 labels
and with FER+ majority labels, and on the Training split to show how far the
earlier "validation" figure (measured on training images) was from test accuracy.
"""
import glob
import json
import os

import h5py
import matplotlib
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
import keras  # noqa: E402
from keras import layers  # noqa: E402

OUT = "/kaggle/working"
CLASSES = ["angry", "disgust", "fear", "happy", "neutral", "sad", "surprise"]  # model output order
FER_TO_MODEL = {0: 0, 1: 1, 2: 2, 3: 3, 4: 5, 5: 6, 6: 4}  # fer2013.csv label -> model index
FERPLUS_TO_MODEL = {"anger": 0, "disgust": 1, "fear": 2, "happiness": 3, "neutral": 4, "sadness": 5, "surprise": 6}
FERPLUS_COLS = ["neutral", "happiness", "surprise", "sadness", "anger", "disgust", "fear", "contempt", "unknown", "NF"]
# Class counts of the folders the model was trained on (folder index = model index)
TRAIN_FOLDER_COUNTS = [3995, 436, 4097, 7215, 4965, 4830, 3171]


def find(name):
    hits = glob.glob(f"/kaggle/input/**/{name}", recursive=True)
    if not hits:
        raise FileNotFoundError(name)
    return hits[0]


def build_model():
    return keras.Sequential([
        keras.Input(shape=(48, 48, 1)),
        layers.Conv2D(32, (3, 3), activation="relu"),
        layers.Conv2D(64, (3, 3), activation="relu"),
        layers.MaxPooling2D((2, 2)),
        layers.Dropout(0.25),
        layers.Conv2D(128, (3, 3), activation="relu"),
        layers.MaxPooling2D((2, 2)),
        layers.Conv2D(128, (3, 3), activation="relu"),
        layers.MaxPooling2D((2, 2)),
        layers.Dropout(0.25),
        layers.Flatten(),
        layers.Dense(1024, activation="relu"),
        layers.Dropout(0.5),
        layers.Dense(7, activation="softmax"),
    ])


def load_legacy_weights(model, path):
    """Assign weights from a Keras 2 save_weights() h5 file by layer order."""
    with h5py.File(path, "r") as f:
        root = f["model_weights"] if "model_weights" in f else f
        names = [n.decode() if isinstance(n, bytes) else n for n in root.attrs["layer_names"]]
        stored = []
        for n in names:
            g = root[n]
            wn = [w.decode() if isinstance(w, bytes) else w for w in g.attrs["weight_names"]]
            if wn:
                stored.append([np.array(g[w]) for w in wn])
    targets = [l for l in model.layers if l.weights]
    assert len(targets) == len(stored), (len(targets), len(stored))
    for layer, ws in zip(targets, stored):
        layer.set_weights(ws)


def to_images(pixels):
    x = np.stack([np.array(p.split(), dtype=np.float32) for p in pixels]).reshape(-1, 48, 48, 1)
    return x / 255.0


def score(name, y_true, y_pred, report):
    labels = list(range(7))
    cm = confusion_matrix(y_true, y_pred, labels=labels)
    rep = classification_report(y_true, y_pred, labels=labels, target_names=CLASSES, output_dict=True, zero_division=0)
    report[name] = {
        "n": int(len(y_true)),
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "macro_f1": float(f1_score(y_true, y_pred, average="macro", labels=labels, zero_division=0)),
        "per_class": {c: {k: float(rep[c][k]) for k in ("precision", "recall", "f1-score", "support")} for c in CLASSES},
        "confusion_matrix": cm.tolist(),
    }
    print(f"{name}: n={len(y_true)} accuracy={report[name]['accuracy']:.4f} macro_f1={report[name]['macro_f1']:.4f}")
    fig, ax = plt.subplots(figsize=(6, 5))
    norm = cm / np.maximum(cm.sum(axis=1, keepdims=True), 1)
    ax.imshow(norm, cmap="Blues", vmin=0, vmax=1)
    ax.set_xticks(labels, CLASSES, rotation=45, ha="right")
    ax.set_yticks(labels, CLASSES)
    for i in labels:
        for j in labels:
            ax.text(j, i, f"{norm[i, j]:.2f}", ha="center", va="center", fontsize=7,
                    color="white" if norm[i, j] > 0.5 else "black")
    ax.set_xlabel("predicted")
    ax.set_ylabel("true")
    ax.set_title(f"{name} (row normalised)")
    fig.tight_layout()
    fig.savefig(f"{OUT}/cm_{name}.png", dpi=120)
    plt.close(fig)


def main():
    model = build_model()
    weights = find("emotion_model.h5")
    try:
        model.load_weights(weights)
        print("weights loaded with keras load_weights")
    except Exception as e:  # Keras 3 may refuse Keras 2 files
        print(f"keras load_weights failed ({e!r}); loading by layer order")
        load_legacy_weights(model, weights)

    fer = pd.read_csv(find("fer2013.csv"))
    plus = pd.read_csv(find("fer2013new.csv"))
    assert len(fer) == len(plus) == 35887, (len(fer), len(plus))
    assert (fer["Usage"].values == plus["Usage"].values).all()

    fer["model_label"] = fer["emotion"].map(FER_TO_MODEL)
    counts = fer.loc[fer["Usage"] == "Training", "model_label"].value_counts().sort_index().tolist()
    assert counts == TRAIN_FOLDER_COUNTS, f"label mapping check failed: {counts}"
    print("label mapping verified against training folder counts")

    votes = plus[FERPLUS_COLS].to_numpy()
    top = votes.argmax(axis=1)
    plus_label = np.array([FERPLUS_COLS[i] for i in top])
    is_tie = (votes == votes.max(axis=1, keepdims=True)).sum(axis=1) > 1
    keep_plus = np.isin(plus_label, list(FERPLUS_TO_MODEL)) & ~is_tie & (votes.sum(axis=1) > 0)
    fer["plus_label"] = [FERPLUS_TO_MODEL.get(l, -1) for l in plus_label]

    x_all = to_images(fer["pixels"])
    probs = model.predict(x_all, batch_size=512, verbose=0)
    pred = probs.argmax(axis=1)

    report = {"model": "original Keras CNN (emotion_model.h5)", "keras_version": keras.__version__}
    for split in ["PublicTest", "PrivateTest", "Training"]:
        m = (fer["Usage"] == split).to_numpy()
        score(f"fer2013_{split}", fer.loc[m, "model_label"].to_numpy(), pred[m], report)
        mp = m & keep_plus
        score(f"ferplus_{split}", fer.loc[mp, "plus_label"].to_numpy(), pred[mp], report)
    report["ferplus_note"] = ("FER+ majority vote; images whose top vote is contempt, unknown or not-a-face, "
                              "or whose top vote is tied, are left out")

    with open(f"{OUT}/baseline_metrics.json", "w") as f:
        json.dump(report, f, indent=2)
    print(json.dumps({k: {"accuracy": v["accuracy"], "macro_f1": v["macro_f1"], "n": v["n"]}
                      for k, v in report.items() if isinstance(v, dict)}, indent=2))


if __name__ == "__main__":
    main()
