# Truly voice model v1

A small audio model that runs in the listener's browser inside Truly. From five seconds of sound it estimates two music-relevant dimensions: arousal (energy) and valence (mood). Truly uses the result only to nudge where a music path starts, mainly by energy. It reads the sound of the voice and never its words.

## Intended use

An optional, playful input to music recommendation. It is not a reading of how anyone feels, and it is not designed or intended for medical, diagnostic, psychological assessment, therapeutic or clinical purposes. No identity, age, gender or other attribute is estimated. See [references/SCOPE.md](../../references/SCOPE.md).

## Model

| | |
|---|---|
| Architecture | Log-mel front end built from fixed convolution layers (400 sample window, 160 sample hop, 64 mel bands, per-clip standardisation), then a four-block CNN (24, 48, 96 and 128 channels) with global average pooling and a linear layer; 420,410 parameters |
| Input | `audio`: 80,000 samples, 5 seconds of 16 kHz mono audio in [-1, 1], with its sounding parts brought to an RMS of 0.05 |
| Output | `scores`: valence and arousal, standardised (see `readout.json`) |
| Format | ONNX, opset 17, 2.4 MB |
| Licence | CC BY 4.0 |

## Training

The model was trained by distillation: it learns to reproduce the Valence and Arousal outputs of [Empathic-Insight-Voice-Small](https://huggingface.co/laion/Empathic-Insight-Voice-Small) (LAION), which runs on [BUD-E-Whisper](https://huggingface.co/laion/BUD-E-Whisper) audio embeddings. Only those two outputs of the teacher were ever computed.

| | |
|---|---|
| Audio | 12,932 five-second windows: 3,592 from LAION's Got Talent, 6,000 from the YODAS part of Emolia, 3,340 from CREMA-D actors with even identifiers |
| Split | 12,286 training, 646 validation |
| Target | Teacher scores, standardised per output |
| Loss | Smooth L1 |
| Optimiser | AdamW, learning rate 2e-3 with a one-cycle schedule, weight decay 0.01, batch size 64, 30 epochs |
| Augmentation | Random time shift up to 0.5 seconds, gain 0.5 to 1.6, added noise at 15 to 40 dB SNR (70%) |
| Compute | One NVIDIA T4 GPU on Kaggle, 19 minutes including evaluation |

Training and app audio go through the same loudness step, so the model sees speech at a consistent level however close the listener is to the microphone.

## Readout

`readout.json` turns the output into values relative to everyday speech:

1. Multiply each output by `target_std` and add `target_mean` to recover the teacher scale.
2. Subtract `reference`, the teacher's mean on natural speech from Emolia YODAS, and divide by `target_std` again.

A value of 0 means about as lively, or as bright, as ordinary talking. The app caps each value at 1.5 and moves the start of the path by at most 0.4 standard deviations of the catalogue's arousal and 0.12 of its valence.

## Evaluation

Agreement with the teacher (Pearson correlation):

| Test set | Clips | Arousal | Valence |
|---|---|---|---|
| Validation (all sources) | 646 | 0.897 | 0.870 |
| CREMA-D, actors with odd identifiers | 3,457 | 0.787 | 0.139 |

Mean arousal on the teacher scale for CREMA-D test clips, grouped by the emotion that listeners heard in the audio alone:

| | anger | disgust | fear | happy | neutral | sad |
|---|---|---|---|---|---|---|
| Student | 1.35 | 1.05 | 1.16 | 1.20 | 0.92 | 0.93 |
| Teacher | 1.34 | 1.07 | 1.17 | 1.25 | 0.90 | 0.95 |

CREMA-D actors speak the same neutral sentences in every emotion, so the teacher's valence varies little on them; Truly gives valence only a light weight.

## Credit

If you use this model, please credit Truly and the teacher and data sources listed in [references/DATASETS.md](../../references/DATASETS.md).
