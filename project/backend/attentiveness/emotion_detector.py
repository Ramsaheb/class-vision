import cv2
import numpy as np
from typing import Dict, List, Tuple, Optional
import time

try:
    import mediapipe as mp
    _HAS_MP = True
except ImportError:
    mp = None
    _HAS_MP = False

# Fallback emotion detection using basic facial geometry
class SimpleEmotionDetector:
    """
    Lightweight emotion detection using facial landmark geometry.
    Detects: neutral, happy, sad, surprised, angry, confused
    """
    
    def __init__(self):
        self.mp_face_mesh = None
        if _HAS_MP:
            try:
                self.mp_face_mesh = mp.solutions.face_mesh.FaceMesh(
                    static_image_mode=False,
                    max_num_faces=1,
                    refine_landmarks=True,
                    min_detection_confidence=0.5,
                    min_tracking_confidence=0.5,
                )
            except Exception:
                self.mp_face_mesh = None
    
    def detect_emotion(self, frame: np.ndarray, bbox: Tuple[int, int, int, int]) -> Dict[str, float]:
        """
        Detect emotion from face region.
        Returns: {"emotion": "happy", "confidence": 0.8, "engagement_boost": 0.1}
        """
        if self.mp_face_mesh is None:
            return {"emotion": "neutral", "confidence": 0.0, "engagement_boost": 0.0}
        
        x1, y1, x2, y2 = bbox
        h, w = frame.shape[:2]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w - 1, x2), min(h - 1, y2)
        if x2 <= x1 or y2 <= y1:
            return {"emotion": "neutral", "confidence": 0.0, "engagement_boost": 0.0}
        
        roi = frame[y1:y2, x1:x2]
        if roi.size == 0:
            return {"emotion": "neutral", "confidence": 0.0, "engagement_boost": 0.0}
        
        rgb = cv2.cvtColor(roi, cv2.COLOR_BGR2RGB)
        results = self.mp_face_mesh.process(rgb)
        
        if not results.multi_face_landmarks:
            return {"emotion": "neutral", "confidence": 0.0, "engagement_boost": 0.0}
        
        landmarks = results.multi_face_landmarks[0]
        h_roi, w_roi = roi.shape[:2]
        points = [(int(lm.x * w_roi), int(lm.y * h_roi)) for lm in landmarks.landmark]
        
        # Analyze facial geometry for emotions
        emotion, confidence = self._analyze_facial_geometry(points)
        
        # Calculate engagement boost based on emotion
        engagement_boost = self._calculate_engagement_boost(emotion, confidence)
        
        return {
            "emotion": emotion,
            "confidence": float(confidence),
            "engagement_boost": float(engagement_boost)
        }
    
    def _analyze_facial_geometry(self, points: List[Tuple[int, int]]) -> Tuple[str, float]:
        """Analyze facial landmark geometry to determine emotion"""
        try:
            # Mouth landmarks for smile detection
            mouth_left = np.array(points[61])  # Left mouth corner
            mouth_right = np.array(points[291])  # Right mouth corner
            mouth_top = np.array(points[13])  # Upper lip center
            mouth_bottom = np.array(points[14])  # Lower lip center
            
            # Eye landmarks for surprise/drowsiness
            left_eye_top = np.array(points[159])
            left_eye_bottom = np.array(points[145])
            right_eye_top = np.array(points[386]) 
            right_eye_bottom = np.array(points[374])
            
            # Eyebrow landmarks for surprise/anger
            left_brow = np.array(points[70])
            right_brow = np.array(points[300])
            
            # Calculate features
            mouth_width = np.linalg.norm(mouth_right - mouth_left)
            mouth_height = np.linalg.norm(mouth_top - mouth_bottom)
            mouth_curve = self._calculate_mouth_curve(mouth_left, mouth_right, mouth_top, mouth_bottom)
            
            left_eye_openness = np.linalg.norm(left_eye_top - left_eye_bottom)
            right_eye_openness = np.linalg.norm(right_eye_top - right_eye_bottom)
            avg_eye_openness = (left_eye_openness + right_eye_openness) / 2.0
            
            # Simple rule-based emotion classification
            if mouth_curve > 0.15 and mouth_width > mouth_height * 2:
                return "happy", 0.7  # Smile detected
            elif avg_eye_openness > mouth_width * 0.4:
                return "surprised", 0.6  # Wide eyes
            elif mouth_curve < -0.1:
                return "sad", 0.6  # Downturned mouth
            elif avg_eye_openness < mouth_width * 0.15:
                return "drowsy", 0.6  # Closed/narrow eyes
            elif mouth_height > mouth_width * 0.8:
                return "confused", 0.5  # Open mouth
            else:
                return "neutral", 0.5
                
        except (IndexError, ValueError):
            return "neutral", 0.0
    
    def _calculate_mouth_curve(self, left, right, top, bottom) -> float:
        """Calculate mouth curvature (positive = smile, negative = frown)"""
        center = (left + right) / 2.0
        mouth_line_y = center[1]
        corner_avg_y = (left[1] + right[1]) / 2.0
        return float((mouth_line_y - corner_avg_y) / max(1.0, np.linalg.norm(right - left)))
    
    def _calculate_engagement_boost(self, emotion: str, confidence: float) -> float:
        """Calculate how much this emotion should boost/reduce engagement score"""
        emotion_weights = {
            "happy": 0.2,      # Positive engagement
            "surprised": 0.1,   # Some engagement
            "neutral": 0.0,     # No change
            "confused": -0.1,   # Slightly negative
            "sad": -0.15,       # Negative
            "drowsy": -0.3,     # Very negative
        }
        return emotion_weights.get(emotion, 0.0) * confidence