from typing import Dict, Tuple


class SimpleAttentivenessClassifier:
    """
    Lightweight rule-based classifier for attentiveness.
    Produces an attention score [0,1] and a discrete state.
    """

    def __init__(self) -> None:
        pass

    def predict(self, features: Dict[str, float | str]) -> Tuple[float, str]:
        # Base score
        score = 0.6

        # Pose influence
        yaw = abs(float(features.get("yaw", 0.0)))
        pitch = abs(float(features.get("pitch", 0.0)))
        movement = float(features.get("movement", 0.0))
        score -= min(yaw / 45.0, 0.4)  # large yaw reduces score
        score -= min(pitch / 45.0, 0.3)
        score -= min(movement * 0.3, 0.3)

        # Gaze influence
        direction = str(features.get("gaze_direction", "forward"))
        stability = float(features.get("gaze_stability", 0.5))
        if direction != "forward":
            score -= 0.15
        score += (stability - 0.5) * 0.2

        # Clamp
        score = max(0.0, min(1.0, score))

        # State mapping
        if score >= 0.7:
            state = "attentive"
        elif score >= 0.45:
            state = "distracted"
        elif score >= 0.25:
            state = "drowsy"
        else:
            state = "sleeping"

        # Emotion influence (if available)
        emotion_boost = float(features.get("emotion_boost", 0.0))
        score += emotion_boost
        
        # Hand gesture participation influence (if available)
        participation_score = float(features.get("participation_score", 0.0))
        score += participation_score * 0.2  # Moderate influence on attention
        
        # Clamp again after emotion/gesture adjustments
        score = max(0.0, min(1.0, score))

        return float(score), state
