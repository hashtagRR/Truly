# Truly face expression model v1

A compact face expression model that runs on the user's device inside Truly. It estimates the intensity of 40 emotion categories from a face image, and maps them to seven expression classes and to valence and arousal.

## Model

| | |
|---|---|
| Architecture | EfficientNet-B0 (`timm` `efficientnet_b0.ra_in1k`), about 4.1 million parameters |
| Input | One RGB face crop, 224 by 224 pixels, normalised with ImageNet mean and standard deviation |
| Output | 40 scores, one per EmoNet-Face category (standardised; see `readout.json`) |
| Format | ONNX, opset 17, 16.2 MB |
| Licence | CC BY 4.0 |

## Training

The model was trained by distillation: it learns to reproduce the 40 category scores of [Empathic-Insight-Face-Large](https://huggingface.co/laion/Empathic-Insight-Face-Large) (LAION), which runs on [SigLIP 2](https://huggingface.co/google/siglip2-so400m-patch16-384) image embeddings.

| | |
|---|---|
| Images | 79,999: 40,000 from FairFace, 20,000 from EmoNet-Face Big, 19,999 from EmoNet-Face Binary |
| Split | 76,000 training, 3,999 validation |
| Target | Teacher scores, standardised per category |
| Loss | Smooth L1 |
| Optimiser | AdamW, learning rate 1e-3 with a one-cycle schedule, weight decay 0.02, batch size 128, 8 epochs |
| Augmentation | Random crop (80 to 100%), horizontal flip, rotation up to 10 degrees, greyscale (25%), downscaling to 48 to 96 pixels (25%), brightness and contrast jitter |
| Compute | Two NVIDIA T4 GPUs on Kaggle, 31.8 minutes including evaluation |

No FER-2013 image or label was used for training or calibration.

## Readout

`readout.json` holds everything needed to turn the model output into expression classes:

1. Multiply each output by `target_std` and add `target_mean` to recover the 40 category scores.
2. For each expression class, average the scores of its categories (`groups`, from [mappings/emonet_categories.json](../../mappings/emonet_categories.json)).
3. Score neutral as minus the highest of the six emotional class averages.
4. Add the calibration `offsets` and take the highest class.

The offsets were fitted on CREMA-D video frames from actors with even identifiers. Surprise does not occur in CREMA-D and keeps an offset of zero.

## Evaluation

All results use the calibrated readout. CREMA-D results use only actors with odd identifiers, none of whom were used for calibration. Per-class columns give recall.

| Test set | Images | Accuracy | Macro F1 | angry | disgust | fear | happy | neutral | sad | surprise |
|---|---|---|---|---|---|---|---|---|---|---|
| FER-2013 PrivateTest | 3,589 | 51.0% | 0.422 | 0.36 | 0.27 | 0.09 | 0.78 | 0.51 | 0.34 | 0.91 |
| FER-2013 PublicTest | 3,589 | 50.9% | 0.422 | 0.37 | 0.30 | 0.07 | 0.79 | 0.47 | 0.34 | 0.93 |
| FER+ PrivateTest | 3,350 | 59.5% | 0.461 | 0.50 | 0.41 | 0.20 | 0.79 | 0.44 | 0.39 | 0.96 |
| FER+ PublicTest | 3,372 | 59.8% | 0.463 | 0.53 | 0.35 | 0.15 | 0.83 | 0.42 | 0.38 | 0.97 |
| CREMA-D clips | 3,533 | 36.9% | 0.392 | 0.14 | 0.36 | 0.34 | 0.55 | 0.42 | 0.25 |  |
| CREMA-D frames | 7,066 | 36.2% | 0.376 | 0.12 | 0.31 | 0.30 | 0.55 | 0.44 | 0.28 |  |

CREMA-D has no surprise class; clip results average the scores of two frames per clip.

On FER-2013 PrivateTest, the readout without calibration offsets reaches 46.9% (FER+ labels: 57.6%).

**Agreement with psychology experts.** On EmoNet-Face HQ (2,500 images, four expert ratings each on all 40 categories), the mean Spearman correlation between model scores and expert intensity is 0.458, and the mean AUROC for detecting categories rated 2 or higher is 0.793.

## Intended use

The model is one optional input to Truly's mood state. It suggests a starting point for the music path and notices when a person's expression differs from their own check-in answers. It runs only when the user turns the camera on, and frames are processed in memory and never stored.

The model does not make decisions about people. It is not used for diagnosis, does not trigger Truly's help prompts, and is not intended for emotion recognition in workplaces or schools, surveillance, law enforcement, hiring, credit, insurance or any similar setting.

## Files

| File | Contents |
|---|---|
| `face_student.onnx` | Model weights (published with releases) |
| `readout.json` | Category order, score scaling, class groups, calibration offsets and input normalisation |

## Credits

Built with EmoNet-Face and Empathic-Insight-Face by LAION (CC BY 4.0), SigLIP 2 by Google (Apache-2.0), FairFace by Kärkkäinen and Joo (CC BY 4.0), CREMA-D by Cao and colleagues (ODbL / DbCL), and EfficientNet by Tan and Le with `timm` weights (Apache-2.0). FER-2013 and FER+ were used for evaluation. Full citations are in [references/DATASETS.md](../../references/DATASETS.md).
