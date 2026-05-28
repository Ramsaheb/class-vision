import cv2
import numpy as np
from typing import Dict, Tuple


def estimate_gaze(frame: np.ndarray, bbox: Tuple[int, int, int, int]) -> Dict[str, float | str]:
    """
    Very lightweight gaze estimator.
    Uses intensity centroid inside upper region of face bbox to infer left/right/up/down vs forward.
    Returns direction label and stability [0,1].
    """
    x1, y1, x2, y2 = bbox
    h, w = frame.shape[:2]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w - 1, x2), min(h - 1, y2)
    if x2 <= x1 or y2 <= y1:
        return {"direction": "unknown", "stability": 0.0}

    roi = frame[y1:y2, x1:x2]
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    h2 = gray.shape[0] // 2
    eye_region = gray[:h2, :]

    # Normalize and compute centroid of brightest region (proxy for sclera/eye region)
    norm = cv2.normalize(eye_region, None, 0, 255, cv2.NORM_MINMAX)
    _, th = cv2.threshold(norm, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    M = cv2.moments(th)
    if M["m00"] == 0:
        cx, cy = norm.shape[1] / 2.0, norm.shape[0] / 2.0
    else:
        cx = M["m10"] / M["m00"]
        cy = M["m01"] / M["m00"]

    # Direction by centroid displacement
    dx = (cx - norm.shape[1] / 2.0) / max(1.0, norm.shape[1] / 2.0)
    dy = (cy - norm.shape[0] / 2.0) / max(1.0, norm.shape[0] / 2.0)

    direction = "forward"
    if abs(dx) > 0.25 or abs(dy) > 0.25:
        if abs(dx) >= abs(dy):
            direction = "left" if dx < 0 else "right"
        else:
            direction = "up" if dy < 0 else "down"

    # Stability: how concentrated the bright area is
    white_ratio = float(np.mean(th > 0))
    stability = max(0.0, min(1.0, 1.0 - white_ratio))

    return {"direction": direction, "stability": float(stability)}
