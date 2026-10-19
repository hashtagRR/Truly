# Roadmap

Planned work for Truly, grouped by release. Every item must pass the scope check in [references/SCOPE.md](references/SCOPE.md): it serves music discovery, selection or playback, and draws no conclusion about anyone's health.

## v0.1.0: a reliable first release

### Quality

- **More tests.** Add the face readout and model shape checks to `tests/`, next to the music path tests that run with GitHub Actions on every pull request.
- **Playback reliability.** Handle slow networks and failed loads, and keep the player usable from the keyboard and on phones.

### Listener preferences

- **Instruments.** Let listeners prefer piano, strings, orchestra or winds, with one instrument tag per recording.
- **Use favourites in paths, and add "not for me".** Let favourite pieces appear more often and let listeners rule pieces out, kept only in the browser.
- **Path length.** Shorter or longer listening sessions.

### Wording

- **Describe the collection honestly.** Present the music as an early classical and instrumental collection until the catalogue grows.

### Release

- Tagged release with release notes and a changelog.
- Face and voice model weights attached under CC BY 4.0, with their model cards.
- Zenodo DOI.

## v0.2: a larger catalogue

- **More recordings.** Freely licensed recordings of the remaining public domain works in MCUD 1.0, found through Musopen, the Internet Archive and Wikimedia Commons, each checked by hand like the first 18.
- **Recommendation evaluation.** Measure whether paths suit listeners' preferences and whether transitions feel gradual, through optional, local "this fits" and "not for me" feedback that never leaves the browser.

## Later

- **Wider musical range.** Genres and styles beyond classical and instrumental, once a freely licensed source with published valence and arousal values is available.
- **Translations** of the app and its questions.
