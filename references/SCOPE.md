# Truly: project scope and boundaries

Truly is a free, open source, privacy-first application that recommends music based on how a listener describes their current mood and energy, and the listening experience they would like.

Its sole purpose is to help people discover and play music that suits how they feel, or how they would like their listening to develop. Truly is a personal music discovery application. It is not designed or intended for medical, diagnostic, psychological assessment, therapeutic or clinical purposes, and this is a permanent design constraint of the official project.

## The guiding rule

No feature may produce a conclusion about a person's mental health. Every personalised output is a music recommendation, a music preference, or an explanation of a recommendation.

## Intended users

People who want to find music suited to their current mood and preferences, for ordinary, voluntary listening.

## What Truly does

- Asks listeners to describe their current mood and energy.
- Lets listeners choose a listening direction: calmer, gently brighter, or staying where they are.
- Recommends music using its valence, arousal and tempo.
- Builds gradual transitions between pieces, a sequencing technique that starts close to the listener's chosen mood and moves a little at a time.
- Lets listeners skip, swap, slow down or regenerate recommendations, and plays music inside the app.
- Lets listeners prefer instruments, choose a path length, mark favourites and rule pieces out.
- Keeps optional listening history, favourite pieces and music preferences in the listener's own browser, only when the listener switches saving on, and lets them delete it at any time. Mood answers are never saved.
- Explains why each piece was chosen.
- Offers optional camera and voice inputs that only adjust where a music path starts. They are presented as a playful suggestion and never as a reading of how anyone feels.

All recommendations are suggestions. The listener stays in control.

## What Truly never does

1. Diagnose, screen for or predict any medical or mental health condition.
2. Estimate depression, anxiety, suicide risk, psychological distress or any other clinical indicator.
3. Interpret repeated mood entries as evidence of a condition or a risk.
4. Trigger warnings, interventions or referrals based on mood answers, expressions or behaviour.
5. Present facial expressions, voice or behaviour as evidence of a person's true emotional or psychological state.
6. Recommend music as a medical treatment or as a substitute for professional support.
7. Claim to provide music therapy, psychotherapy, counselling or clinical monitoring.
8. Use clinical questionnaires, clinical scores or clinical prediction models as inputs to recommendations.
9. Share mood data with anyone, including employers, healthcare providers or insurers.

These rules apply to the code, the interface, the documentation, the website and the roadmap.

## Mood as a music input

A mood answer is a subjective music preference. It is not a medical observation, a psychological assessment or an indicator of a health condition. The recommender may use it to choose musical characteristics and must not draw any other conclusion from it. The listening direction a person chooses always takes precedence over automatic suggestions.

## Decision rules for inputs

| Input | Required | Used for | Never used for |
|---|---|---|---|
| Mood and energy answers | yes | The starting point of the music path | Any conclusion about the person |
| Listening direction | yes, with a suggested default | The target of the music path | Anything else |
| Camera expression | optional, off by default | A small adjustment to the first pieces | Any statement about how the person feels; it is never stored |
| Voice sound | optional, off by default | A small adjustment to the first pieces, mainly their energy | Words, identity, age, gender or any statement about how the person feels; it is never stored |

## Privacy

- No account or personal information is needed.
- Everything runs in the browser. Camera frames and the five seconds of microphone sound are processed in memory and never stored or sent. Speech is never transcribed.
- Music plays from Truly's own site. No streaming service, analytics, tracking or cookies are used.
- Mood and energy answers are used for the current visit only and are never saved.
- Saving is off by default. When the listener switches it on, only the paths they played, their favourite pieces, the pieces they ruled out and their instrument and length choices are kept, in the browser, and they can be deleted at any time.
- No health records, risk scores or psychological profiles are created.

## Architecture

```
 mood and energy   ──┐
 direction         ──┼──> start point and target ──> music path ──> in-app player
 camera (optional) ──┤                                    │
 voice (optional)  ──┘                                    └──> explanation per piece
 optional listening history, favourites and preferences (browser only, off by default)
```

| Component | Job | Interface for builders |
|---|---|---|
| Check-in | Mood and energy answers and an optional note | Questions in `docs/app/checkin.json` |
| Camera input | Suggests a slightly calmer or brighter start | Any face model exported to ONNX with the documented input and output |
| Voice input | Suggests a slightly calmer or livelier start from the sound of the voice | Any audio model exported to ONNX that takes 5 seconds of 16 kHz audio and returns valence and arousal |
| Music path | Builds a sequence of pieces from a start point to a target in valence and arousal | Pure functions in `docs/app/music.js` |
| Catalogue | Freely licensed recordings with valence, arousal and tempo | `tracks.json` in the [Truly-music](https://github.com/hashtagRR/Truly-music) repository |
| Player | Plays the path in the page with credits | `docs/app/app.js` |
| Listening history | Optional list of played paths and favourite pieces, off by default | Browser storage only |

## Music

- **Catalogue.** Freely licensed recordings of public domain works whose valence, arousal and tempo come from MCUD 1.0, a published dataset of music used in studies. Each recording is chosen by hand: a lyric-free public domain composition, a recording licensed for redistribution worldwide, and the work and movement checked against the dataset entry. Recordings and credits live in the [Truly-music](https://github.com/hashtagRR/Truly-music) repository, listed in `music/recordings.json` and prepared by `music/prepare_audio.py`.
- **Paths.** Four, six or nine pieces, as the listener chooses, from their starting point towards the chosen target. Calmer mainly lowers energy; gently brighter mainly lifts mood; staying keeps close. Each piece is a small step from the last, tempo changes gradually, no performer repeats, and the path always moves forward.
- **Control.** The listener can swap a piece, rule a piece out, prefer instruments, slow down to smaller steps, start a new path or stop at any time. Preferences shift the choice a little; the path's direction always leads.

## Research and evidence

Truly draws on music information retrieval, music perception, musical emotion and recommendation systems. Sequencing ideas that come from music therapy, such as matching a starting mood before moving away from it, inform how paths are built. That does not make Truly a therapeutic product, and the project makes no claims about health outcomes. Evaluation looks at recommendation quality, listening preference, usability, privacy, performance and transparency. See [RESEARCH.md](RESEARCH.md).

## Feature acceptance rule

A feature is within scope only when all of these hold:

- Its main purpose supports music discovery, selection, playback or listener-controlled preferences.
- It does not assess any psychological or medical condition.
- It makes no therapeutic or clinical claim.
- Any personal data it processes is necessary and proportionate for choosing music, and clearly described.
- It does not widen Truly's purpose beyond personal music discovery.

Features that fail any of these are not merged into the official project. Every pull request confirms them through the checklist in `.github/PULL_REQUEST_TEMPLATE.md`.

## Licence and forks

Code is released under AGPL-3.0-or-later. Free software licences allow anyone to modify the software for any purpose, so this document governs the official Truly project and its releases rather than forks.

## Milestones

1. Repository layout and baseline face model evaluation.
2. Distilled on-device face model and model card.
3. Check-in app.
4. Music paths with self-hosted recordings and an in-app player.
5. Scope boundary, optional history and recommendation explanations.
6. Optional voice input, then the first tagged release and a larger catalogue. Planned work is listed in [ROADMAP.md](../ROADMAP.md).
