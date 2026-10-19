# Roadmap

Planned work for Truly, grouped by release. Every item must pass the scope check in [references/SCOPE.md](references/SCOPE.md): it serves music discovery, selection or playback, and draws no conclusion about anyone's health.

## v0.1.0: a reliable first release

### Release

- Tagged release with release notes and a changelog.
- Face and voice model weights attached under CC BY 4.0, with their model cards.

## v0.2: a larger catalogue

- **More recordings.** Freely licensed recordings of the remaining public domain works in MCUD 1.0, found through Musopen, the Internet Archive and Wikimedia Commons, each checked by hand like the first 18.
- **Recommendation evaluation.** Measure whether paths suit listeners' preferences and whether transitions feel gradual, through optional, local "this fits" and "not for me" feedback that never leaves the browser.

## Later

- **Wider musical range.** Genres and styles beyond classical and instrumental. [Memo2496](https://figshare.com/articles/dataset/Memo2496/25827034) is the leading candidate: 2,496 instrumental tracks with valence and arousal rated by 30 music experts, released under CC BY 4.0. Each track's audio licence needs checking against its source before it can be played in Truly, as for the first 18 recordings.
- **Smoother transitions within pieces.** Memo2496 rates mood moment by moment through each track. With it, a path could start a piece at a fitting point, or match how one piece ends to how the next begins.
- **Translations** of the app and its questions.
