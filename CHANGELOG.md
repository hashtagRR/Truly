# Changelog

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

- A step by step blueprint of the app and its models, with diagrams, in `references/ARCHITECTURE.md`, and a visual version on the website with a live path explorer, the cost of each candidate piece and the voice model's spectrogram.
- Kaggle training scripts for both models, model cards and readout settings.
- Tests for music paths, storage, preferences, the face and voice readouts and the shipped models, run by GitHub Actions.
- A project scope with a feature acceptance rule, a contributing guide and a pull request checklist.
