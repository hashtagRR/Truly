# Datasets

Every dataset the project uses must allow the use we make of it: training, evaluation, or shipping derived data inside the app. This file records which datasets are used, for what, and under which terms. Check the source page before relying on any entry; licences change.

Status key: **use** (adopted), **reference** (used for checking, not shipped), **excluded** (not usable, with the reason).

## Facial expression

| Dataset | Contents | Licence | Status | Role |
|---|---|---|---|---|
| [EmoNet-Face](https://huggingface.co/datasets/laion/emonet-face-hq) (LAION, NeurIPS 2025) | Synthetic faces balanced across ethnicity, age and gender. Big: about 203k images. Binary: about 20k images with expert annotations. HQ: 2,500 expert annotated images. 40 emotion categories | CC BY 4.0 (dataset cards) | use | Main training data for released weights |
| [FER-2013](https://www.kaggle.com/datasets/msambare/fer2013) ([report](https://arxiv.org/abs/1307.0414)) | 35,887 greyscale 48x48 real faces, 7 classes, with public and private test splits | No original licence found. Re-uploads claim ODbL / DbCL, CC BY 4.0, CC BY-NC-SA, CC0 or MIT, and the images were collected from web search | evaluation only | Real face evaluation inside Kaggle notebooks, where it is already hosted. Not redistributed, and not used to train released weights |
| [FER+ labels](https://github.com/microsoft/FERPlus) | Ten annotators per FER-2013 image, cleaner labels, adds contempt | MIT (labels only, images come from FER-2013) | use | Replaces the noisy FER-2013 labels |
| [Empathic-Insight-Face-Large](https://huggingface.co/laion/Empathic-Insight-Face-Large) (LAION) | 40 MLP heads on [SigLIP2 so400m](https://huggingface.co/google/siglip2-so400m-patch16-384) embeddings, trained on EmoNet-Face Big and Binary; ships neutral face baselines | Heads CC BY 4.0; SigLIP2 Apache-2.0 | candidate | Teacher for distillation into the small on-device model; too large to ship |
| [FairFace](https://github.com/joojs/fairface) | About 108k real face crops balanced by race, gender and age; no emotion labels | CC BY 4.0 | candidate | Unlabelled real faces for distillation, so the small model sees real faces |
| [CREMA-D](https://github.com/CheyneyComputerScience/CREMA-D) video | 7,442 clips from 91 actors with crowd ratings of the emotion seen in the video alone | ODbL 1.0, contents DbCL 1.0 | candidate | Real face calibration and evaluation, split by actor |
| AffectNet, RAF-DB, ExpW, CK+, JAFFE, KDEF | Real face expression sets | Research or non-commercial agreements, no redistribution | excluded | Terms do not allow open release of derived weights |
| Kaggle face emotion sets marked CC BY-NC or CC BY-NC-ND | Various | Non-commercial | excluded | Incompatible with an open licence |

**Notes**

- EmoNet-Face is synthetic. Models trained only on it may not transfer well to real webcam faces, so every released model is also scored on FER-2013 with FER+ labels, and the gap is reported in the model card.
- The 40 EmoNet-Face categories map onto the 7 FER classes and onto a valence/arousal estimate through a mapping file in the repo, so the mapping can be reviewed and changed.
- Whether weights trained on FER-2013 images can be released depends on the unresolved FER-2013 terms. Until that is settled, released weights are trained on EmoNet-Face, and FER-2013 is used for evaluation only.

## Voice

Only Kintsugi DAM and its score dataset are in scope, for the private safety signal described in SCOPE.md. The emotion datasets below stay candidates.

| Dataset or model | Contents | Licence | Status | Role |
|---|---|---|---|---|
| [Kintsugi DAM](https://huggingface.co/KintsugiHealth/dam) | Speech model on a Whisper-small.en backbone. Estimates depression and anxiety severity (mapped to PHQ-9 and GAD-7 bands) from acoustics only, no transcription. Trained on about 35,000 people (863 hours, mostly American English); needs about 30 seconds of speech | Apache-2.0 | use | Private, opt-in signal for the safety layer only. Never shown to users |
| [Kintsugi DAM dataset](https://huggingface.co/datasets/KintsugiHealth/dam-dataset) | Scores, demographics and metadata per recording, for threshold tuning; no audio | Apache-2.0 | use | Threshold and fairness checks |
| [CREMA-D](https://github.com/CheyneyComputerScience/CREMA-D) | 7,442 acted clips from 91 actors, 6 emotions | ODbL 1.0, contents DbCL 1.0 | candidate | Real speech training and evaluation for voice emotion |
| EmoNet-Voice (LAION) | Synthetic speech with expert emotion annotations, 40 categories; bench set 12,600 clips | CC BY 4.0 | candidate | Training data, the voice counterpart of EmoNet-Face |
| [Emolia](https://huggingface.co/datasets/laion/Emolia) | Emilia speech with EmoNet emotion scores | Annotations CC BY 4.0; underlying Emilia audio licensed per subset (original Emilia CC BY-NC 4.0, YODAS subset CC BY 4.0) | candidate, YODAS subset only | Large scale pretraining |
| RAVDESS, TESS | Acted emotional speech | CC BY-NC-SA 4.0, CC BY-NC-ND 4.0 | excluded | Non-commercial |
| IEMOCAP, MSP-Podcast | Conversational emotional speech | Signed academic licences; commercial use needs a paid licence | excluded | Terms do not allow open release of derived weights |
| audeering wav2vec2 emotion model | Pretrained voice valence/arousal/dominance | CC BY-NC-SA 4.0 | excluded | Non-commercial |
| emotion2vec+ | Pretrained voice emotion model | Custom FunASR model licence | needs review | Possible backbone |

## Music catalogue (what the app recommends)

| Dataset | Contents | Licence | Status | Role |
|---|---|---|---|---|
| [MuSe](https://zenodo.org/record/4281165) (Akiki and Burghardt, 2021) | 90,408 songs with valence, arousal and dominance computed from Last.fm tags, plus artist, title, MusicBrainz ID and a Spotify ID for about 68% | CC BY 4.0 | use | Main catalogue: valence/arousal position of each song |
| [AcousticBrainz](https://acousticbrainz.org/) | Essentia analysis of about 29.5M submissions keyed by MusicBrainz ID: tempo, key, loudness, danceability, and mood classifiers (happy, sad, relaxed, aggressive, party, acoustic, electronic) | CC0 | use | Adds tempo and mood probabilities to MuSe songs through the MusicBrainz ID. Only the needed fields are fetched, through the bulk API, instead of the full dumps |
| [FMA](https://github.com/mdeff/fma) | Large Creative Commons audio archive with genre metadata and per track licences | Code MIT; metadata CC BY 4.0; audio per track CC, with a commercial use filter | use | Open audio tier: tracks the app can play directly, filtered to licences that allow redistribution. The `echonest.csv` and `raw_echonest.csv` files are not used: those features came from the Echo Nest API, now owned by Spotify |
| [MTG-Jamendo](https://github.com/MTG/mtg-jamendo-dataset) | 55k tracks with mood/theme tags | Code Apache-2.0, but metadata CC BY-NC-SA 4.0, and the dataset is "made available solely for non-commercial research and academic use"; other uses need written permission from Jamendo | excluded | Non-commercial terms |
| Spotify derived feature dumps on Kaggle | Valence, energy and so on, taken from the Spotify API | Spotify Developer Terms and Policy forbid using Spotify content to train or feed ML models | excluded | Terms conflict with the project's use |
| [DEAM](https://cvml.unige.ch/databases/DEAM/manual.pdf), [EMOPIA](https://zenodo.org/records/5090631) | Valence/arousal annotated music | Non-commercial (DEAM CC BY-NC; EMOPIA CC BY-NC-SA per its repository) | excluded | Non-commercial terms |

## Music therapy grounding

No large, openly licensed dataset of music therapy playlists exists. The therapy specific part of the project therefore comes from method (the iso principle) and from the clinical and induced emotion sources below, used to check that the recommender behaves like clinical practice.

| Dataset | Contents | Licence | Status | Role |
|---|---|---|---|---|
| [MCUD 1.0](https://doi.org/10.6084/m9.figshare.30517820.v7) ([paper](https://www.nature.com/articles/s41597-026-07978-7), Scientific Data, 2026) | 42 playlists and 378 songs used in randomised controlled trials (PubMed, 2002 to 2024), covering affective and anxiety disorders, neurodegenerative disease and cardiovascular conditions. Playlist level: treatment goal, condition, intervention type. Song level: genre, emotion, lyrics, acoustic features, source links. No audio | Data CC BY 4.0 (figshare); [code](https://github.com/blinkhor/MCUD) MIT; article CC BY-NC-ND 4.0 | reference | Checks that generated paths resemble clinical playlists in tempo, energy and emotion for depression and anxiety goals. The lyrics file is used locally only and never redistributed, because song lyrics stay under their own copyright |
| [Emotify](https://www2.projects.science.uu.nl/memotion/emotifydata/) and [Emotify+](https://data.mendeley.com/datasets/wbk8zr9bd2/1) | 400 one minute excerpts in 4 genres. Emotify: induced emotion on the GEMS scale (peacefulness, tenderness, nostalgia, sadness, tension, joyful activation and others). Emotify+: perceived emotion | No licence on the dataset page, only a request to cite; the music is described as Creative Commons without a version | pending, ask the authors | Would calibrate the difference between music that sounds sad and music that makes a listener feel calmer. Not used until the authors confirm terms |
| [PMEmo](https://github.com/HuiZhangDB/PMEmo) | 794 songs with valence/arousal and listener skin conductance | Repository MIT; audio is chorus excerpts of commercial songs, still under their owners' copyright | reference, annotations only | Possible check of arousal estimates against a physiological signal. Audio excerpts are not used |
| Kaggle "Music Therapy Emotional Response Dataset" | 3,000 session records with physiological signals and outcomes | CC0, but no stated source, study or ethics approval | excluded | Provenance unknown; likely synthetic |

## How the parts fit

1. **Song position.** MuSe valence/arousal, refined with AcousticBrainz tempo and mood probabilities, places each song in valence/energy space.
2. **Path.** The iso recommender starts near the user's current point and steps towards the target.
3. **Clinical check.** The tempo, energy and emotion profile of generated paths is compared with MCUD depression and anxiety playlists.
4. **Playback.** Catalogue songs open as links in the user's own player. FMA tracks with suitable licences can play inside the app.

## Local layout

Datasets live under `data/`, one directory per source, and are never committed. Large sets stay at their source and are loaded inside Kaggle notebooks: EmoNet-Face Big (11.5 GB, Hugging Face), FER-2013 (Kaggle) and FMA audio.

| Directory | Source |
|---|---|
| `data/muse/` | MuSe CSV |
| `data/acousticbrainz/` | Fields fetched for MuSe songs, gzipped JSON lines |
| `data/mcud/` | MCUD 1.0 spreadsheets |
| `data/ferplus/` | FER+ labels and licence |
| `data/fma/` | FMA metadata archive, read in place |
| `data/emonet-face/` | EmoNet-Face HQ and Binary parquet files |

## Open items

- FER-2013: no original licence exists to confirm. It stays evaluation only.
- Emotify: ask the authors for terms before use.
- PMEmo: annotations sit in a Google Drive folder; fetch them when the arousal check is built.
