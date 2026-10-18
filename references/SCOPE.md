# Truly: scope

A free, open source wellbeing companion. It checks in on how a person is feeling, notices when their outward expression and their own report do not match, plays music that meets them where they are and moves gently towards a better state, and points them to real help when low mood persists.

It is built so anyone can fork it, swap a part, or add a new one.

## Why

People who are struggling often look fine. They laugh with friends and colleagues and then go home alone. Research shows that facial expressions are a weak guide to how someone feels, while a person's own answers and the way they speak carry far more information. Truly asks first, listens second, and treats the gap between what a face shows and what a person says as the signal worth paying attention to. The research behind each choice is summarised in [RESEARCH.md](RESEARCH.md).

## What it is not

- Not a diagnostic tool. It never says a person is depressed or at risk.
- Not a suicide risk predictor. No such prediction is made from faces, voice or usage data.
- Not a replacement for people. When things look persistently bad, its job is to point towards a person: a friend, a doctor, a helpline.
- Not a monitoring tool. It runs only when the user opens it, and nothing is sent to anyone else.

## Users

- **Primary:** anyone who wants a private, low-effort way to check in with themselves.
- **Builders:** developers, researchers and music therapists who want to improve a part of it (a better model, a new music source, helplines for another country, a new language).

## Design principles

1. **The person's own words come first.** Self-report outranks every model output.
2. **Meet, then move.** Music follows the iso principle from music therapy: start close to the current mood and change step by step, never jump straight to cheerful.
3. **Private by default.** All inference runs on the user's device. Camera frames and voice audio are processed in memory and never stored, saved, uploaded or transcribed. Mood history stays local unless the user exports it.
4. **Clear about each signal.** Every model ships with its test results per class, and the app explains in plain words what each signal is used for.
5. **Replaceable parts.** Each component sits behind a small, documented interface.

## Architecture

```
 check-in (self-report)  ──┐
                           ├──> mood state ──> music path ──> player links
 camera (optional) ────────┘        │
                                    ├──> safety layer ──> help prompt + helplines
 voice (optional) ──────────────────┘         ▲
                                    └──> local history (on device)
```

### Decision rules

| Signal | Required | Feeds | Can never |
|---|---|---|---|
| Self-report | yes | mood state, music path, safety layer | be outranked by a model |
| Face | optional | mood state (expression estimate, mismatch flag), and through it the music path | override self-report or trigger the help prompt |
| Voice (acoustic only) | optional, opt-in | safety layer only (none, raised, high) | change the mood shown or the music, trigger the help prompt, or be shown to the user |

The help prompt follows persistent low self-reported mood. A raised voice signal lowers the number of low check-ins needed; it never replaces them. Without low self-report, no combination of face and voice triggers the prompt.

| Component | Job | Interface for builders |
|---|---|---|
| Check-in | Short self-report: mood, energy, optional note | Question sets as data files, so wording and languages can change without code |
| Expression model | Face to emotion probabilities and a valence/arousal estimate | Any model exported to ONNX with the documented input and output shape |
| Voice signal | Optional, opt-in. Reads acoustic features from about 30 seconds of speech and produces a private low-mood signal for the safety layer | Any acoustic-only model exported to ONNX with the documented input and output; no speech recognition allowed |
| Mood state | Combines self-report and expression, flags mismatch, smooths over the session | Pure function with tests; alternative fusion rules can be added |
| Music path | Builds a playlist that starts near the current valence/energy and steps towards a target | Recommender interface over a track catalogue |
| Track catalogue | Tracks with valence, energy, tempo and a reviewed flag | Data file; anyone can add a catalogue for their region or genre |
| Safety layer | Watches local history for persistent low mood, shows a gentle prompt and helplines | Rules in one place; helplines in a data file per country |
| History | Local mood log, export and delete | Browser storage only |

## Platform

A static web app that runs in the browser, with the model running on the device through ONNX Runtime Web. Reasons: nothing to install, works on phones and laptops, free to host, easy to fork, and the camera feed never leaves the device.

Model training lives in a separate Python package in the same repo, run on Kaggle GPU notebooks.

## Expression model

**Baseline.** The original Keras CNN, evaluated on the FER-2013 test splits.

**Model.** EfficientNet-B0, small enough to run in a browser, trained by distillation from LAION's Empathic-Insight-Face-Large teacher on EmoNet-Face and FairFace images. It outputs scores for the 40 EmoNet-Face categories, which map to seven expression classes and to valence and arousal for the music path.

**Calibration.** Class offsets are fitted on CREMA-D video frames from one half of the actors.

**Reporting.** Per class results on CREMA-D (the other half of the actors), FER-2013 with original and FER+ labels, and EmoNet-Face HQ, published in a model card with every released model.

