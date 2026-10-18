# Data and models

Truly is built on openly shared datasets, models and recordings. This page lists each one, what Truly uses it for, its licence, and the work to cite. Each source keeps its own licence and terms; please credit the original authors when you use them.

## Face

| Source | What it provides | Licence | Use in Truly |
|---|---|---|---|
| [EmoNet-Face](https://huggingface.co/datasets/laion/emonet-face-hq) (Schuhmann et al., 2025) | Demographically balanced face images with expert annotations across a 40 category emotion taxonomy, in three sets: Big, Binary and HQ | CC BY 4.0 | Training images for distillation (Big and Binary) and expert-rated evaluation (HQ) |
| [Empathic-Insight-Face-Large](https://huggingface.co/laion/Empathic-Insight-Face-Large) (LAION) | 40 emotion intensity models on SigLIP 2 image embeddings, with neutral face reference scores | CC BY 4.0 | Teacher model distilled into Truly's on-device model |
| [SigLIP 2](https://huggingface.co/google/siglip2-so400m-patch16-384) (Tschannen et al., 2025) | Image encoder used by the teacher | Apache-2.0 | Image embeddings for the teacher |
| [FairFace](https://github.com/joojs/fairface) (Kärkkäinen and Joo, 2021) | Face images balanced across race, gender and age | CC BY 4.0 | Real face images for distillation |
| [CREMA-D](https://github.com/CheyneyComputerScience/CREMA-D) (Cao et al., 2014) | Audio-visual recordings of 91 actors with crowd-sourced emotion ratings, including ratings of the video alone | ODbL 1.0, contents DbCL 1.0 | Calibration and evaluation on real faces, split by actor |
| [FER-2013](https://www.kaggle.com/datasets/deadskull7/fer2013) (Goodfellow et al., 2015) and [FER+](https://github.com/microsoft/FERPlus) labels (Barsoum et al., 2016) | Facial expression images with seven class labels, and ten-annotator relabelling | FER+ labels MIT; images as distributed on Kaggle | Evaluation only |
| [EfficientNet-B0](https://huggingface.co/timm/efficientnet_b0.ra_in1k) (Tan and Le, 2019) | Compact image model architecture with pretrained weights | Apache-2.0 | Base of the on-device face model |
| [Ultra-Light-Fast-Generic-Face-Detector-1MB](https://github.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB) | Small face detector (RFB-320) | MIT | Finds the face in camera frames before the expression model runs |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) | Runs ONNX models in the browser with WebAssembly | MIT | Runs both face models on the user's device |

The 40 EmoNet-Face categories are mapped to seven expression classes and to valence and arousal in [mappings/emonet_categories.json](../mappings/emonet_categories.json).

## Music

| Source | What it provides | Licence | Use in Truly |
|---|---|---|---|
| [MuSe](https://zenodo.org/record/4281165) (Akiki and Burghardt, 2021) | Valence, arousal and dominance for about 90,000 songs, with MusicBrainz identifiers | CC BY 4.0 | Song valence and arousal, prepared for extending the catalogue |
| [AcousticBrainz](https://acousticbrainz.org/) (Porter et al., 2015) | Audio descriptors and mood classifier outputs keyed by MusicBrainz identifier | CC0 | Tempo and classifier outputs, prepared for extending the catalogue |
| [FMA](https://github.com/mdeff/fma) (Defferrard et al., 2017) | Creative Commons music archive with per-track licences and metadata | Metadata CC BY 4.0; audio per track | Tracks that can be played inside the app |
| [MCUD 1.0](https://doi.org/10.6084/m9.figshare.30517820.v7) (Du et al., 2026) | Playlists and songs used in randomised controlled trials of music interventions, with clinical and song level annotations | CC BY 4.0 | Which works to include, their valence, arousal and tempo, and the reference for path targets |

| Recordings on [Wikimedia Commons](https://commons.wikimedia.org) | Freely licensed recordings of the trial works, by the performers listed in [Truly-music credits](https://github.com/hashtagRR/Truly-music/blob/main/CREDITS.md) | Public domain, CC0, CC BY or CC BY-SA, per recording | The music played in the app |

## Local layout

Datasets are stored under `data/`, one directory per source, and are not part of the repository. Large sets are loaded directly inside Kaggle notebooks.

| Directory | Source |
|---|---|
| `data/muse/` | MuSe |
| `data/acousticbrainz/` | AcousticBrainz fields for MuSe songs, gzipped JSON lines |
| `data/mcud/` | MCUD 1.0 |
| `data/ferplus/` | FER+ labels and licence |
| `data/fma/` | FMA metadata |
| `data/emonet-face/` | EmoNet-Face HQ and Binary |

## References

- Akiki, C., and Burghardt, M. (2021). MuSe: The musical sentiment dataset. *Journal of Open Humanities Data*, 7. [doi:10.5334/johd.33](https://doi.org/10.5334/johd.33)
- Barsoum, E., Zhang, C., Ferrer, C. C., and Zhang, Z. (2016). Training deep networks for facial expression recognition with crowd-sourced label distribution. *Proceedings of the 18th ACM International Conference on Multimodal Interaction*, 279 to 283. [doi:10.1145/2993148.2993165](https://doi.org/10.1145/2993148.2993165)
- Cao, H., Cooper, D. G., Keutmann, M. K., Gur, R. C., Nenkova, A., and Verma, R. (2014). CREMA-D: Crowd-sourced emotional multimodal actors dataset. *IEEE Transactions on Affective Computing*, 5(4), 377 to 390. [doi:10.1109/TAFFC.2014.2336244](https://doi.org/10.1109/TAFFC.2014.2336244)
- Defferrard, M., Benzi, K., Vandergheynst, P., and Bresson, X. (2017). FMA: A dataset for music analysis. *Proceedings of the 18th International Society for Music Information Retrieval Conference*. [arXiv:1612.01840](https://arxiv.org/abs/1612.01840)
- Du, J., Song, J., Xu, Z., Fang, Y., Zhang, Y., Bi, C., Zheng, X., and Shen, B. (2026). MCUD 1.0: A clinical music usage data resource for personalized music therapy. *Scientific Data*. [doi:10.1038/s41597-026-07978-7](https://doi.org/10.1038/s41597-026-07978-7)
- Goodfellow, I. J., Erhan, D., Carrier, P. L., Courville, A., Mirza, M., Hamner, B., et al. (2015). Challenges in representation learning: A report on three machine learning contests. *Neural Networks*, 64, 59 to 63. [doi:10.1016/j.neunet.2014.09.005](https://doi.org/10.1016/j.neunet.2014.09.005)
- Kärkkäinen, K., and Joo, J. (2021). FairFace: Face attribute dataset for balanced race, gender, and age for bias measurement and mitigation. *IEEE Winter Conference on Applications of Computer Vision*, 1547 to 1557. [doi:10.1109/WACV48630.2021.00159](https://doi.org/10.1109/WACV48630.2021.00159)
- Porter, A., Bogdanov, D., Kaye, R., Tsukanov, R., and Serra, X. (2015). AcousticBrainz: A community platform for gathering music information obtained from audio. *Proceedings of the 16th International Society for Music Information Retrieval Conference*, 786 to 792.
- Schuhmann, C., Kaczmarczyk, R., Rabby, G., Friedrich, F., Kraus, M., Kalyan, K., et al. (2025). EmoNet-Face: An expert-annotated benchmark for synthetic emotion recognition. *Advances in Neural Information Processing Systems, Datasets and Benchmarks Track*. [arXiv:2505.20033](https://arxiv.org/abs/2505.20033)
- Tan, M., and Le, Q. V. (2019). EfficientNet: Rethinking model scaling for convolutional neural networks. *Proceedings of the 36th International Conference on Machine Learning*. [arXiv:1905.11946](https://arxiv.org/abs/1905.11946)
- Tschannen, M., Gritsenko, A., Wang, X., Naeem, M. F., Alabdulmohsin, I., Parthasarathy, N., et al. (2025). SigLIP 2: Multilingual vision-language encoders with improved semantic understanding, localization, and dense features. [arXiv:2502.14786](https://arxiv.org/abs/2502.14786)
