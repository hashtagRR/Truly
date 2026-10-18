# Related work

What already exists, and where this project differs.

## Face to music recommenders

Many projects detect an emotion from a webcam face and pick songs for it. Examples: [Emotion-Music-Recommendation](https://github.com/aj-naik/Emotion-Music-Recommendation) (MIT, FER-2013, Flask), [Moodify](https://github.com/hoangsonww/Moodify-Emotion-Music-App) (MIT, actively maintained), [MoodTunes](https://github.com/gimnathperera/Emotion-based-music-player), and published systems such as [Athavle et al.](https://www.researchgate.net/publication/354855186_Music_Recommendation_Based_on_Face_Emotion_Recognition), [a CNN system in Evolving Systems (2023)](https://link.springer.com/article/10.1007/s12530-023-09506-z) and [arXiv 2503.20739](https://arxiv.org/pdf/2503.20739).

Common pattern: report classifier accuracy on FER-2013, CK+ or RAF datasets, then map the label to a playlist. None found reports a study with users, and none includes self-report, a path between moods, or a safety pathway.

## Iso principle playlists

| Work | What it does | Status |
|---|---|---|
| [MoodFlow](https://zenodo.org/records/22276710) (White and Belen Saglam, University of East London, AIMC 2026) | Free text mood input plus intensity; iso principle as a blend ratio between current and target mood; rules from a therapist survey (N=15), a public survey (N=203) and the MxMH dataset | Pilot of 32 sessions, perceived safety 4.68/5, relevance vs mood change R² = 0.36. No code link found |
| [Starcke and von Georgi (Musicae Scientiae, 2024)](https://doi.org/10.1177/10298649231175029) | Maps baseline valence/arousal onto a valence/arousal music database and builds sequences towards lower arousal and higher valence | Experimental studies |
| [Lowe-Brown, Glasser, Wadley and Koval (Musicae Scientiae, 2026)](https://journals.sagepub.com/doi/10.1177/10298649261421187) | Pre-registered randomised comparison of iso, compensatory and unguided listening for anxiety, N=193 | Full results not checked (paywalled) |
| [NCT05442099](https://clinicaltrials.gov/study/NCT05442099), [NCT07055061](https://clinicaltrials.gov/study/NCT07055061) | Trials of iso principle playlists for anxiety, stress and depression | Registered trials |
| [alansun17904/iso-based-playlist-generation](https://github.com/alansun17904/iso-based-playlist-generation) (GPL-3.0, 2021), [venti-music](https://github.com/tirthshah7/venti-music) (MIT, 2026) | Small open source iso playlist generators | Hobby scale |

## Music apps for mental health

- **[Music eScape](https://pmc.ncbi.nlm.nih.gov/articles/PMC6352004/)** (JMIR mHealth, 2019): music based emotion regulation app, RCT with 169 distressed young people. No difference from the delayed access group at 1 month; both groups improved at 2, 3 and 6 months. Lesson: engagement and effect sizes are hard, and a tool must claim little.
- **[Piano listening RCT](https://pmc.ncbi.nlm.nih.gov/articles/PMC13391252/)**: 120 university students, 20 days of daily listening, lower depressive symptoms than white noise. Non-clinical sample.
- **Commercial:** Endel (proprietary generative soundscapes, can use heart rate) and Humm.ly (content from music therapists, proprietary). Open source wellbeing apps such as Medito cover meditation, not music based mood regulation.

## Voice and depression

- **Evidence:** a [2025 systematic review](https://www.sciencedirect.com/science/article/abs/pii/S0892199725001870) of voice quality markers reports AUCs of 0.71 to 0.93, with high risk of bias in several studies. A [2026 Nature Communications study](https://www.nature.com/articles/s41467-026-74122-9) reports 88% accuracy on external validation (AUC 0.879, 160 people). A [Frontiers review](https://www.frontiersin.org/journals/digital-health/articles/10.3389/fdgth.2026.1964389/full) found much smaller gains in unselected clinical samples, and that speech embeddings mostly encode speaker sex and identity. Pause length, utterance length and spectral features recur across cohorts ([arXiv 2604.01533](https://arxiv.org/pdf/2604.01533)). Overall: a plausible screening or monitoring signal, not a diagnosis.
- **Kintsugi:** a voice biomarker company that [closed in February 2026 and released its technology](https://bhbusiness.com/2026/02/11/mental-health-voice-biomarker-kintsugi-closes-makes-all-technology-and-research-public/). Its [DAM model](https://huggingface.co/KintsugiHealth/dam) is Apache-2.0, estimates depression and anxiety severity from 30 seconds of speech, and was trained on about 35,000 people.

## Reading emotion from faces

[Barrett et al. (2019)](https://pmc.ncbi.nlm.nih.gov/articles/PMC6640856/) review the evidence and find that facial movements do not reliably and specifically signal emotional states: a smile can mean many things. [Patients with depression also recognise facial affect differently](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10097677/). This supports the design choice that self-report outranks the camera, and that the camera is optional.

## Where this project differs

1. **Self-report first, camera optional,** with the gap between a happy face and a low self-report treated as the signal. No face to music project found does this.
2. **Iso path grounded in clinical playlists:** paths are checked against playlists from randomised trials (MCUD 1.0), not only rules or surveys.
3. **Safety pathway built in:** persistent low mood leads to people and helplines. None of the face to music projects found has one.
4. **Open and licence clean end to end:** code, model weights and catalogue all redistributable, with on-device inference.
5. **Honest reporting:** per class test results on real faces, including weak classes, published with each model.
