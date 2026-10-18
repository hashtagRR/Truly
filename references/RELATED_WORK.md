# Related work

Truly builds on open projects and research in emotion-aware music recommendation and mood-based playlists. This page credits the work closest to it.

## Emotion-aware music recommendation

Many open projects recommend music from a mood or a facial expression, among them [Emotion-Music-Recommendation](https://github.com/aj-naik/Emotion-Music-Recommendation), [Moodify](https://github.com/hoangsonww/Moodify-Emotion-Music-App) and [MoodTunes](https://github.com/gimnathperera/Emotion-based-music-player), along with published systems such as [Athavle et al.](https://www.researchgate.net/publication/354855186_Music_Recommendation_Based_on_Face_Emotion_Recognition) and [arXiv 2503.20739](https://arxiv.org/pdf/2503.20739). Surveys of affective recommender systems give a wider view of the field ([Hasan and Bunescu, 2025](https://arxiv.org/pdf/2508.20289); [Kheiri and Ding, 2026](https://doi.org/10.1145/3813108)).

## Mood-based playlist sequencing

| Work | Approach |
|---|---|
| [MoodFlow](https://zenodo.org/records/22276710) (White and Belen Saglam, AIMC 2026) | Playlists that blend from a current towards a target mood, weighted by the mood's intensity |
| [Starcke and von Georgi (2024)](https://doi.org/10.1177/10298649231175029) | Sequences built from a valence and arousal music database, moving from the listener's starting state |
| [iso-based-playlist-generation](https://github.com/alansun17904/iso-based-playlist-generation), [venti-music](https://github.com/tirthshah7/venti-music) | Open source playlist generators that move gradually between moods |

## How Truly brings these together

1. Mood and energy answers place the listener on the same valence and arousal map as the music.
2. Paths start near that point and move in small, forward steps in the direction the listener chooses, with a reason shown for every piece.
3. Every recording is freely licensed and plays inside the app from Truly's own site.
4. All processing happens in the browser, with optional local history and an optional camera that only nudges the start.
