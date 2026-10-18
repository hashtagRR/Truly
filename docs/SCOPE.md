# Truly: scope

A free, open source wellbeing companion. It checks in on how a person is feeling, notices when their outward expression and their own report do not match, plays music that meets them where they are and moves gently towards a better state, and points them to real help when low mood persists.

It is built so anyone can fork it, swap a part, or add a new one.

## Why

People who are struggling often look fine. They laugh with friends and colleagues and then go home alone. A tool that only reads faces would call them happy. This one treats the gap between what a face shows and what a person says as the signal worth paying attention to.

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
4. **Honest about limits.** Every model ships with its real test accuracy, per class, and the app says plainly what the camera cannot tell.
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

**Baseline.** The existing Keras CNN, evaluated on the FER-2013 public and private test splits. Its earlier reported validation accuracy is not usable because it was measured on the training images.

**Target model.** A pretrained backbone (EfficientNet or ConvNeXt small) fine tuned on FER-2013 with class balancing and augmentation, aiming at about 70% test accuracy, small enough to run in a browser at a few frames per second.

**Outputs.** Seven class probabilities plus a derived valence/arousal estimate, because the music path works in valence/energy space.

**Reporting.** Per class precision, recall and confusion matrix, published with every released model. Known weak spots (disgust, fear, and differences across age, skin tone and lighting) are written into the model card.

**Training compute.** Kaggle notebooks with free GPU hours. FER-2013 is available there, so no local download is needed.

**Data.** Released weights are trained on EmoNet-Face (synthetic, CC BY 4.0) and evaluated on real faces from FER-2013 with FER+ labels. Licences and reasons for each choice are in [DATASETS.md](DATASETS.md).

## Voice signal

**Model.** Kintsugi DAM (Apache-2.0), a Whisper-small.en model trained on about 35,000 people with PHQ-9 and GAD-7 labels. It reads only how a person speaks, not what they say.

**Rules.**
- Opt-in, off by default, and can be turned off at any time.
- Acoustic features only. No speech recognition or transcription ever runs on the audio, and no text is derived from it.
- Audio is processed in memory on the device and discarded straight after. It is never stored, cached, logged, uploaded or exported. Only the resulting signal level (none, raised, high) enters local history.
- The score is never shown to the user, never named as depression or anxiety, and never mapped to a clinical scale in the interface.
- The signal can only make the safety prompt more likely when self-report is also low. It can never trigger the prompt on its own, and it never affects music or the mood shown.

**Limits, stated in the app.** Trained mostly on American English speech; accuracy for other accents and languages is unknown. Background noise, illness and tiredness change the voice. A quiet result does not mean someone is fine.

**Size.** The Whisper-small backbone is large for a browser. Running it on the device may need a quantised ONNX export; if a device cannot run it, voice stays unavailable rather than falling back to a server.

## Music path

- **Catalogue.** MuSe (CC BY 4.0) valence/arousal for about 90k songs, joined with AcousticBrainz (CC0) tempo and mood probabilities through MusicBrainz IDs, plus Creative Commons audio from MTG-Jamendo and FMA. The catalogue ships as a local file. Spotify derived data is not used because its terms forbid ML use.
- **Clinical grounding.** Generated paths are checked against playlists from randomised trials (MCUD 1.0) and induced emotion ratings (Emotify). See [DATASETS.md](DATASETS.md).
- **Playback.** The app shows links that open the track in the user's own player. It does not stream audio.
- **Path.** From the current point in valence/energy space to a calmer or brighter target over a set number of tracks. The user can stop, slow down or say "not now" at any step.
- **Content review.** Tracks that romanticise self-harm or suicide are excluded from every catalogue that ships. The reviewed flag records which tracks a person has checked. Lyrics are not stored.

## Safety layer

- Shows a gentle prompt to talk to someone when low self-reported mood persists over several check-ins or days. Thresholds live in one config file.
- Helplines come from a per-country data file with a source link for each entry, plus a link to a global directory such as findahelpline.com.
- A "need help now" button is visible on every screen.
- Wording follows published safe messaging guidelines for suicide and mental health content.
- Model output alone never triggers the prompt. Self-report has to be part of it. A raised voice signal lowers the number of low check-ins needed before the prompt appears; it never replaces them.

## Evaluation

- **Model:** test split metrics and a model card, as above.
- **Mood state and safety rules:** unit tests over scripted check-in histories, including the masking case (happy face, low self-report) and a raised voice signal with normal self-report (no prompt).
- **Voice signal:** thresholds tuned on the published DAM score and demographic data, with results reported per group; tests that no audio reaches storage, logs or the network.
- **Music path:** checks that each playlist moves monotonically towards the target and never includes an unreviewed or excluded track.
- **Public datasets only.** The project collects no new data from people and runs no studies with people. Anyone who extends it with a study needs ethics approval from their own institution.

## Milestones

1. **Baseline.** Clean repo layout, honest evaluation of the existing model on the real test splits.
2. **Model.** Fine tuned model on Kaggle, ONNX export, model card.
3. **Check-in app.** Static web app with self-report, optional camera, local history.
4. **Music path.** Catalogue, iso principle recommender, player links.
5. **Safety layer.** Persistence rules, helplines data, help button, safe messaging review.
6. **Voice signal.** On-device DAM export, threshold tuning, privacy tests, opt-in flow.
7. **Release.** Contributor guide, interface docs, first tagged release.

## Licence

Code is released under AGPL-3.0-or-later, so every derivative, including one offered as a network service, stays open. This also stops anyone turning Truly into a closed monitoring product.

## Open decisions

- **First countries** for the helplines file.
