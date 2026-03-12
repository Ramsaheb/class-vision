import cv2
import numpy as np
from typing import Dict, Tuple

def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))

def estimate_head_pose(frame: np.ndarray, bbox: Tuple[int, int, int, int]) -> Dict[str, float]:
    """
    Lightweight, heuristic head pose estimation using image gradients.
    Returns approximate yaw/pitch/roll in degrees and a movement score [0,1].
    This is NOT a full PnP-based head pose. It's a fast proxy that works
    reasonably on frontal classroom videos without requiring landmarks.
    """
    x1, y1, x2, y2 = bbox
    h, w = frame.shape[:2]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w - 1, x2), min(h - 1, y2)
    if x2 <= x1 or y2 <= y1:
        return {"yaw": 0.0, "pitch": 0.0, "roll": 0.0, "movement": 0.0}

    roi = frame[y1:y2, x1:x2]
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)

    # Sobel gradients
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)

    # Horizontal vs vertical edge energy gives a rough hint of yaw/pitch
    ex = float(np.mean(np.abs(gx))) + 1e-6
    ey = float(np.mean(np.abs(gy))) + 1e-6

    # Heuristic yaw/pitch [-30,30] deg range
    yaw = _clamp((ex - ey) / (ex + ey), -1.0, 1.0) * 25.0
    pitch = _clamp((ey - ex) / (ex + ey), -1.0, 1.0) * 20.0

    # Roll from covariance orientation
    cov = np.cov(gx.reshape(-1), gy.reshape(-1))
    roll = 0.0
    try:
        eigvals, eigvecs = np.linalg.eig(cov)
        v = eigvecs[:, np.argmax(eigvals)]
        roll = np.degrees(np.arctan2(v[1], v[0])) * 0.3
    except Exception:
        roll = 0.0

    # Movement score from gradient magnitude
    movement = float(np.mean(np.hypot(gx, gy)))
    movement = float(_clamp(movement / 50.0, 0.0, 1.0))

    return {"yaw": float(yaw), "pitch": float(pitch), "roll": float(roll), "movement": movement}
