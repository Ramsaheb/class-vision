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

class HandGestureDetector:
    """
    Hand gesture detection for classroom participation tracking.
    Detects: hand_raised, pointing, waving, writing, no_hands
    """
    
    def __init__(self):
        self.mp_hands = None
        self.mp_pose = None
        if _HAS_MP:
            try:
                self.mp_hands = mp.solutions.hands.Hands(
                    static_image_mode=False,
                    max_num_hands=2,
                    min_detection_confidence=0.7,
                    min_tracking_confidence=0.5,
                )
                self.mp_pose = mp.solutions.pose.Pose(
                    static_image_mode=False,
                    model_complexity=1,
                    enable_segmentation=False,
                    min_detection_confidence=0.5,
                    min_tracking_confidence=0.5,
                )
            except Exception:
                self.mp_hands = None
                self.mp_pose = None
    
    def detect_gestures(self, frame: np.ndarray, bbox: Optional[Tuple[int, int, int, int]] = None) -> Dict[str, any]:
        """
        Detect hand gestures in frame or bbox region.
        Returns: {
            "gesture": "hand_raised", 
            "confidence": 0.8,
            "hand_count": 1,
            "participation_score": 0.3
        }
        """
        if self.mp_hands is None or self.mp_pose is None:
            return {
                "gesture": "no_hands",
                "confidence": 0.0,
                "hand_count": 0,
                "participation_score": 0.0
            }
        
        # Use full frame if no bbox specified
        if bbox is not None:
            x1, y1, x2, y2 = bbox
            h, w = frame.shape[:2]
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w - 1, x2), min(h - 1, y2)
            if x2 <= x1 or y2 <= y1:
                return {"gesture": "no_hands", "confidence": 0.0, "hand_count": 0, "participation_score": 0.0}
            
            # Expand bbox to include potential hand region (above head)
            expanded_y1 = max(0, y1 - (y2 - y1))  # Expand upward
            expanded_x1 = max(0, x1 - (x2 - x1) // 4)  # Expand sideways
            expanded_x2 = min(w - 1, x2 + (x2 - x1) // 4)
            roi = frame[expanded_y1:y2, expanded_x1:expanded_x2]
        else:
            roi = frame
        
        if roi.size == 0:
            return {"gesture": "no_hands", "confidence": 0.0, "hand_count": 0, "participation_score": 0.0}
        
        rgb = cv2.cvtColor(roi, cv2.COLOR_BGR2RGB)
        
        # Detect hands
        hand_results = self.mp_hands.process(rgb)
        pose_results = self.mp_pose.process(rgb)
        
        if not hand_results.multi_hand_landmarks:
            return {"gesture": "no_hands", "confidence": 0.0, "hand_count": 0, "participation_score": 0.0}
        
        hand_count = len(hand_results.multi_hand_landmarks)
        
        # Analyze gestures
        gesture, confidence = self._analyze_hand_gestures(
            hand_results.multi_hand_landmarks,
            pose_results.pose_landmarks if pose_results.pose_landmarks else None,
            roi.shape
        )
        
        # Calculate participation score
        participation_score = self._calculate_participation_score(gesture, confidence, hand_count)
        
        return {
            "gesture": gesture,
            "confidence": float(confidence),
            "hand_count": int(hand_count),
            "participation_score": float(participation_score)
        }
    
    def _analyze_hand_gestures(self, hand_landmarks_list: List, pose_landmarks, image_shape: Tuple) -> Tuple[str, float]:
        """Analyze hand landmarks to determine gesture"""
        if not hand_landmarks_list:
            return "no_hands", 0.0
        
        h, w = image_shape[:2]
        
        try:
            # Get first hand landmarks
            hand_landmarks = hand_landmarks_list[0]
            hand_points = [(int(lm.x * w), int(lm.y * h)) for lm in hand_landmarks.landmark]
            
            # Key hand landmarks
            wrist = np.array(hand_points[0])
            thumb_tip = np.array(hand_points[4])
            index_tip = np.array(hand_points[8])
            middle_tip = np.array(hand_points[12])
            ring_tip = np.array(hand_points[16])
            pinky_tip = np.array(hand_points[20])
            
            # Calculate hand position relative to frame
            hand_center_y = np.mean([p[1] for p in hand_points])
            frame_top_third = h * 0.33
            
            # Gesture classification
            if self._is_hand_raised(hand_points, pose_landmarks, image_shape):
                return "hand_raised", 0.8
            elif self._is_pointing(thumb_tip, index_tip, middle_tip, ring_tip, pinky_tip):
                return "pointing", 0.7
            elif self._is_waving(hand_points):
                return "waving", 0.6
            elif hand_center_y > h * 0.7:  # Hand in lower part of frame
                return "writing", 0.5
            else:
                return "neutral_hand", 0.4
                
        except (IndexError, ValueError):
            return "unknown", 0.2
    
    def _is_hand_raised(self, hand_points: List, pose_landmarks, image_shape: Tuple) -> bool:
        """Check if hand is raised above head level"""
        if not pose_landmarks:
            # Fallback: check if hand is in upper portion of frame
            hand_center_y = np.mean([p[1] for p in hand_points])
            return hand_center_y < image_shape[0] * 0.3
        
        try:
            h, w = image_shape[:2]
            # Get head landmarks from pose
            nose = pose_landmarks.landmark[0]  # Nose
            nose_y = int(nose.y * h)
            
            # Check if hand is above nose level
            hand_center_y = np.mean([p[1] for p in hand_points])
            return hand_center_y < nose_y - 20  # Some margin above head
            
        except (IndexError, AttributeError):
            return False
    
    def _is_pointing(self, thumb, index, middle, ring, pinky) -> bool:
        """Check if gesture looks like pointing (index finger extended)"""
        try:
            # Index finger should be highest/most extended
            index_extended = index[1] < middle[1] and index[1] < ring[1] and index[1] < pinky[1]
            return index_extended
        except:
            return False
    
    def _is_waving(self, hand_points: List) -> bool:
        """Simple wave detection based on hand spread"""
        try:
            # Check if fingers are spread (simplified)
            finger_tips = [hand_points[4], hand_points[8], hand_points[12], hand_points[16], hand_points[20]]
            wrist = hand_points[0]
            
            # Calculate average distance of finger tips from wrist
            avg_distance = np.mean([np.linalg.norm(np.array(tip) - np.array(wrist)) for tip in finger_tips])
            return avg_distance > 60  # Threshold for spread fingers
        except:
            return False
    
    def _calculate_participation_score(self, gesture: str, confidence: float, hand_count: int) -> float:
        """Calculate participation score based on gesture"""
        gesture_scores = {
            "hand_raised": 1.0,    # Maximum participation
            "pointing": 0.7,       # High participation  
            "waving": 0.6,         # Medium participation
            "writing": 0.3,        # Some engagement
            "neutral_hand": 0.1,   # Minimal
            "no_hands": 0.0,       # No participation
            "unknown": 0.0         # No participation
        }
        
        base_score = gesture_scores.get(gesture, 0.0)
        
        # Boost for confidence and multiple hands
        confidence_mult = confidence
        hand_mult = min(1.2, 1.0 + (hand_count - 1) * 0.1)  # Slight boost for 2 hands
        
        return min(1.0, base_score * confidence_mult * hand_mult)