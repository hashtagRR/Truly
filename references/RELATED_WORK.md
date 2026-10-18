# Related work

Truly builds on a body of open projects and research in emotion-aware music, music therapy and digital mental health. This page credits the work closest to it.

## Emotion-aware music recommendation

Many open projects recommend music from a facial expression captured by a webcam, among them [Emotion-Music-Recommendation](https://github.com/aj-naik/Emotion-Music-Recommendation), [Moodify](https://github.com/hoangsonww/Moodify-Emotion-Music-App) and [MoodTunes](https://github.com/gimnathperera/Emotion-based-music-player), along with published systems such as [Athavle et al.](https://www.researchgate.net/publication/354855186_Music_Recommendation_Based_on_Face_Emotion_Recognition) and [arXiv 2503.20739](https://arxiv.org/pdf/2503.20739). Surveys of affective recommender systems give a wider view of the field ([Hasan and Bunescu, 2025](https://arxiv.org/pdf/2508.20289); [Kheiri and Ding, 2026](https://doi.org/10.1145/3813108)).

## Iso principle playlists

| Work | Approach |
|---|---|
| [MoodFlow](https://zenodo.org/records/22276710) (White and Belen Saglam, AIMC 2026) | Free text mood input with intensity; the iso principle as a blend between current and target mood; rules informed by music therapists and a public survey |
| [Starcke and von Georgi (2024)](https://doi.org/10.1177/10298649231175029) | Sequences built from a valence and arousal music database, moving from the listener's baseline towards calmer and more positive states |
| [Lowe-Brown, Glasser, Wadley and Koval (2026)](https://journals.sagepub.com/doi/10.1177/10298649261421187) | Pre-registered randomised comparison of iso principle, compensatory and unguided listening for anxiety |
| [NCT05442099](https://clinicaltrials.gov/study/NCT05442099), [NCT07055061](https://clinicaltrials.gov/study/NCT07055061) | Registered trials of iso principle playlists for anxiety, stress and depression |
| [iso-based-playlist-generation](https://github.com/alansun17904/iso-based-playlist-generation), [venti-music](https://github.com/tirthshah7/venti-music) | Open source iso principle playlist generators |

## Music for mental health

- [Music eScape](https://pmc.ncbi.nlm.nih.gov/articles/PMC6352004/) evaluated a music-based emotion regulation app with 169 young people in a randomised controlled trial.
- A [randomised trial of daily piano listening](https://pmc.ncbi.nlm.nih.gov/articles/PMC13391252/) with 120 university students found lower depressive symptoms than a white noise control.
- Endel and Humm.ly offer sound and music experiences for relaxation and wellbeing, and Medito offers open source meditation.

## Voice and mental health

Kintsugi developed voice biomarker technology for depression and anxiety screening and [released its research and models openly in 2026](https://bhbusiness.com/2026/02/11/mental-health-voice-biomarker-kintsugi-closes-makes-all-technology-and-research-public/). Its DAM model is the voice signal used in Truly. The research behind using voice is summarised in [RESEARCH.md](RESEARCH.md).

## How Truly brings these together

Truly combines several of these ideas in one open, on-device tool:

1. A self-report check-in as the primary signal, with an optional camera that notices when outward expression and self-report differ.
2. Music paths built on the iso principle and compared with playlists used in clinical trials.
3. A gentle pathway to people and helplines, supported by an optional voice signal.
4. Openly licensed code, data and models, with all processing on the user's device.
