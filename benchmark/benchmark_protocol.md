# Class Vision — Benchmark Protocol

This document outlines the standard benchmark protocol and evaluation metrics used to validate the accuracy, reliability, and speed of the Class Vision (CORIS) system. Researchers and reviewers can use this protocol to reproduce the paper's benchmark results.

---

## 1. Benchmarking Objectives

The benchmark suite evaluates three primary dimensions:
1. **Face Detection & Recognition Accuracy**: High precision and recall under classroom conditions (varying illumination, occlusions, and camera angles).
2. **Attentiveness Classification Reliability**: Accuracy in identifying student engagement levels and behavioral states.
3. **Execution Performance & Latency**: System frame-rate (FPS), CPU/GPU utilization, and scalability with class size.

---

## 2. Evaluation Metrics

### A. Face Detection & Recognition
We use standard object detection and classification metrics:

$$\text{Precision} = \frac{TP}{TP + FP}, \quad \text{Recall} = \frac{TP}{TP + FN}$$

$$\text{F1-Score} = 2 \times \frac{\text{Precision} \times \text{Recall}}{\text{Precision} + \text{Recall}}$$

- **True Positive (TP)**: Face correctly detected and matched to the ground-truth student.
- **False Positive (FP)**: Face matched to the wrong student, or background falsely detected as a face.
- **False Negative (FN)**: Ground-truth student present in the frame but not detected/recognized.

### B. Attentiveness State Classification
The system classifies attention into four states: **Attentive**, **Distracted**, **Drowsy**, and **Sleeping**. Let $S_{pred}$ be the predicted state and $S_{gt}$ be the manually annotated ground-truth state:

$$\text{Attentiveness Accuracy} = \frac{\sum_{i=1}^{N} \mathbb{I}(S_{pred}^{(i)} = S_{gt}^{(i)})}{N}$$

Where $\mathbb{I}$ is the indicator function and $N$ is the number of annotated evaluation frames.

### C. System Performance
- **Throughput (FPS)**: Processing speed in frames per second.
- **Inference Latency (ms)**: End-to-end time taken to process a single frame (Detection + Recognition + Attentiveness + DB updates).

---

## 3. Reference Datasets & Setup

To replicate the paper's benchmarks, we suggest utilizing:
1. **ChokePoint Dataset**: Standard video dataset for person identification under portal/surveillance setups.
2. **SCUT-Head Dataset**: Large-scale head detection dataset to evaluate the YOLOv8-face detector's robustness.
3. **Synthetic Classroom Video**: Generate synthetic test videos using our utility script `generate_synthetic_test_data.py`. This lets you test the pipeline end-to-end without needing real student face videos.

---

## 4. Run the Benchmark

To evaluate performance on your custom device, run:

```bash
# Generate the synthetic baseline dataset first
python benchmark/generate_synthetic_test_data.py

# Run the inference benchmark script
python benchmark/sample_inference.py --video benchmark/synthetic_video.mp4 --benchmark
```

---

## 5. Standard Baseline Results

The baseline results achieved on consumer-grade hardware (Intel i7-12700H, NVIDIA RTX 3060 Laptop GPU) are:

| Metric | Target Value | Description |
|--------|--------------|-------------|
| **Detection Precision** | 98.4% | Face bounding box intersection over union (IoU) ≥ 0.5 |
| **Recognition F1-Score** | 95.8% | Accuracy of gallery matching with InceptionResnetV1 |
| **Attentiveness Accuracy** | 91.2% | Correlation with manual observer scores |
| **Processing Throughput (GPU)** | 35+ FPS | Full real-time pipeline inference |
| **Processing Throughput (CPU)** | 8–12 FPS | Fallback mode on standard hardware |
