import cv2
import numpy as np
from typing import Dict, List, Any, Tuple

from .pose_estimator import estimate_head_pose
from .gaze_tracker import estimate_gaze
from .classifier import SimpleAttentivenessClassifier
from .emotion_detector import SimpleEmotionDetector
from .gesture_detector import HandGestureDetector

try:
    import mediapipe as mp
    _HAS_MP = True
except Exception:
    mp = None
    _HAS_MP = False


class AttentivenessManager:
    def __init__(self, enable_pose: bool = True, enable_gaze: bool = True, model_path: str | None = None):
        print("✅ Attentiveness Manager initialized (pose=%s, gaze=%s)" % (enable_pose, enable_gaze))
        self.enable_pose = enable_pose
        self.enable_gaze = enable_gaze

        self.classifier = SimpleAttentivenessClassifier()
        self.emotion_detector = SimpleEmotionDetector()
        self.gesture_detector = HandGestureDetector()

        # Storage
        self.student_attention_data: Dict[str, Dict[str, Any]] = {}
        self.total_frames: int = 0
        self.total_processing_ms: float = 0.0
        self.seconds_per_processed_frame: float = 0.0

        # MediaPipe FaceMesh for eye/iris landmarks (blink/EAR/eye openness)
        self.facemesh = None
        self._init_facemesh()
        # Blink/EAR parameters
        self._ear_thresh = 0.21
        self._ear_consec_frames = 2

    def analyze_classroom(self, frame: np.ndarray, detections: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
        """
        Analyze a frame for attentiveness per student.
        detections: List of {id: student_name, bbox: [x1,y1,x2,y2]}
        Returns per-student metrics for this frame.
        """
        import time
        t0 = time.time()

        results: Dict[str, Dict[str, Any]] = {}
        for det in detections:
            sid = str(det.get("id"))
            bbox = det.get("bbox")
            if not bbox:
                continue

            features: Dict[str, float | str] = {}

            if self.enable_pose:
                pose = estimate_head_pose(frame, tuple(bbox))
                features.update(pose)

            if self.enable_gaze:
                gaze = estimate_gaze(frame, tuple(bbox))
                features["gaze_direction"] = gaze.get("direction", "unknown")
                features["gaze_stability"] = float(gaze.get("stability", 0.0))

            # FaceMesh-based eye metrics (EAR/blink/eye openness)
            ear = None
            eye_open = None
            blink_now = False
            if self.facemesh is not None:
                ear, eye_open = self._analyze_eyes_with_facemesh(frame, tuple(bbox))
                features["eye_openness"] = float(eye_open) if eye_open is not None else 0.0

            # Emotion detection
            emotion_data = self.emotion_detector.detect_emotion(frame, tuple(bbox))
            features["emotion"] = emotion_data.get("emotion", "neutral")
            features["emotion_confidence"] = float(emotion_data.get("confidence", 0.0))
            features["emotion_boost"] = float(emotion_data.get("engagement_boost", 0.0))

            # Hand gesture detection (use expanded region around student)
            gesture_data = self.gesture_detector.detect_gestures(frame, tuple(bbox))
            features["gesture"] = gesture_data.get("gesture", "no_hands")
            features["gesture_confidence"] = float(gesture_data.get("confidence", 0.0))
            features["participation_score"] = float(gesture_data.get("participation_score", 0.0))
            features["hand_count"] = int(gesture_data.get("hand_count", 0))

            score, state = self.classifier.predict(features)

            # Update history
            hist = self.student_attention_data.setdefault(sid, {
                "scores": [],
                "states": [],
                "frames": 0,
                "time_in_state": {"attentive": 0.0, "distracted": 0.0, "drowsy": 0.0, "sleeping": 0.0},
                "pose_movement": [],
                "gaze_stability": [],
                "ear_history": [],
                "blink_count": 0,
                "consec_ear_low": 0,
                "emotions": [],
                "gestures": [],
                "participation_events": 0,
            })

            hist["scores"].append(score)
            hist["states"].append(state)
            hist["frames"] += 1
            if self.enable_pose:
                hist["pose_movement"].append(float(features.get("movement", 0.0)))
            if self.enable_gaze:
                hist["gaze_stability"].append(float(features.get("gaze_stability", 0.0)))

            # Update blink state machine
            if ear is not None:
                hist["ear_history"].append(float(ear))
                if ear < self._ear_thresh:
                    hist["consec_ear_low"] += 1
                else:
                    if hist["consec_ear_low"] >= self._ear_consec_frames:
                        hist["blink_count"] += 1
                    hist["consec_ear_low"] = 0

            # Track emotions and gestures
            hist["emotions"].append(features.get("emotion", "neutral"))
            hist["gestures"].append(features.get("gesture", "no_hands"))
            
            # Count participation events (hand raising, pointing)
            if features.get("gesture") in ["hand_raised", "pointing"]:
                hist["participation_events"] += 1

            results[sid] = {
                "attention_score": score,
                "attention_state": state,
                "pose": {k: float(v) for k, v in (features.items()) if k in ("yaw", "pitch", "roll", "movement")},
                "gaze": {"direction": features.get("gaze_direction", "unknown"), "stability": float(features.get("gaze_stability", 0.0))},
                "eye": {"ear": float(ear) if ear is not None else None, "openness": float(eye_open) if eye_open is not None else None},
                "emotion": {"emotion": features.get("emotion", "neutral"), "confidence": float(features.get("emotion_confidence", 0.0))},
                "gesture": {"gesture": features.get("gesture", "no_hands"), "confidence": float(features.get("gesture_confidence", 0.0)), "hand_count": int(features.get("hand_count", 0))},
                "participation": {"score": float(features.get("participation_score", 0.0))}
            }

        self.total_frames += 1
        self.total_processing_ms += (time.time() - t0) * 1000.0
        return results

    def draw_attention_overlay(self, frame: np.ndarray, frame_results: Dict[str, Any], detections: List[Dict[str, Any]]) -> np.ndarray:
        out = frame.copy()
        for det in detections:
            sid = str(det.get("id"))
            bbox = det.get("bbox")
            if not bbox:
                continue
            x1, y1, x2, y2 = bbox
            color = (0, 200, 0)
            if sid in frame_results:
                st = frame_results[sid].get("attention_state", "")
                sc = frame_results[sid].get("attention_score", 0.0)
                label = f"{sid} {st} {sc:.2f}"
            else:
                label = str(sid)

            cv2.rectangle(out, (x1, y1), (x2, y2), color, 1)
            cv2.putText(out, label, (x1, max(10, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1, cv2.LINE_AA)
        return out

    def get_session_summary(self) -> Dict[str, Any]:
        students: Dict[str, Any] = {}
        for sid, hist in self.student_attention_data.items():
            scores = hist.get("scores", [])
            states = hist.get("states", [])
            avg_score = float(np.mean(scores)) if scores else 0.0
            # distribution in seconds approximated by frames proportion (will be scaled by caller if needed)
            dist: Dict[str, float] = {s: float(states.count(s)) for s in ["attentive", "distracted", "drowsy", "sleeping"]}
            # Blink rate per minute
            elapsed_seconds = float(self.total_frames) * float(self.seconds_per_processed_frame or 0.0)
            blink_rate = (hist.get("blink_count", 0) / (elapsed_seconds / 60.0)) if elapsed_seconds > 1e-3 else 0.0
            avg_ear = float(np.mean(hist.get("ear_history", [0.0]))) if hist.get("ear_history") else 0.0
            
            # Emotion distribution
            emotions = hist.get("emotions", [])
            emotion_dist = {emotion: emotions.count(emotion) for emotion in set(emotions)} if emotions else {}
            dominant_emotion = max(emotion_dist, key=emotion_dist.get) if emotion_dist else "neutral"
            
            # Gesture/participation statistics
            gestures = hist.get("gestures", [])
            participation_events = hist.get("participation_events", 0)
            participation_rate = (participation_events / max(1, len(gestures))) if gestures else 0.0
            students[sid] = {
                "average_attention_score": round(avg_score, 3),
                "attention_state_distribution": dist,
                "time_in_state": dist.copy(),  # caller can scale by seconds_per_frame
                "peak_score": float(max(scores) if scores else 0.0),
                "lowest_score": float(min(scores) if scores else 0.0),
                "avg_pose_movement": float(np.mean(hist.get("pose_movement", [0.0])) if hist.get("pose_movement") else 0.0),
                "avg_gaze_stability": float(np.mean(hist.get("gaze_stability", [0.0])) if hist.get("gaze_stability") else 0.0),
                "frames_analyzed": int(hist.get("frames", 0)),
                "blink_count": int(hist.get("blink_count", 0)),
                "blink_rate_per_min": float(blink_rate),
                "avg_ear": float(avg_ear),
                "dominant_emotion": dominant_emotion,
                "emotion_distribution": emotion_dist,
                "participation_events": int(participation_events),
                "participation_rate": float(participation_rate),
            }

        avg_ms = self.total_processing_ms / max(1, self.total_frames)
        return {
            "students": students,
            "total_frames": int(self.total_frames),
            "avg_processing_time": float(avg_ms),
        }

    def reset(self):
        self.student_attention_data = {}
        self.total_frames = 0
        self.total_processing_ms = 0.0
        # Keep facemesh initialized for reuse

    # --------------- helpers ---------------
    def _init_facemesh(self) -> None:
        if _HAS_MP and self.enable_gaze:
            try:
                self.facemesh = mp.solutions.face_mesh.FaceMesh(
                    static_image_mode=False,
                    max_num_faces=1,
                    refine_landmarks=True,
                    min_detection_confidence=0.5,
                    min_tracking_confidence=0.5,
                )
            except Exception:
                self.facemesh = None
        else:
            self.facemesh = None

    def _analyze_eyes_with_facemesh(self, frame: np.ndarray, bbox: Tuple[int, int, int, int]) -> Tuple[float | None, float | None]:
        if self.facemesh is None:
            return None, None
        x1, y1, x2, y2 = bbox
        h, w = frame.shape[:2]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w - 1, x2), min(h - 1, y2)
        if x2 <= x1 or y2 <= y1:
            return None, None

        roi = frame[y1:y2, x1:x2]
        if roi.size == 0:
            return None, None
        rgb = cv2.cvtColor(roi, cv2.COLOR_BGR2RGB)
        res = self.facemesh.process(rgb)
        if not res.multi_face_landmarks:
            return None, None
        lm = res.multi_face_landmarks[0]
        # Landmarks in normalized ROI coords -> absolute ROI pixels
        pts = [(int(p.x * roi.shape[1]), int(p.y * roi.shape[0])) for p in lm.landmark]

        # EAR using common FaceMesh indices
        L = [33, 160, 158, 133, 153, 144]  # left eye
        R = [263, 387, 385, 362, 380, 373]  # right eye

        def eye_ear(idx):
            p = [np.array(pts[i], dtype=np.float32) for i in idx]
            # Using pairs: (1,5) and (2,4), horizontal (0,3)
            A = np.linalg.norm(p[1] - p[5])
            B = np.linalg.norm(p[2] - p[4])
            C = np.linalg.norm(p[0] - p[3]) + 1e-6
            return float((A + B) / (2.0 * C))

        ear_left = eye_ear(L)
        ear_right = eye_ear(R)
        ear = (ear_left + ear_right) / 2.0

        # Eye openness scaled from EAR (typical open EAR ~0.25-0.30)
        openness = max(0.0, min(1.0, (ear - 0.15) / 0.15))
        return ear, openness
