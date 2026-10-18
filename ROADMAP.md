# Roadmap

Planned work for Truly, grouped by release. Every item must pass the scope check in [references/SCOPE.md](references/SCOPE.md): it serves music discovery, selection or playback, and draws no conclusion about anyone's health.

## v0.1.0: a reliable first release

### Fixes

- **Clear the camera result for each check-in.** A camera reading must apply only to the check-in it was taken for. Clear it when a check-in is submitted, so an earlier reading never shapes a later path.
- **Guarantee forward paths, or soften the claim.** Recheck the whole sequence after a piece is swapped and after "Slow down" keeps the first piece, so no transition steps backwards against the chosen direction. Add a test that covers swaps and slowing down. If a forward order cannot be kept, describe paths as aiming for gradual progression instead of always moving forward.

### Data minimisation

- **Remove the free-text note from the check-in.** The recommender does not use it, so the app should not collect it.
- **Make history opt-in.** Music works without saving anything; saving starts only when the listener switches it on.
- **Make history about music, not mood.** Replace the chart of mood answers with a history of played paths and favourite pieces.

### Quality

- **Tests in the repository.** Move the path, readout and model checks into `tests/` and run them with GitHub Actions on every pull request.
- **Playback reliability.** Handle slow networks and failed loads, and keep the player usable from the keyboard and on phones.

### Listener preferences

- **Instruments.** Let listeners prefer piano, strings, orchestra or winds, with one instrument tag per recording.
- **Favourites and "not for me".** Pieces the listener likes or wants to avoid, kept only in the browser.
- **Path length.** Shorter or longer listening sessions.

### Wording

- **Describe the collection honestly.** Present the music as an early classical and instrumental collection until the catalogue grows.

### Release

- Tagged release with release notes and a changelog.
- Face model weights attached under CC BY 4.0, with the model card.
- Zenodo DOI.

## v0.2: voice and a larger catalogue

- **Optional voice input.** A small browser model distilled from LAION's Empathic-Insight-Voice (CC BY 4.0, non-clinical) that reads valence and arousal from a few seconds of sound and only nudges where a path starts, on the same terms as the camera: off by default, sound only and never words, processed in memory, never stored, and never presented as how someone feels. Age and gender outputs are never used. Clinical models are out of scope.
- **More recordings.** Freely licensed recordings of the remaining public domain works in MCUD 1.0, found through Musopen, the Internet Archive and Wikimedia Commons, each checked by hand like the first 18.
- **Recommendation evaluation.** Measure whether paths suit listeners' preferences and whether transitions feel gradual, through optional, local "this fits" and "not for me" feedback that never leaves the browser.

## Later

- **Wider musical range.** Genres and styles beyond classical and instrumental, once a freely licensed source with published valence and arousal values is available.
- **Translations** of the app and its questions.
