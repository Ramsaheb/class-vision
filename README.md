<p align="center">

# 🎓 Class Vision — CORIS

### Classroom Observation & Recognition Intelligence System

![Python](https://img.shields.io/badge/Python-3.8+-3776AB?style=for-the-badge\&logo=python\&logoColor=white)
![Node](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge\&logo=node.js\&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge\&logo=react\&logoColor=black)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge\&logo=fastapi\&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

### Privacy-Preserving Multimodal Visual Analytics for Classroom Attendance and Engagement Assessment

*A research-oriented framework for automated classroom attendance verification and student engagement analysis using edge-based multimodal visual computing.*

</p>

---

# 📖 Overview

Class Vision (CORIS) is a research framework for classroom attendance verification and engagement assessment using multimodal visual analytics.

The framework integrates:

* Face detection
* Face recognition
* Behavioural cue extraction
* Student engagement estimation
* Edge-oriented processing
* Real-time dashboard analytics

to provide classroom insights while reducing dependence on cloud infrastructure.

Unlike traditional attendance systems, Class Vision combines identity verification with behavioural observations to support educational analytics under privacy-aware deployment settings.

---

# 🔬 Research Status

This repository accompanies the research work:

> **Privacy-Preserving Multimodal Visual Analytics for Classroom Attendance and Engagement Assessment**

The present implementation represents a **pilot research prototype** evaluated under controlled classroom conditions.

Current evaluation focuses on demonstrating the feasibility of combining attendance verification and behavioural analysis in a unified edge-processing framework.

Future work includes:

* Larger datasets,
* Multi-classroom evaluation,
* Demographic diversity,
* Temporal learning models,
* Longitudinal classroom studies.

---

# ✨ Features

## Attendance Verification

* Multi-detector face localisation
* Face embedding generation
* Identity verification
* Unknown face handling
* Attendance persistence

---

## Student Engagement Analysis

Four engagement states:

* 🟢 Attentive
* 🟡 Distracted
* 🟠 Drowsy
* 🔴 Sleeping

Behavioural cues include:

* Head pose
* Eye gaze
* Facial landmarks
* Eye openness
* Mouth activity
* Hand gestures

---

## Backend

* FastAPI REST API
* WebSocket communication
* SQLite persistence
* Session history
* CSV export

---

## Frontend

* React 18
* TypeScript
* Vite
* TailwindCSS
* Recharts
* Live dashboard

---

# 🔒 Privacy Notice

Class Vision processes facial and behavioural information.

Any real-world deployment should:

* Obtain informed consent.
* Follow applicable privacy regulations.
* Protect stored data.
* Implement access controls.
* Define retention policies.
* Consider ethical implications of behavioural monitoring.

The current architecture improves privacy through local processing but does not eliminate all privacy risks.

Original classroom recordings are not publicly distributed.

---

# 🏗 System Architecture

```text
Camera
   │
   ▼
Edge Device
   │
   ▼
AI Processing Pipeline
   │
   ├── Face Detection
   ├── Face Recognition
   ├── Behaviour Analysis
   └── Engagement Estimation
   │
   ▼
FastAPI Backend
   │
   ├── SQLite
   ├── REST API
   └── WebSocket
   │
   ▼
React Dashboard
   │
   ▼
Analytics & Reports
```

---

# 🔄 Data Flow

```text
Camera
   │
   ▼
Frame Acquisition
   │
   ▼
Face Detection
   │
   ▼
Identity Verification
   │
   ▼
Behaviour Analysis
   │
   ▼
Engagement Estimation
   │
   ▼
FastAPI Backend
   │
   ▼
SQLite Storage
   │
   ▼
WebSocket
   │
   ▼
React Dashboard
   │
   ▼
CSV Analytics
```

---

# 📸 Screenshots

Sample dashboard outputs and privacy-preserving examples will be included in the repository.

Original classroom recordings are withheld due to participant privacy considerations.

```
Dashboard
──────────────
Attendance
Engagement
Live Analytics
Session Summary
Defaulter Reports
```

---

# 🎯 Core Components

| Module                | Purpose                          |
| --------------------- | -------------------------------- |
| Face Detection        | Locate faces                     |
| Face Recognition      | Verify identities                |
| Behaviour Analysis    | Extract visual cues              |
| Engagement Estimation | Determine engagement state       |
| Backend               | Process and store data           |
| Dashboard             | Display analytics                |
| Reporting             | Export attendance and statistics |

---

# 📚 Associated Publication

This repository accompanies the manuscript:

**Privacy-Preserving Multimodal Visual Analytics for Classroom Attendance and Engagement Assessment**

The repository provides:

* Source code
* Configuration files
* Model information
* Sample anonymised examples
* Reproducibility materials
* Hardware specifications
* Inference instructions

to support the associated research.

# 📂 Project Structure

```text
class-vision/
│
├── README.md
├── LICENSE
├── CONTRIBUTING.md
├── .gitignore
│
├── project/
│   │
│   ├── backend/
│   │   ├── server.py
│   │   ├── attendance_pipeline.py
│   │   ├── enhanced_attendance_pipeline.py
│   │   ├── database.py
│   │   ├── prepare_new_students_dataset.py
│   │   ├── requirements.txt
│   │   ├── .env.example
│   │   │
│   │   └── attentiveness/
│   │       ├── manager.py
│   │       ├── pose_estimator.py
│   │       ├── gaze_tracker.py
│   │       ├── emotion_detector.py
│   │       ├── gesture_detector.py
│   │       └── classifier.py
│   │
│   ├── frontend/
│   │   ├── src/
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   └── tailwind.config.js
│   │
│   ├── Input/
│   ├── Output/
│   ├── SI1/
│   ├── DATABASE_README.md
│   └── student_detection_model.ipynb
│
└── docs/
```

---

# ⚙ Technology Stack

## Backend

| Component          | Technology               |
| ------------------ | ------------------------ |
| API Framework      | FastAPI                  |
| Face Detection     | YOLOv8, MTCNN, MediaPipe |
| Face Recognition   | FaceNet                  |
| Deep Learning      | PyTorch                  |
| Behaviour Analysis | MediaPipe                |
| Database           | SQLite                   |
| Communication      | WebSocket                |

---

## Frontend

| Component  | Technology   |
| ---------- | ------------ |
| Framework  | React 18     |
| Language   | TypeScript   |
| Build Tool | Vite         |
| Styling    | TailwindCSS  |
| Charts     | Recharts     |
| Routing    | React Router |

---

# 💻 System Requirements

## Minimum

* Python 3.8+
* Node.js 18+
* 8 GB RAM
* Dual-core CPU

---

## Recommended

* Python 3.10+
* Node.js 20+
* 16 GB RAM
* CUDA GPU
* SSD Storage

---

# 🚀 Quick Start

## 1. Clone Repository

```bash
git clone https://github.com/YOUR_USERNAME/class-vision.git

cd class-vision
```

---

# 🐍 Backend Installation

Move into backend:

```bash
cd project/backend
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Create environment file:

```bash
cp .env.example .env
```

---

# 🤖 Model Preparation

The framework uses pretrained models.

Required models include:

* YOLOv8 Face
* FaceNet
* MediaPipe

Models may be:

* downloaded automatically,
* or placed manually inside the project.

Example:

```text
project/

yolov8n-face.pt
```

---

# 👨‍🎓 Student Gallery

Create one folder per enrolled student.

Example:

```text
SI1/

Alice/
photo1.jpg
photo2.jpg

Bob/
photo1.jpg
photo2.jpg
```

Multiple images per student are recommended.

---

# 🌐 Frontend Installation

Move into frontend:

```bash
cd project/frontend
```

Install dependencies:

```bash
npm install
```

---

# ▶ Running the Framework

## Terminal 1

Backend:

```bash
cd project/backend

uvicorn server:app --reload --port 8000
```

---

## Terminal 2

Frontend:

```bash
cd project/frontend

npm run dev
```

---

# 🌍 Access Points

| Service      | Address                            |
| ------------ | ---------------------------------- |
| Dashboard    | http://localhost:5173              |
| API Docs     | http://localhost:8000/docs         |
| OpenAPI JSON | http://localhost:8000/openapi.json |

---

# 🔌 API Overview

| Endpoint        | Method    |
| --------------- | --------- |
| /process        | POST      |
| /last-result    | GET       |
| /gallery-info   | GET       |
| /health         | GET       |
| /dashboard-data | GET       |
| /students       | GET       |
| /student/{name} | GET       |
| /sessions       | GET       |
| /session/{id}   | GET       |
| /ws             | WebSocket |

---

# 📊 Dashboard

The React dashboard provides:

* Attendance overview
* Student profiles
* Live analytics
* Session history
* Defaulter tracking
* Engagement statistics
* CSV export

---

# 📁 Outputs

The framework generates:

## Attendance

* Present
* Absent
* Unknown

---

## Engagement

* Attentive
* Distracted
* Drowsy
* Sleeping

---

## Analytics

* Recognition confidence
* Attention score
* Presence duration
* Participation score
* Blink statistics
* Gaze information
* Session summary

---

# 📈 Engagement Levels

| Level          | Score  |
| -------------- | ------ |
| Highly Engaged | ≥80%   |
| Well Engaged   | 60–79% |
| Moderate       | 40–59% |
| Poor           | 20–39% |
| Disengaged     | <20%   |

---



# ⚙ Configuration

Typical configurable parameters include:

```python
Recognition Threshold

Unknown Threshold

YOLO Confidence

MTCNN Threshold

Frame Interval

Attention Boundaries
```

Configuration values can be adjusted according to deployment requirements.

---

# 🔧 Environment Variables

| Variable              | Purpose           |
| --------------------- | ----------------- |
| AUTO_START_PROCESSING | Automatic startup |
| SMTP_HOST             | Mail server       |
| SMTP_PORT             | Mail port         |
| SMTP_USER             | Username          |
| SMTP_PASSWORD         | Password          |

---

# 📦 Hardware Evaluation

Typical evaluation setup:

| Component | Example       |
| --------- | ------------- |
| CPU       | Intel/AMD     |
| RAM       | 16 GB         |
| Storage   | SSD           |
| OS        | Windows/Linux |
| GPU       | Optional      |

GPU acceleration may improve throughput but is not mandatory.

---

# 📤 Export Formats

The framework supports:

* CSV reports
* Attendance summaries
* Session analytics
* Student statistics

---

# 🔄 Typical Workflow

```text
Create Gallery
      │
      ▼
Start Backend
      │
      ▼
Start Frontend
      │
      ▼
Capture Video
      │
      ▼
Detect Faces
      │
      ▼
Recognise Students
      │
      ▼
Estimate Engagement
      │
      ▼
Store Results
      │
      ▼
Display Dashboard
      │
      ▼
Export Reports
```

# 🔬 Reproducibility

This repository accompanies the research manuscript:

> **Privacy-Preserving Multimodal Visual Analytics for Classroom Attendance and Engagement Assessment**

To support reproducibility, the repository provides:

* Source code
* Configuration files
* Model information
* Detector thresholds
* Hardware specifications
* Inference instructions
* Sample anonymised examples
* Example outputs

Original classroom recordings are not publicly distributed due to participant privacy considerations.

---

# 🔒 Privacy and Ethical Considerations

Class Vision processes facial and behavioural information.

Any real-world deployment should:

* Obtain informed consent.
* Follow applicable privacy regulations.
* Protect stored data.
* Implement access controls.
* Define retention policies.
* Limit access to authorised users.
* Consider ethical implications of behavioural monitoring.

The current architecture improves privacy through local processing but does not eliminate all privacy risks.

This framework is intended primarily for research and educational purposes.

---

# ⚠ Limitations

The present implementation represents a pilot research prototype.

Current limitations include:

* Limited dataset size.
* Controlled classroom conditions.
* Static engagement thresholds.
* Limited demographic diversity.
* CPU-oriented evaluation.
* Behavioural heuristics.

Results should not be interpreted as validation for large-scale educational deployment.

Future work includes:

* Larger datasets.
* Diverse classroom environments.
* Temporal learning models.
* Personalised engagement estimation.
* Multi-camera systems.

---

# 🛠 Troubleshooting

| Problem                  | Possible Solution             |
| ------------------------ | ----------------------------- |
| Model not found          | Download required weights     |
| Low recognition accuracy | Add additional student images |
| Slow processing          | Enable GPU acceleration       |
| WebSocket disconnect     | Verify backend server         |
| Database errors          | Check SQLite permissions      |
| API unavailable          | Verify FastAPI service        |

---

# 📋 Best Practices

For best results:

* Use multiple images per student.
* Ensure adequate classroom lighting.
* Position the camera to minimise occlusions.
* Keep the student gallery updated.
* Review recognition thresholds for new environments.

---

# 🤝 Contributing

Contributions are welcome.

If you would like to contribute:

1. Fork the repository.
2. Create a feature branch.
3. Commit your changes.
4. Submit a pull request.

Please read:

```
CONTRIBUTING.md
```

before contributing.

Bug reports and feature suggestions are appreciated.

---

# 📖 Associated Publication

This repository accompanies the research manuscript:

**Privacy-Preserving Multimodal Visual Analytics for Classroom Attendance and Engagement Assessment.**

The repository provides:

* Source code
* Reproducibility materials
* Configuration files
* Sample anonymised examples
* Hardware specifications
* Documentation

associated with the study.

---

# 🚀 Future Work

Planned improvements include:

## Dataset

* Larger participant groups.
* Multiple classroom environments.
* Diverse demographic representation.

---

## Visual Analytics

* Temporal engagement modelling.
* Multi-camera fusion.
* Improved behavioural cue integration.

---

## Deployment

* Cross-platform support.
* Edge-device optimisation.
* Cloud-edge hybrid architectures.

---

## Educational Analytics

* Longitudinal attendance trends.
* Student participation modelling.
* Classroom interaction analytics.

---

# 📜 License

This project is licensed under the MIT License.

See:

```
LICENSE
```

for details.

---

# 🙏 Acknowledgements

This work builds upon several excellent open-source projects:

* YOLOv8
* FaceNet-PyTorch
* MediaPipe
* FastAPI
* React
* Vite
* PyTorch
* SQLite
* WebSocket technologies

We thank the open-source community for making research and educational development accessible.

---

# 💡 Research Disclaimer

Class Vision is a research-oriented framework developed to investigate privacy-preserving multimodal visual analytics for classroom environments.

The present implementation represents a pilot evaluation under controlled conditions and should not be interpreted as a production-ready educational monitoring system.

Further validation across larger and more diverse classroom settings remains future work.

---


---

# ⭐ Support the Project

If you find this work useful for research or education:

* ⭐ Star the repository
* 🍴 Fork the project
* 📝 Cite the associated publication
* 🤝 Contribute improvements

---

<p align="center">

### 🎓 Class Vision — CORIS

**Privacy-Preserving Multimodal Visual Analytics for Classroom Attendance and Engagement Assessment**

*A research-oriented framework for classroom attendance verification and student engagement analysis.*

**Built with Python • FastAPI • React • PyTorch • MediaPipe**

**MIT Licensed**

</p>
