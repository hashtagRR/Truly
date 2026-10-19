# Changelog

## 0.2.0 (2026-10-19)

### Listening

- The music view shows the path as a small map of mood and energy, with the playing piece marked.
- With saving on, Truly learns which pieces you usually play to the end and which you leave early, and leans a little towards the first. "Your listening" shows what it has learned and can forget it.

### Offline

- Truly can be installed as an app and works offline. "Keep this path for offline listening" saves a path's recordings on the device; without a connection, new paths use only those. The Privacy page shows and removes offline music.

### For developers

- Path quality measures (average and largest step, step variation, largest tempo change), with tests that keep paths within today's limits.
- A technical design document, `references/ARCHITECTURE.md`, covering the system structure, the recommendation engine with its equations, both model pipelines layer by layer with training and evaluation, the runtime, storage, testing and design decisions. It is also published on the website with a contents panel, a live path explorer, the cost terms of each candidate and the voice model's front end.

## 0.1.0 (2026-10-19)

The first release of Truly, a free, open source, privacy-first music recommender.

### Check-in and music paths

- A short check-in asks for mood and energy on two five-point scales.
- Three listening directions: calmer, gently brighter, or staying where you are, with a suggested default.
- Paths of four, six or nine pieces that start near the chosen mood and move one small step at a time, never backwards, following the iso principle.
- A reason for every piece, and a curve showing where the path goes.
- Swap a piece, slow the path down, start a new path or stop at any time.

### Music

- 18 freely licensed recordings of public domain works, each placed by the valence, arousal and tempo published in MCUD 1.0, and tagged with its instruments.
- Music plays inside the app from Truly's own site. No streaming service is involved.
- Playback copes with slow and dropped connections, fetches the next piece in advance, and works from the keyboard, on phones and with lock screen and headset controls.

### Listener preferences

- Prefer piano, strings, orchestra or winds.
- Favourite pieces come up a little more often; pieces marked "not for me" are left out.

### Optional camera and voice inputs

- Truly face model v1: an EfficientNet-B0 distilled from LAION's Empathic-Insight-Face-Large, with an UltraFace detector. It nudges where a path starts.
- Truly voice model v1: a 420,000-parameter audio model distilled from LAION's Empathic-Insight-Voice-Small. It reads energy, and lightly mood, from five seconds of sound and nudges where a path starts. Speech is never transcribed.
- Both run on the listener's device with ONNX Runtime Web, are off until tried, and are never stored.

### Privacy

- No account, cookies, analytics or tracking.
- Mood answers are never saved. Saving is off by default; when switched on, only played paths, favourites, pieces ruled out and music preferences are kept, in the browser, with download and delete.

### For developers

- A technical design document, `references/ARCHITECTURE.md`, also published on the website with a live path explorer, the cost terms of each candidate and the voice model's front end.
- Kaggle training scripts for both models, model cards and readout settings.
- Tests for music paths, storage, preferences, the face and voice readouts and the shipped models, run by GitHub Actions.
- A project scope with a feature acceptance rule, a contributing guide and a pull request checklist.
