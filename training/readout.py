"""Compare ways of turning 40 EmoNet scores into the 7 FER classes.

Reads the arrays saved by face_probe.py. Rules marked "fixed" use no FER labels.
Rules marked "calibrated" fit a few thresholds on PublicTest; PrivateTest is
only ever used for the reported score. "probe" fits a linear classifier on
PublicTest embeddings and is a diagnostic of the representation, not a readout
for release.

Usage: python readout.py PROBE_OUTPUT_DIR MAPPING_JSON
"""
import json
import sys

import numpy as np
from scipy.stats import spearmanr
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score

FER = ["angry", "disgust", "fear", "happy", "neutral", "sad", "surprise"]
NEUTRAL = FER.index("neutral")


def load(d):
    a = {}
    for split in ["PublicTest", "PrivateTest", "HQ"]:
        a[f"eff_{split}"] = 1 / (1 + np.exp(-np.load(f"{d}/effnet_logits_{split}.npy")))
        a[f"laion_{split}"] = np.load(f"{d}/laion_raw_{split}.npy")
        a[f"emb_{split}"] = np.load(f"{d}/siglip_emb_{split}.npy").astype(np.float32)
        a[f"y_{split}"] = np.load(f"{d}/y_{split}.npy")
        if split != "HQ":
            a[f"yplus_{split}"] = np.load(f"{d}/yplus_{split}.npy")
    a["nm"], a["ns"] = np.load(f"{d}/laion_neutral_mean.npy"), np.load(f"{d}/laion_neutral_std.npy")
    return a


def groups(mapping, cats):
    return [[cats.index(c) for c, v in mapping["categories"].items() if v["fer7"] == k] for k in FER]


def group_scores(s, grp, how):
    out = np.full((len(s), 7), -np.inf, np.float32)
    for k, idx in enumerate(grp):
        if idx:
            out[:, k] = s[:, idx].max(axis=1) if how == "max" else s[:, idx].mean(axis=1)
    return out


def with_neutral(g, neutral_score):
    g = g.copy()
    g[:, NEUTRAL] = neutral_score
    return g


def score(y, pred):
    keep = y >= 0
    return accuracy_score(y[keep], pred[keep]), f1_score(y[keep], pred[keep], average="macro", labels=range(7),
                                                        zero_division=0)


def recalls(y, pred):
    keep = y >= 0
    return {c: round(float((pred[keep][y[keep] == k] == k).mean()), 2) for k, c in enumerate(FER)}


def fit_bias(g, y, rounds=4):
    """Per-class additive offsets that maximise macro F1 on the calibration split."""
    keep = y >= 0
    g, y = g[keep], y[keep]
    b = np.zeros(7, np.float32)
    finite = np.isfinite(g).all(axis=0)
    span = np.nanstd(np.where(np.isfinite(g), g, np.nan)) * 3
    grid = np.linspace(-span, span, 61)
    for _ in range(rounds):
        for k in range(7):
            if not finite[k]:
                continue
            best = (-1, b[k])
            for v in grid:
                b2 = b.copy()
                b2[k] = v
                f = f1_score(y, (g + b2).argmax(1), average="macro", labels=range(7), zero_division=0)
                if f > best[0]:
                    best = (f, v)
            b[k] = best[1]
    return b


def main(d, mapping_path):
    mapping = json.load(open(mapping_path))
    cats = sorted(mapping["categories"])
    grp = groups(mapping, cats)
    a = load(d)
    emotional = [k for k in range(7) if k != NEUTRAL]
    rows = []

    def add(name, kind, g_pub, g_priv, calibrate):
        b = fit_bias(g_pub, a["y_PublicTest"]) if calibrate else np.zeros(7, np.float32)
        p = (g_priv + b).argmax(1)
        acc, f1 = score(a["y_PrivateTest"], p)
        acc_p, f1_p = score(a["yplus_PrivateTest"], p)
        rows.append({"rule": name, "kind": kind, "fer_acc": acc, "fer_f1": f1, "ferplus_acc": acc_p,
                     "ferplus_f1": f1_p, "recall": recalls(a["y_PrivateTest"], p)})

    for model in ["eff", "laion"]:
        s_pub, s_priv = a[f"{model}_PublicTest"], a[f"{model}_PrivateTest"]
        if model == "laion":
            z_pub, z_priv = (s_pub - a["nm"]) / a["ns"], (s_priv - a["nm"]) / a["ns"]
        for how in ["max", "mean"]:
            gp, gq = group_scores(s_pub, grp, how), group_scores(s_priv, grp, how)
            if model == "eff":
                npub, npriv = 1 - gp[:, emotional].max(1), 1 - gq[:, emotional].max(1)
            else:
                npub, npriv = -gp[:, emotional].max(1), -gq[:, emotional].max(1)
            add(f"{model} {how}, neutral = no strong emotion", "fixed", with_neutral(gp, npub),
                with_neutral(gq, npriv), False)
            add(f"{model} {how}, neutral = no strong emotion", "calibrated", with_neutral(gp, npub),
                with_neutral(gq, npriv), True)
        if model == "laion":
            for how in ["max", "mean"]:
                gp, gq = group_scores(z_pub, grp, how), group_scores(z_priv, grp, how)
                npub, npriv = -gp[:, emotional].max(1) + 1.0, -gq[:, emotional].max(1) + 1.0
                add(f"laion {how} of neutral z-scores, neutral below z=1", "fixed", with_neutral(gp, npub),
                    with_neutral(gq, npriv), False)
                add(f"laion {how} of neutral z-scores", "calibrated", with_neutral(gp, npub),
                    with_neutral(gq, npriv), True)

    for feat, name in [("emb", "SigLIP2 embedding"), ("eff", "EfficientNet 40 scores"), ("laion", "LAION 40 scores")]:
        keep = a["y_PublicTest"] >= 0
        clf = LogisticRegression(max_iter=3000, C=1.0, class_weight="balanced")
        clf.fit(a[f"{feat}_PublicTest"][keep], a["y_PublicTest"][keep])
        p = clf.predict(a[f"{feat}_PrivateTest"])
        acc, f1 = score(a["y_PrivateTest"], p)
        acc_p, f1_p = score(a["yplus_PrivateTest"], p)
        rows.append({"rule": f"linear probe on {name}", "kind": "probe", "fer_acc": acc, "fer_f1": f1,
                     "ferplus_acc": acc_p, "ferplus_f1": f1_p, "recall": recalls(a["y_PrivateTest"], p)})

    hq = {}
    for model in ["eff", "laion"]:
        s, t = a[f"{model}_HQ"], a["y_HQ"]
        rho = [spearmanr(s[:, j], t[:, j]).statistic for j in range(len(cats))]
        auc = [roc_auc_score(t[:, j] >= 2, s[:, j]) for j in range(len(cats)) if 0 < (t[:, j] >= 2).sum() < len(t)]
        hq[model] = {"mean_spearman": float(np.nanmean(rho)), "macro_auroc": float(np.mean(auc))}

    print(f"{'rule':58} {'kind':10} {'FER acc':>8} {'FER F1':>7} {'FER+ acc':>9} {'FER+ F1':>8}")
    for r in rows:
        print(f"{r['rule']:58} {r['kind']:10} {r['fer_acc']:8.3f} {r['fer_f1']:7.3f} {r['ferplus_acc']:9.3f} "
              f"{r['ferplus_f1']:8.3f}")
    print("\nEmoNet HQ:", json.dumps(hq))
    json.dump({"rows": rows, "hq": hq}, open(f"{d}/readout_results.json", "w"), indent=2)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
