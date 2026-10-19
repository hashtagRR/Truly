# Models and licences

| File | Source | Licence |
|---|---|---|
| `truly-face-v1.onnx`, `truly-face-v1-readout.json` | Truly face expression model v1, see the [model card](https://github.com/hashtagRR/Truly/blob/main/models/face/MODEL_CARD.md) | CC BY 4.0 |
| `truly-voice-v1.onnx` | Truly voice model v1, see the [model card](https://github.com/hashtagRR/Truly/blob/main/models/voice/MODEL_CARD.md). Distilled from the Valence and Arousal models of [Empathic-Insight-Voice-Small](https://huggingface.co/laion/Empathic-Insight-Voice-Small) on [BUD-E-Whisper](https://huggingface.co/laion/BUD-E-Whisper), both by LAION under CC BY 4.0 | CC BY 4.0 |
| `ultraface-rfb-320.onnx` | [Ultra-Light-Fast-Generic-Face-Detector-1MB](https://github.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB), version RFB-320 | MIT, see `ULTRAFACE-LICENSE` |

The ONNX Runtime Web files in `../vendor/ort/` are from [ONNX Runtime](https://github.com/microsoft/onnxruntime) 1.30.0, MIT licence, see `../vendor/ort/LICENSE`.
