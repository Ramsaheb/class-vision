# Class Vision — Benchmark & Reproducibility Suite

This directory contains the necessary benchmark configurations, protocols, and sample scripts to run reproducible evaluations of the Class Vision (CORIS) classroom attendance and engagement tracking system.

> [!NOTE]
> **Open Source Code & Benchmark Materials**
> To support high academic standards and peer-review credibility, this project provides complete sample inference pipelines, configs, and synthetic test datasets. **You do not need to share real student faces or private video datasets publicly.** 

---

## 📂 Directory Contents

| File / Folder | Purpose |
|---------------|---------|
| [benchmark_protocol.md](benchmark_protocol.md) | The official evaluation metrics, standard testing procedures, and target performance baselines. |
| [detector_config.yaml](detector_config.yaml) | Detailed hyperparameter thresholds for face detection (YOLOv8, MTCNN), recognition (FaceNet), and attention classifiers. |
| [generate_synthetic_test_data.py](generate_synthetic_test_data.py) | Utility script that dynamically draws geometric mock faces and makes a mock video simulating attentive, sleeping, and distracted students. |
| [sample_inference.py](sample_inference.py) | Standalone script demonstrating frame-wise face detection, embedding matching, and attention states classification with throughput analysis (FPS). |

---

## 🚀 Step-by-Step Benchmarking & Verification

Follow these steps to evaluate the pipeline out-of-the-box on your machine without requiring real classroom video recordings.

### 1. Install Requirements
Ensure your environment satisfies the main system requirements:
```bash
pip install numpy opencv-python pyyaml
```

### 2. Generate Synthetic Test Dataset
Run the data generator to instantly construct a mock registry of students and a 10-second classroom simulation video containing multi-state student face motions:
```bash
python benchmark/generate_synthetic_test_data.py
```
This produces:
- `benchmark/synthetic_gallery/` — Reference photos for Alice, Bob, and Charlie.
- `benchmark/synthetic_video.mp4` — Simulated high-definition student video.

### 3. Run Benchmark Inference
Execute the standalone inference script to measure pipeline throughput (FPS) and latency (ms) under high-speed simulation:
```bash
python benchmark/sample_inference.py --benchmark
```

This will run frame-wise processing, display real-time speed in your terminal, and export a complete performance audit log to `benchmark/benchmark_results.json`.

---

## 📝 Citing this Benchmark

If you are using these reproducibility tools or referencing the Class Vision (CORIS) platform in your research, please cite:

```bibtex
@software{class_vision_coris_2025,
  author       = {Prasad, Ramsaheb},
  title        = {Class Vision: Classroom Observation \& Recognition Intelligence System},
  year         = 2025,
  publisher    = {GitHub},
  journal      = {GitHub Repository},
  howpublished = {\url{https://github.com/Ramsaheb/class-vision}}
}
```
