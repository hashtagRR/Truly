# Truly

*How are you, truly?*

Truly is a free, open source wellbeing companion. It checks in on how a person feels, notices when their face and their own words do not match, plays music that meets them where they are and moves gently towards a better state, and points them to people and helplines when low mood persists.

It never diagnoses, never predicts risk, and runs on the user's device.

## Documents

- [Scope](docs/SCOPE.md): what the tool does and does not do, the decision rules for each signal, privacy and safety requirements, milestones.
- [Datasets](docs/DATASETS.md): every dataset and model considered, its licence, and whether it is used.
- [Related work](docs/RELATED_WORK.md): similar tools and studies, and where this project differs.

## Layout

| Path | Contents |
|---|---|
| `docs/` | Scope, datasets, related work |
| `mappings/` | EmoNet-Face categories mapped to FER classes and to valence/arousal |
| `training/` | Face model scripts, run as Kaggle kernels |
| `training/kernels/` | Kaggle kernel metadata templates |
| `music/` | Music catalogue building |

`data/`, `runs/`, `build/` and `legacy/` hold downloaded datasets, run outputs, generated files and the original prototype. They are not tracked.

## Face model pipeline

| Script | Purpose |
|---|---|
| `baseline_eval.py` | Scores the original Keras CNN on the FER-2013 test splits |
| `face_train.py` | Trains EfficientNet-B0 directly on EmoNet-Face Binary expert labels |
| `face_probe.py` | Saves raw scores from the trained model and the LAION teacher for readout experiments |
| `readout.py` | Compares ways of turning 40 category scores into the 7 FER classes (runs locally) |
| `face_teacher.py` | Scores FairFace, EmoNet-Face and CREMA-D images with the LAION teacher |
| `face_distill.py` | Distils the teacher into EfficientNet-B0, calibrates on CREMA-D and evaluates |

FER-2013 is used for evaluation only. No FER-2013 image or label is used for training or calibration.

## Running on Kaggle

Each script has a `MODE` line: `smoke` runs a few hundred images to check the pipeline, `full` runs everything.

```bash
export KAGGLE_CONFIG_DIR=~/.kaggle KAGGLE_API_TOKEN=$(cat ~/.kaggle/access_token)
training/kaggle_inputs.sh <user>                 # private input dataset
training/kaggle_push.sh face_teacher <user> full
training/kaggle_push.sh face_distill <user> full # after face_teacher finishes
```

`face_probe` and `face_distill` read the output of an earlier kernel by the same user, so run the kernels in the order listed above.

## Music catalogue

```bash
python3 -I music/acousticbrainz_harvest.py data/muse/muse_dataset.csv data/acousticbrainz/muse_acousticbrainz.jsonl.gz
```

Adds AcousticBrainz tempo, key, loudness and mood probabilities to MuSe songs by MusicBrainz ID.

## Licence

Copyright (C) 2026 hashtagRR.

Truly is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. See [LICENSE](LICENSE).

Datasets and pretrained models used by the project keep their own licences, listed in [docs/DATASETS.md](docs/DATASETS.md).
