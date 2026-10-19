# Truly

*How are you, truly?*

**[hashtagRR.github.io/Truly](https://hashtagRR.github.io/Truly)**

Truly is a free, open source, privacy-first music recommender. Tell it your mood and how much energy you have, and it plays a short path of classical music that starts where you are and moves, one piece at a time, towards calmer or brighter, with a reason for every piece.

Truly is a music app. It does not assess, diagnose or monitor anyone's health; the [scope](references/SCOPE.md) sets this out as a permanent boundary for the project.

## Research basis

- **Mood on a map.** Emotions can be placed by valence and arousal (Russell, 1980), and so can music, which lets Truly place a listener's answers and each piece on one map.
- **Published values for every piece.** Each recording takes its valence, arousal and tempo from MCUD 1.0 (Du et al., 2026).
- **Start where you are.** Paths begin near the chosen mood and move gradually, a sequencing idea studied in listening research (Starcke and von Georgi, 2024).
- **A face or a voice is only a hint.** Facial movements do not reliably reveal feelings (Barrett et al., 2019), so the optional camera and voice inputs only nudge where a path starts.

Full references are in [references/RESEARCH.md](references/RESEARCH.md).

## Documents

- [How Truly works](references/ARCHITECTURE.md): a step by step blueprint of the app and its models, with diagrams. A visual version with live examples is at [hashtagrr.github.io/Truly/how-it-works.html](https://hashtagrr.github.io/Truly/how-it-works.html).
- [Scope](references/SCOPE.md): the project's purpose, what it never does, the feature acceptance rule, privacy and milestones.
- [Contributing](CONTRIBUTING.md): how to propose changes and the scope check every pull request answers.
- [Roadmap](ROADMAP.md): planned work for the next releases.
- [Changelog](CHANGELOG.md): what each release contains.
- [Research basis](references/RESEARCH.md): the research behind how music is chosen, with references.
- [Data and models](references/DATASETS.md): every dataset and model Truly uses, its licence and how to cite it.
- [Related work](references/RELATED_WORK.md): the projects and studies Truly builds on.

## Layout

| Path | Contents |
|---|---|
| `docs/` | Project website, published with GitHub Pages, including the visual blueprint `how-it-works.html` |
| `docs/app/` | The web app: plain HTML, CSS and JavaScript modules, no build step |
| `references/` | Scope, research basis, data and models, related work |
| `mappings/` | EmoNet-Face categories mapped to FER classes and to valence/arousal |
| `models/face/` | Face model card and readout settings |
| `models/voice/` | Voice model card |
| `training/` | Face and voice model scripts, run as Kaggle kernels |
| `training/kernels/` | Kaggle kernel metadata templates |
| `music/` | Music selection and audio preparation |
| `scripts/` | Release helpers |
| `tests/` | Tests run with `node --test tests/` |

`data/`, `runs/`, `build/` and `legacy/` hold downloaded datasets, run outputs, generated files and the original prototype. They are not tracked.

## The app

The app runs entirely in the browser at [hashtagrr.github.io/Truly/app/](https://hashtagrr.github.io/Truly/app/). A check-in asks for a mood and an energy level; the music view builds a path through the catalogue and plays it with credits for every recording. Mood answers are used only for the current visit and never saved; if the listener switches saving on, the paths they played and their favourite pieces are kept in the browser's local storage. The optional camera experiment finds the face with UltraFace and reads its expression with the Truly face model, both through ONNX Runtime Web. The optional voice experiment records five seconds of sound into memory and reads its energy, and lightly its mood, with the Truly voice model; nothing is transcribed. Both results only nudge where a path starts and are never stored. To run the app locally with the same layout as GitHub Pages, link both repositories into one folder and serve it:

```bash
mkdir -p site && ln -sfn ../Truly/docs site/Truly && ln -sfn ../Truly-music site/Truly-music
python3 -m http.server -d site
```

Then open `http://localhost:8000/Truly/app/`. The check-in questions are in `docs/app/checkin.json`.

## Tests

```bash
node --test tests/
```

The music path tests check that every path has the right length, never repeats a performer and only moves forward, including after a piece is swapped or the path is slowed down, and that the music list is fetched again after a failed request. The face and voice tests check the readouts and the loudness step, and the model tests load each shipped ONNX model and check the inputs and outputs the app relies on. They run with GitHub Actions on every push and pull request.

## Model pipelines

| Script | Purpose |
|---|---|
| `baseline_eval.py` | Scores the original Keras CNN on the FER-2013 test splits |
| `face_train.py` | Trains EfficientNet-B0 directly on EmoNet-Face Binary expert labels |
| `face_probe.py` | Saves raw scores from the trained model and the LAION teacher for readout experiments |
| `readout.py` | Compares ways of turning 40 category scores into the 7 FER classes (runs locally) |
| `face_teacher.py` | Scores FairFace, EmoNet-Face and CREMA-D images with the LAION teacher |
| `face_distill.py` | Distils the teacher into EfficientNet-B0, calibrates on CREMA-D and evaluates |
| `voice_teacher.py` | Scores 5 second voice clips with a non-clinical valence and arousal teacher (LAION Empathic-Insight-Voice on BUD-E-Whisper) |
| `voice_distill.py` | Distils the voice teacher into a small model with a built-in log-mel front end, exported to ONNX, and tests it on CREMA-D |

FER-2013 is used for evaluation only. No FER-2013 image or label is used for training or calibration.

## Running on Kaggle

Each script has a `MODE` line: `smoke` runs a few hundred images to check the pipeline, `full` runs everything.

```bash
export KAGGLE_CONFIG_DIR=~/.kaggle KAGGLE_API_TOKEN=$(cat ~/.kaggle/access_token)
training/kaggle_inputs.sh <user>                 # private input dataset
training/kaggle_push.sh face_teacher <user> full
training/kaggle_push.sh face_distill <user> full # after face_teacher finishes
training/kaggle_push.sh voice_teacher <user> full
training/kaggle_push.sh voice_distill <user> full # after voice_teacher finishes
```

`face_probe`, `face_distill` and `voice_distill` read the output of an earlier kernel by the same user, so run the kernels in the order listed above.

## Music

The music plays from the [Truly-music](https://github.com/hashtagRR/Truly-music) repository, served by GitHub Pages on the same site as the app. `music/recordings.json` lists the recordings; `music/prepare_audio.py` downloads them from Wikimedia Commons, converts them with ffmpeg and writes the audio, `tracks.json` and the credits into a clone of that repository:

```bash
python music/prepare_audio.py ../Truly-music --ffmpeg /path/to/ffmpeg
```

It needs pandas and openpyxl. `music/works.json` records which trial works are public domain and which MCUD entries each one stands for. `music/acousticbrainz_harvest.py` collects song features for extending the catalogue.

## Licence

Copyright (C) 2026 hashtagRR.

Truly is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. See [LICENSE](LICENSE).

Datasets and pretrained models used by the project keep their own licences, listed in [references/DATASETS.md](references/DATASETS.md).
