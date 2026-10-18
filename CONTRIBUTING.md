# Contributing to Truly

Thank you for helping. Truly is a free, open source music recommender, and contributions of code, recordings, translations, design and research are all welcome.

## The scope comes first

Every change has to fit [references/SCOPE.md](references/SCOPE.md), the single source of truth for what Truly is. In short: Truly helps people find and play music that suits how they feel. No feature may produce a conclusion about a person's mental health, and every personalised output is a music recommendation, a music preference, or an explanation of a recommendation.

Proposals for diagnosis, screening, risk scores, health monitoring, clinical questionnaires, therapy claims or automatic referrals are out of scope and will not be merged, however they are framed.

## Proposing a change

1. Open an issue describing what you would like to change and why it helps people find music.
2. Fork the repository and make the change on a branch.
3. Open a pull request. The template includes the scope checklist; answer every item.

## Good places to start

- **Recordings.** Freely licensed recordings of public domain works, with valence, arousal and tempo from a published source. See `music/recordings.json` and the credits rules in the [Truly-music](https://github.com/hashtagRR/Truly-music) repository.
- **Listening preferences.** Ways for listeners to shape paths, such as instruments or tempo.
- **Translations** of the check-in questions in `docs/app/checkin.json`.
- **Accessibility** improvements to the app and the website.

## Style

- Plain HTML, CSS and JavaScript modules in the app, with no build step.
- Short, plain sentences in the interface and documentation.
- New files carry the SPDX licence header used across the repository.

By contributing, you agree that your contribution is released under AGPL-3.0-or-later.