**Training compute.** Kaggle notebooks with free GPU hours.

**Data.** Every source and its licence is listed in [DATASETS.md](DATASETS.md).

## Voice signal

**Model.** Kintsugi DAM (Apache-2.0), a Whisper-small.en model trained on about 35,000 people with PHQ-9 and GAD-7 labels. It reads only how a person speaks, not what they say.

**Rules.**
- Opt-in, off by default, and can be turned off at any time.
- Acoustic features only. No speech recognition or transcription ever runs on the audio, and no text is derived from it.
- Audio is processed in memory on the device and discarded straight after. It is never stored, cached, logged, uploaded or exported. Only the resulting signal level (none, raised, high) enters local history.
- The score is never shown to the user, never named as depression or anxiety, and never mapped to a clinical scale in the interface.
- The signal can only make the safety prompt more likely when self-report is also low. It can never trigger the prompt on its own, and it never affects music or the mood shown.

**In the app.** The interface explains that the voice check is one supporting signal and that the person's own answers always come first. A low voice signal is never presented as reassurance.

**On the device.** The model runs as a quantised ONNX export. Devices that cannot run it do not offer the voice check; audio is never sent to a server instead.

## Music path

- **Catalogue.** Pieces without lyrics that were used in music therapy trials, from MCUD 1.0, with their valence, arousal and tempo. The catalogue ships as one file built by `music/build_catalogue.py`. Songs with lyrics and a wider range of instrumental tracks join once each track's instrumental status or lyrics can be checked.
- **Clinical grounding.** Every piece comes from a trial playlist, and path targets sit where those playlists sit: calm and moderately positive. See [DATASETS.md](DATASETS.md) and [RESEARCH.md](RESEARCH.md).
- **Playback.** The app shows links that open the track in the user's own player. It does not stream audio.
- **Path.** Six pieces from the person's current point in valence and arousal towards a target. Calmer mainly lowers energy with a small lift in mood; gently brighter mainly lifts mood with a gentle settling of energy; staying keeps close to how the person feels. Each piece is a small step from the last, tempo changes gradually and no artist repeats. The person can swap a piece, slow down to nine smaller steps, or stop at any time.
- **Content review.** Tracks that romanticise self-harm or suicide are kept out of every catalogue that ships. The catalogue contains only lyric-free pieces chosen for clinical trials, and an editable blocklist (`music/blocklist.txt`) removes any title or artist that matches. Lyrics are not stored.

## Safety layer

- Shows a gentle prompt to talk to someone when low self-reported mood persists: at least 3 of the 5 most recent check-ins within 14 days report feeling low or very low. The rules live in `docs/app/help/safety.json`.
- Model output alone never triggers the prompt. Self-report has to be part of it. A raised voice signal lowers the number of low check-ins needed before the prompt appears; it never replaces them.
- Helplines come from `docs/app/help/helplines.json`, one entry per country with the service's official website for each line and the date the numbers were checked. Countries without an entry see a link to a global directory.
- The country is guessed from the device's time zone, falling back to the browser language, entirely on the device. No location, IP address or cookie is used. A person can choose another country; that choice is kept in the browser and removed by "Delete all check-ins".
- A "Need help now" button is visible on every screen, with emergency numbers for the person's country.
- Wording follows published safe messaging guidelines for suicide and mental health content: warm, hopeful, and never describing methods.

## Evaluation

- **Model:** test split metrics and a model card, as above.
- **Mood state and safety rules:** unit tests over scripted check-in histories, including the masking case (happy face, low self-report) and a raised voice signal with normal self-report (no prompt).
- **Voice signal:** thresholds tuned on the published DAM score and demographic data, with results reported per group; tests that no audio reaches storage, logs or the network.
- **Music path:** checks that each playlist moves monotonically towards the target and never includes an unreviewed or excluded track.
- **Public datasets only.** The project collects no new data from people and runs no studies with people. Anyone who extends it with a study needs ethics approval from their own institution.

## Milestones

1. **Baseline.** Repository layout and evaluation of the original model on the FER-2013 test splits.
2. **Model.** Distilled on-device model, CREMA-D calibration, ONNX export, model card.
3. **Check-in app.** Static web app with self-report, optional camera, local history.
4. **Music path.** Catalogue, iso principle recommender, player links.
5. **Safety layer.** Persistence rules, helplines data, help button, safe messaging review.
6. **Voice signal.** On-device DAM export, threshold tuning, privacy tests, opt-in flow.
7. **Release.** Contributor guide, interface docs, first tagged release.

## Licence

Code is released under AGPL-3.0-or-later, so every derivative, including one offered as a network service, stays open. This also stops anyone turning Truly into a closed monitoring product.

## Open decisions

- **First countries** for the helplines file.
