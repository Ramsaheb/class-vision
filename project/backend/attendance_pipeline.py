import os
import cv2
import numpy as np
import pickle
import hashlib
from typing import Dict, List, Tuple, Optional
from PIL import Image
from collections import defaultdict, deque
from dataclasses import dataclass
from pathlib import Path

import torch
from facenet_pytorch import MTCNN, InceptionResnetV1
from ultralytics import YOLO
from scipy.optimize import linear_sum_assignment
import mediapipe as mp

# ==================== CONFIG (from notebook Cell 1) ====================
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
DEFAULT_GALLERY_DIR = os.path.join(PROJECT_ROOT, 'SI1')
DEFAULT_VIDEO_PATH = os.path.join(PROJECT_ROOT, 'input2.mp4')
DEFAULT_OUTPUT_VIDEO = os.path.join(PROJECT_ROOT, 'attendance_output.mp4')
PROCESS_EVERY_N_FRAMES = max(1, int(os.getenv('PROCESS_EVERY_N_FRAMES', '1')))


def _create_robust_video_writer(output_video: str, fps: float, width: int, height: int):
    """Create a VideoWriter with codec fallback to avoid unreadable output files."""
    safe_fps = float(fps) if fps and fps > 1 else 25.0
    safe_width = int(width) if width and width > 0 else 640
    safe_height = int(height) if height and height > 0 else 480

    codec_candidates = ['mp4v', 'XVID', 'MJPG']
    for codec in codec_candidates:
        writer = cv2.VideoWriter(
            output_video,
            cv2.VideoWriter_fourcc(*codec),
            safe_fps,
            (safe_width, safe_height)
        )
        if writer.isOpened():
            print(f"🎥 Video writer initialized with codec={codec}, fps={safe_fps:.2f}, size={safe_width}x{safe_height}")
            return writer
        writer.release()

    raise RuntimeError(
        f"Failed to create output writer for {output_video}. "
        f"Tried codecs: {codec_candidates}"
    )

# Multi-detector
USE_YOLO_FACE = True
USE_MTCNN = True
USE_MEDIAPIPE = True
YOLO_FACE_WEIGHTS = os.path.join(PROJECT_ROOT, 'yolov8n-face.pt')

# Detection thresholds (configurable for classroom density)
YOLO_CONF = float(os.getenv('YOLO_CONF', '0.30'))
MTCNN_THRESHOLD = 0.6
MEDIAPIPE_CONF = 0.5
NMS_IOU_THRESHOLD = float(os.getenv('NMS_IOU_THRESHOLD', '0.45'))

# Validation (relaxed)
MIN_FACE_SIZE = 20
MAX_FACE_SIZE = 500
MIN_ASPECT_RATIO = 0.5
MAX_ASPECT_RATIO = 2.0
MIN_FACE_AREA_RATIO = 0.0005
MAX_FACE_AREA_RATIO = 0.4

# Landmarks
REQUIRE_LANDMARKS = False
MIN_EYE_DISTANCE = 8
MAX_EYE_DISTANCE = 200
EYE_MOUTH_RATIO_MIN = 0.8
EYE_MOUTH_RATIO_MAX = 4.0

# Recognition thresholds (strict defaults for higher identity precision)
MIN_RECOGNITION_SIM = float(os.getenv('MIN_RECOGNITION_SIM', '0.65'))
UNKNOWN_THRESHOLD = float(os.getenv('UNKNOWN_THRESHOLD', '0.55'))
SIM_MARGIN = float(os.getenv('SIM_MARGIN', '0.15'))
STABILITY_FRAMES = int(os.getenv('STABILITY_FRAMES', '5'))
CONFIDENCE_BOOST_FRAMES = int(os.getenv('CONFIDENCE_BOOST_FRAMES', '8'))

# Tracking
MATCHING_IOU_WEIGHT = 0.4
MATCHING_APPEARANCE_WEIGHT = 0.6
MAX_TRACK_AGE_FRAMES = 30
# Attendance thresholds (env-configurable for different classroom/video conditions)
ATTENDANCE_PERCENTAGE_THRESHOLD = float(os.getenv('ATTENDANCE_PERCENTAGE_THRESHOLD', '15'))
PRESENCE_SECONDS_THRESHOLD = float(os.getenv('PRESENCE_SECONDS_THRESHOLD', '5'))

# Quality (disabled for rejection)
BLUR_THRESHOLD = 0
BRIGHTNESS_MIN = 0
BRIGHTNESS_MAX = 255

# ==================== UTILITIES ====================

def calculate_blur(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
    return cv2.Laplacian(gray, cv2.CV_64F).var()

def calculate_brightness(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
    return float(np.mean(gray))

def validate_face_geometry(x1, y1, x2, y2, frame_w, frame_h):
    w = x2 - x1
    h = y2 - y1
    if w < MIN_FACE_SIZE or h < MIN_FACE_SIZE:
        return False, "Too small"
    if w > MAX_FACE_SIZE or h > MAX_FACE_SIZE:
        return False, "Too large"
    aspect_ratio = w / max(h, 1)
    if aspect_ratio < MIN_ASPECT_RATIO or aspect_ratio > MAX_ASPECT_RATIO:
        return False, f"Bad aspect ratio: {aspect_ratio:.2f}"
    face_area = w * h
    frame_area = frame_w * frame_h
    area_ratio = face_area / max(frame_area, 1)
    if area_ratio < MIN_FACE_AREA_RATIO or area_ratio > MAX_FACE_AREA_RATIO:
        return False, f"Bad area ratio: {area_ratio:.4f}"
    return True, "Valid"

def validate_landmarks(landmarks, x1, y1, x2, y2):
    if not REQUIRE_LANDMARKS:
        return True, "Landmarks not required"
    if landmarks is None or len(landmarks) < 5:
        return False, "No landmarks"
    left_eye, right_eye, nose, left_mouth, right_mouth = landmarks[:5]
    eye_distance = np.linalg.norm(left_eye - right_eye)
    if eye_distance < MIN_EYE_DISTANCE or eye_distance > MAX_EYE_DISTANCE:
        return False, f"Bad eye distance: {eye_distance:.1f}"
    eye_center = (left_eye + right_eye) / 2
    mouth_center = (left_mouth + right_mouth) / 2
    eye_mouth_distance = np.linalg.norm(eye_center - mouth_center)
    if eye_mouth_distance < eye_distance * EYE_MOUTH_RATIO_MIN:
        return False, "Eyes too close to mouth"
    if eye_mouth_distance > eye_distance * EYE_MOUTH_RATIO_MAX:
        return False, "Eyes too far from mouth"
    return True, "Valid landmarks"

# ==================== CACHING ====================

class AttendanceCache:
    def __init__(self, cache_dir="cache"):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(exist_ok=True)
        
    def get_gallery_hash(self, gallery_dir):
        """Create hash of gallery folder for cache validation"""
        files_info = []
        for root, dirs, files in os.walk(gallery_dir):
            for file in sorted(files):
                if file.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp')):
                    filepath = os.path.join(root, file)
                    try:
                        mtime = os.path.getmtime(filepath)
                        size = os.path.getsize(filepath)
                        files_info.append(f"{filepath}:{mtime}:{size}")
                    except OSError:
                        continue
        return hashlib.md5('\n'.join(files_info).encode()).hexdigest()
    
    def get_models_cache_path(self):
        """Get path for cached models"""
        return self.cache_dir / "models.pkl"
    
    def get_gallery_cache_path(self):
        """Get path for cached gallery embeddings"""
        return self.cache_dir / "gallery_embeddings.pkl"
    
    def save_models(self, mtcnn, yolo_face, mp_face_detection, resnet):
        """Cache loaded models (excluding YOLO and MediaPipe which don't pickle well)"""
        try:
            cache_data = {
                'resnet_state': resnet.state_dict(),
                'mtcnn_params': {
                    'keep_all': True,
                    'device': str(DEVICE),
                    'min_face_size': MIN_FACE_SIZE,
                    'thresholds': [0.6, 0.7, MTCNN_THRESHOLD]
                } if mtcnn else None,
                'device': str(DEVICE)
            }
            
            with open(self.get_models_cache_path(), 'wb') as f:
                pickle.dump(cache_data, f)
            print(f"💾 Models cached to {self.get_models_cache_path()}")
        except Exception as e:
            print(f"⚠️ Failed to cache models: {e}")
    
    def load_models(self):
        """Load cached models"""
        cache_file = self.get_models_cache_path()
        if not cache_file.exists():
            return None
        
        try:
            with open(cache_file, 'rb') as f:
                cache_data = pickle.load(f)
            
            # Recreate ResNet
            resnet = InceptionResnetV1(pretrained='vggface2').eval().to(DEVICE)
            resnet.load_state_dict(cache_data['resnet_state'])
            
            # Recreate MTCNN
            mtcnn = MTCNN(**cache_data['mtcnn_params']) if cache_data['mtcnn_params'] else None
            
            # YOLO and MediaPipe need to be recreated fresh
            yolo_face = YOLO(YOLO_FACE_WEIGHTS) if USE_YOLO_FACE else None
            mp_face_detection = mp.solutions.face_detection.FaceDetection(
                model_selection=0,
                min_detection_confidence=MEDIAPIPE_CONF
            ) if USE_MEDIAPIPE else None
            
            print(f"✅ Loaded cached models (ResNet + MTCNN)")
            return mtcnn, yolo_face, mp_face_detection, resnet
        except Exception as e:
            print(f"❌ Cache load error: {e}")
            return None
    
    def save_gallery_embeddings(self, gallery_embeddings, gallery_stats, gallery_dir):
        """Cache gallery embeddings"""
        try:
            cache_data = {
                'embeddings': gallery_embeddings,
                'stats': gallery_stats,
                'hash': self.get_gallery_hash(gallery_dir),
                'gallery_dir': gallery_dir,
                'config': {
                    'MIN_RECOGNITION_SIM': MIN_RECOGNITION_SIM,
                    'UNKNOWN_THRESHOLD': UNKNOWN_THRESHOLD,
                    'SIM_MARGIN': SIM_MARGIN
                }
            }
            
            with open(self.get_gallery_cache_path(), 'wb') as f:
                pickle.dump(cache_data, f)
            print(f"💾 Gallery embeddings cached to {self.get_gallery_cache_path()}")
        except Exception as e:
            print(f"⚠️ Failed to cache gallery: {e}")
    
    def load_gallery_embeddings(self, gallery_dir):
        """Load cached gallery embeddings if valid"""
        cache_file = self.get_gallery_cache_path()
        if not cache_file.exists():
            return None, None
        
        try:
            with open(cache_file, 'rb') as f:
                cache_data = pickle.load(f)
            
            # Validate cache
            current_hash = self.get_gallery_hash(gallery_dir)
            if cache_data['hash'] != current_hash:
                print(f"⚠️ Gallery changed, cache invalid")
                return None, None
            
            # Check if config changed
            current_config = {
                'MIN_RECOGNITION_SIM': MIN_RECOGNITION_SIM,
                'UNKNOWN_THRESHOLD': UNKNOWN_THRESHOLD,
                'SIM_MARGIN': SIM_MARGIN
            }
            if cache_data.get('config') != current_config:
                print(f"⚠️ Recognition config changed, cache invalid")
                return None, None
            
            print(f"✅ Loaded cached gallery embeddings for {len(cache_data['embeddings'])} people")
            return cache_data['embeddings'], cache_data['stats']
            
        except Exception as e:
            print(f"❌ Gallery cache load error: {e}")
            return None, None
    
    def clear_cache(self):
        """Clear all cached data"""
        try:
            if self.get_models_cache_path().exists():
                self.get_models_cache_path().unlink()
            if self.get_gallery_cache_path().exists():
                self.get_gallery_cache_path().unlink()
            print("🗑️ Cache cleared")
        except Exception as e:
            print(f"⚠️ Error clearing cache: {e}")
    
    def get_cache_info(self):
        """Get information about cached data"""
        info = {
            'models_cached': self.get_models_cache_path().exists(),
            'gallery_cached': self.get_gallery_cache_path().exists(),
            'cache_dir': str(self.cache_dir)
        }
        
        if info['models_cached']:
            info['models_size_mb'] = self.get_models_cache_path().stat().st_size / (1024*1024)
        
        if info['gallery_cached']:
            info['gallery_size_mb'] = self.get_gallery_cache_path().stat().st_size / (1024*1024)
            try:
                with open(self.get_gallery_cache_path(), 'rb') as f:
                    cache_data = pickle.load(f)
                info['gallery_people_count'] = len(cache_data.get('embeddings', {}))
            except:
                info['gallery_people_count'] = 'unknown'
        
        return info

def load_models_cached(cache):
    """Load models with caching"""
    # Try to load from cache first
    cached_models = cache.load_models()
    if cached_models is not None:
        return cached_models
    
    # Load fresh models
    print("🔄 Loading models from scratch...")
    mtcnn, yolo_face, mp_face_detection, resnet = load_models()
    
    # Cache them for next time
    cache.save_models(mtcnn, yolo_face, mp_face_detection, resnet)
    
    return mtcnn, yolo_face, mp_face_detection, resnet

# ==================== MODELS (from Cell 2 init) ====================

def load_models():
    mtcnn = MTCNN(
        keep_all=True,
        device=DEVICE,
        min_face_size=MIN_FACE_SIZE,
        thresholds=[0.6, 0.7, MTCNN_THRESHOLD]
    ) if USE_MTCNN else None

    yolo_face = YOLO(YOLO_FACE_WEIGHTS) if USE_YOLO_FACE else None

    mp_face_detection = mp.solutions.face_detection.FaceDetection(
        model_selection=0,
        min_detection_confidence=MEDIAPIPE_CONF
    ) if USE_MEDIAPIPE else None

    resnet = InceptionResnetV1(pretrained='vggface2').eval().to(DEVICE)
    return mtcnn, yolo_face, mp_face_detection, resnet

# ==================== DETECTION & EMBEDDINGS ====================

def iou(boxA, boxB):
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    interArea = max(0, xB - xA) * max(0, yB - yA)
    boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
    boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
    denom = max(1, boxAArea + boxBArea - interArea)
    return interArea / denom

def non_max_suppression(detections, iou_threshold=NMS_IOU_THRESHOLD):
    if len(detections) == 0:
        return []
    detections = sorted(detections, key=lambda x: x['confidence'], reverse=True)
    keep = []
    while detections:
        best = detections.pop(0)
        keep.append(best)
        detections = [det for det in detections if iou(best['box'], det['box']) < iou_threshold]
    return keep

def multi_detector_fusion(frame, mtcnn, yolo_face, mp_face_detection):
    frame_h, frame_w = frame.shape[:2]
    all_detections = []
    if USE_YOLO_FACE and yolo_face is not None:
        try:
            results = yolo_face.predict(source=frame, verbose=False, conf=YOLO_CONF)
            for r in results:
                if r.boxes is not None:
                    for box in r.boxes:
                        xyxy = box.xyxy[0].cpu().numpy()
                        conf = float(box.conf[0])
                        x1, y1, x2, y2 = map(int, xyxy)
                        is_valid, _ = validate_face_geometry(x1, y1, x2, y2, frame_w, frame_h)
                        if is_valid:
                            all_detections.append({'box':[x1,y1,x2,y2],'confidence':conf,'source':'YOLO','landmarks':None})
        except Exception as e:
            print(f"YOLO detection error: {e}")
    if USE_MTCNN and mtcnn is not None:
        try:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            boxes, probs, landmarks = mtcnn.detect(Image.fromarray(rgb), landmarks=True)
            if boxes is not None:
                for i, (box, prob) in enumerate(zip(boxes, probs)):
                    if prob >= MTCNN_THRESHOLD:
                        x1, y1, x2, y2 = map(int, box)
                        is_valid, _ = validate_face_geometry(x1, y1, x2, y2, frame_w, frame_h)
                        if not is_valid:
                            continue
                        face_landmarks = landmarks[i] if landmarks is not None else None
                        is_valid_landmarks, _ = validate_landmarks(face_landmarks, x1, y1, x2, y2)
                        if not is_valid_landmarks:
                            continue
                        all_detections.append({'box':[x1,y1,x2,y2],'confidence':float(prob),'source':'MTCNN','landmarks':face_landmarks})
        except Exception as e:
            print(f"MTCNN detection error: {e}")
    if USE_MEDIAPIPE and mp_face_detection is not None:
        try:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = mp_face_detection.process(rgb)
            if results.detections:
                for detection in results.detections:
                    bbox = detection.location_data.relative_bounding_box
                    x1 = int(bbox.xmin * frame_w)
                    y1 = int(bbox.ymin * frame_h)
                    x2 = int((bbox.xmin + bbox.width) * frame_w)
                    y2 = int((bbox.ymin + bbox.height) * frame_h)
                    is_valid, _ = validate_face_geometry(x1, y1, x2, y2, frame_w, frame_h)
                    if is_valid:
                        all_detections.append({'box':[x1,y1,x2,y2],'confidence':float(detection.score[0]),'source':'MediaPipe','landmarks':None})
        except Exception as e:
            print(f"MediaPipe detection error: {e}")
    return non_max_suppression(all_detections, iou_threshold=NMS_IOU_THRESHOLD)

def advanced_crop_and_align(img_bgr, box, margin=0.3, target_size=160):
    x1, y1, x2, y2 = box
    h, w = img_bgr.shape[:2]
    face_w = x2 - x1
    face_h = y2 - y1
    margin_x = int(face_w * margin)
    margin_y = int(face_h * margin)
    x1_crop = max(0, x1 - margin_x)
    y1_crop = max(0, y1 - margin_y)
    x2_crop = min(w, x2 + margin_x)
    y2_crop = min(h, y2 + margin_y)
    crop = img_bgr[y1_crop:y2_crop, x1_crop:x2_crop]
    if crop.size == 0:
        return None, {}
    blur_score = calculate_blur(crop)
    brightness = calculate_brightness(crop)
    quality_metrics = {'blur': float(blur_score), 'brightness': float(brightness), 'is_quality': True}
    pil_img = Image.fromarray(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)).resize((target_size, target_size), Image.Resampling.LANCZOS)
    return pil_img, quality_metrics

def get_enhanced_embedding(pil_img, resnet):
    if pil_img is None:
        return None
    with torch.inference_mode():
        img_array = np.array(pil_img).astype(np.float32) / 255.0
        img_array = (img_array - 0.5) / 0.5
        img_tensor = torch.from_numpy(img_array).permute(2, 0, 1).unsqueeze(0).to(DEVICE)
        embedding = resnet(img_tensor)
        embedding = embedding / embedding.norm(dim=1, keepdim=True)
        return embedding[0].cpu().numpy()

# ==================== GALLERY & MATCHING ====================

def build_advanced_gallery(gallery_dir, mtcnn, yolo_face, mp_face_detection, resnet):
    print("🎯 Building advanced gallery...")
    gallery_embeddings: Dict[str, np.ndarray] = {}
    gallery_stats: Dict[str, Dict] = {}
    for person_dir in sorted(os.listdir(gallery_dir)):
        person_path = os.path.join(gallery_dir, person_dir)
        if not os.path.isdir(person_path):
            continue
        embeddings: List[np.ndarray] = []
        quality_scores: List[float] = []
        # Iterate images (common formats)
        for img_name in os.listdir(person_path):
            if not img_name.lower().endswith((".jpg",".jpeg",".png",".bmp")):
                continue
            img_path = os.path.join(person_path, img_name)
            try:
                img = cv2.imread(img_path)
                if img is None:
                    continue
                detections = multi_detector_fusion(img, mtcnn, yolo_face, mp_face_detection)
                if len(detections) == 0:
                    continue
                best_detection = max(detections, key=lambda x: x['confidence'])
                box = best_detection['box']
                pil_img, quality_metrics = advanced_crop_and_align(img, box)
                if pil_img is None:
                    continue
                embedding = get_enhanced_embedding(pil_img, resnet)
                if embedding is not None:
                    embeddings.append(embedding)
                    quality_scores.append(quality_metrics.get('blur', 0) + quality_metrics.get('brightness', 0))
            except Exception as e:
                print(f"Gallery processing error for {img_path}: {e}")
        if len(embeddings) >= 1:
            embeddings_np = np.array(embeddings)
            if len(embeddings_np) == 1:
                centroid = embeddings_np[0]
            else:
                qs = np.array(quality_scores) if len(quality_scores) == len(embeddings_np) else np.ones(len(embeddings_np))
                weights = qs / max(qs.sum(), 1e-6)
                centroid = np.average(embeddings_np, axis=0, weights=weights)
            centroid = centroid / max(np.linalg.norm(centroid), 1e-8)
            gallery_embeddings[person_dir] = centroid
            gallery_stats[person_dir] = {
                'num_images': len(embeddings_np),
                'avg_quality': float(np.mean(quality_scores)) if len(quality_scores) else 0.0,
                'quality_std': float(np.std(quality_scores)) if len(quality_scores) else 0.0
            }
            print(f"✅ {person_dir}: {len(embeddings_np)} images (avg quality: {gallery_stats[person_dir]['avg_quality']:.1f})")
        else:
            print(f"❌ {person_dir}: no usable images (0)")
    print(f"🎯 Gallery complete: {len(gallery_embeddings)} people with embeddings")
    return gallery_embeddings, gallery_stats

def advanced_gallery_matching(embedding, gallery_embeddings: Dict[str, np.ndarray]):
    """
    Strict gallery matching that prefers Unknown over false positives
    """
    if embedding is None or not gallery_embeddings:
        return "Unknown", 0.0, "No embedding or gallery"
    
    similarities = {}
    for name, gallery_emb in gallery_embeddings.items():
        # Normalize embeddings properly
        emb_norm = np.linalg.norm(embedding)
        gallery_norm = np.linalg.norm(gallery_emb)
        
        if emb_norm < 1e-8 or gallery_norm < 1e-8:
            similarities[name] = 0.0
            continue
            
        # Cosine similarity
        sim = float(np.dot(embedding, gallery_emb) / (emb_norm * gallery_norm))
        similarities[name] = sim
    
    if not similarities:
        return "Unknown", 0.0, "No valid similarities"
    
    # Sort by similarity (highest first)
    sorted_sims = sorted(similarities.items(), key=lambda x: x[1], reverse=True)
    best_name, best_sim = sorted_sims[0]
    second_best_sim = sorted_sims[1][1] if len(sorted_sims) > 1 else -1.0
    
    # STRICT THRESHOLDS - Prefer Unknown over false positive
    
    # 1. Absolute minimum threshold
    if best_sim < UNKNOWN_THRESHOLD:
        return "Unknown", best_sim, f"Below unknown threshold ({best_sim:.3f} < {UNKNOWN_THRESHOLD})"
    
    # 2. Recognition threshold
    if best_sim < MIN_RECOGNITION_SIM:
        return "Unknown", best_sim, f"Below recognition threshold ({best_sim:.3f} < {MIN_RECOGNITION_SIM})"
    
    # 3. Margin requirement - STRICT (no relaxed margin)
    margin = best_sim - second_best_sim
    if margin < SIM_MARGIN:
        return "Unknown", best_sim, f"Insufficient margin ({best_sim:.3f} - {second_best_sim:.3f} = {margin:.3f} < {SIM_MARGIN})"
    
    # 4. Additional strictness: High confidence requirement
    HIGH_CONFIDENCE_THRESHOLD = 0.75  # Very high threshold for confident recognition
    if best_sim < HIGH_CONFIDENCE_THRESHOLD and margin < (SIM_MARGIN * 1.5):
        return "Unknown", best_sim, f"Medium confidence with small margin ({best_sim:.3f}, margin: {margin:.3f})"
    
    # 5. Passed all checks - confident match
    return best_name, best_sim, f"Confident match (sim: {best_sim:.3f}, margin: {margin:.3f})"

# ==================== MAIN RUNNER (from Cell 3) ====================

def run_attendance(
    gallery_dir: str = DEFAULT_GALLERY_DIR,
    video_path: str = DEFAULT_VIDEO_PATH,
    output_video: str = DEFAULT_OUTPUT_VIDEO,
):
    """Backward compatible wrapper - now uses caching by default"""
    return run_attendance_cached(
        gallery_dir=gallery_dir,
        video_path=video_path,
        output_video=output_video,
        use_cache=True,
        clear_cache=False
    )

    return {
        'video_path': video_path,
        'output_video': output_video,
        'csv_path': csv_path,
        'gallery_stats': gallery_stats,
        'detection_stats': {k:int(v) for k,v in detection_stats.items()},
        'recognition_stats': {k:int(v) for k,v in recognition_stats.items()},
        'unknown_reasons': {k:int(v) for k,v in unknown_reasons.items()},
        'attendance': attendance_data
    }

def run_attendance_cached(
    gallery_dir: str = DEFAULT_GALLERY_DIR,
    video_path: str = DEFAULT_VIDEO_PATH,
    output_video: str = DEFAULT_OUTPUT_VIDEO,
    use_cache: bool = True,
    clear_cache: bool = False,
    progress_callback: Optional[callable] = None
):
    """
    Optimized attendance processing with caching
    
    Args:
        gallery_dir: Directory containing person folders with images
        video_path: Path to input video
        output_video: Path for output video
        use_cache: Whether to use caching (default: True)
        clear_cache: Whether to clear existing cache (default: False)
    """
    
    # Initialize cache
    cache = AttendanceCache()

    print(f"⚡ Frame sampling: processing 1 of every {PROCESS_EVERY_N_FRAMES} frame(s)")
    print(f"👁️ Detection settings: yolo_conf={YOLO_CONF:.2f}, nms_iou={NMS_IOU_THRESHOLD:.2f}")
    print(
        "🎯 Recognition thresholds: "
        f"min_sim={MIN_RECOGNITION_SIM:.2f}, unknown={UNKNOWN_THRESHOLD:.2f}, "
        f"margin={SIM_MARGIN:.2f}, stability={STABILITY_FRAMES}"
    )
    
    if clear_cache:
        cache.clear_cache()
        print("🗑️ Cache cleared as requested")
    
    # Show cache info
    if use_cache:
        cache_info = cache.get_cache_info()
        print(f"💾 Cache Info: Models={'✅' if cache_info['models_cached'] else '❌'}, "
              f"Gallery={'✅' if cache_info['gallery_cached'] else '❌'}")
        if cache_info['gallery_cached']:
            print(f"   Gallery: {cache_info.get('gallery_people_count', 'unknown')} people")
    
    # Progress callback for initialization
    if progress_callback:
        progress_callback(5, "Loading models and initializing...")
    
    # Load models (with caching if enabled)
    if use_cache:
        mtcnn, yolo_face, mp_face_detection, resnet = load_models_cached(cache)
    else:
        print("🔄 Loading models without cache...")
        mtcnn, yolo_face, mp_face_detection, resnet = load_models()
    
    if progress_callback:
        progress_callback(15, "Models loaded, processing gallery...")
    
    print("🎯 Starting cached attendance processing...")
    
    # Try to load cached gallery embeddings
    gallery_embeddings, gallery_stats = None, None
    if use_cache:
        gallery_embeddings, gallery_stats = cache.load_gallery_embeddings(gallery_dir)
    
    # Build gallery if not cached or cache disabled
    if gallery_embeddings is None or gallery_stats is None:
        print("🔄 Building gallery embeddings...")
        gallery_embeddings, gallery_stats = build_advanced_gallery(
            gallery_dir, mtcnn, yolo_face, mp_face_detection, resnet
        )
        
        # Cache the results if caching is enabled
        if use_cache:
            cache.save_gallery_embeddings(gallery_embeddings, gallery_stats, gallery_dir)
    
    if len(gallery_embeddings) == 0:
        raise RuntimeError("Gallery is empty - check your gallery directory")
    
    print("📊 Gallery Statistics:")
    for name, stats in gallery_stats.items():
        print(f"  {name}: {stats['num_images']} images, quality: {stats['avg_quality']:.1f} ± {stats['quality_std']:.1f}")
    
    # Video processing (same as original)
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        fallbacks = [
            DEFAULT_VIDEO_PATH,
            os.path.join(PROJECT_ROOT, 'input1.mp4'),
            os.path.join(os.getcwd(), 'input.mp4'),
            'input.mp4',
            os.path.join(os.getcwd(), 'input1.mp4'),
            'input1.mp4'
        ]
        for fb in fallbacks:
            cap = cv2.VideoCapture(fb)
            if cap.isOpened():
                video_path = fb
                break
    
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video from any path. Tried: {[video_path] + fallbacks}")
    
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    
    print(f"🎬 Processing video: {frame_w}x{frame_h} @ {fps:.1f} FPS, {total_frames} frames")
    
    out = _create_robust_video_writer(output_video, fps, frame_w, frame_h) if output_video else None

    tracks: List[AdvancedTrack] = []  # type: ignore[name-defined]
    detection_stats = defaultdict(int)
    recognition_stats = defaultdict(int)
    unknown_reasons = defaultdict(int)
    frame_idx = 0

    # Initial progress report
    if progress_callback:
        progress_callback(0, f"Starting video processing - {total_frames} frames to process")

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        frame_idx += 1
        
        # Calculate progress percentage
        progress_percent = (frame_idx / max(total_frames, 1)) * 100 if total_frames > 0 else 0
        
        if frame_idx % PROCESS_EVERY_N_FRAMES != 0:
            if out is not None:
                out.write(frame)
            continue
        
        # Show progress and send callback (reduced frequency)
        if frame_idx % 100 == 0 or frame_idx % max(1, total_frames // 10) == 0:  # Update every 10%
            message = f"Processing frame {frame_idx}/{total_frames} - {len(tracks)} active tracks"
            print(f"📍 {message}")
            if progress_callback:
                progress_callback(progress_percent, message)
        
        detections = multi_detector_fusion(frame, mtcnn, yolo_face, mp_face_detection)
        detection_stats['total_detections'] += len(detections)
        
        valid_detections = []
        det_embeddings = []
        for det_info in detections:
            box = det_info['box']
            pil_img, quality_metrics = advanced_crop_and_align(frame, box)
            if pil_img is None:
                detection_stats['low_quality'] += 1
                continue
            embedding = get_enhanced_embedding(pil_img, resnet)
            if embedding is None:
                detection_stats['embedding_failed'] += 1
                continue
            valid_detections.append(det_info)
            det_embeddings.append(embedding)
            detection_stats['valid_detections'] += 1
        
        cost_matrix = compute_advanced_cost_matrix(valid_detections, det_embeddings, tracks)  # type: ignore[name-defined]
        if cost_matrix.size > 0:
            row_indices, col_indices = linear_sum_assignment(cost_matrix)
        else:
            row_indices, col_indices = [], []
        
        matched_detections = set()
        matched_tracks = set()
        for det_idx, track_idx in zip(row_indices, col_indices):
            cost = cost_matrix[det_idx, track_idx]
            if cost < 0.8:
                track = tracks[track_idx]
                det_info = valid_detections[det_idx]
                box = det_info['box']
                _, quality_metrics = advanced_crop_and_align(frame, box)
                track.update(box, det_embeddings[det_idx], frame_idx, det_info, quality_metrics)
                matched_detections.add(det_idx)
                matched_tracks.add(track_idx)
        
        for det_idx, det_info in enumerate(valid_detections):
            if det_idx not in matched_detections:
                box = det_info['box']
                _, quality_metrics = advanced_crop_and_align(frame, box)
                new_track = AdvancedTrack(box, det_embeddings[det_idx], frame_idx, det_info)  # type: ignore[name-defined]
                tracks.append(new_track)
        
        tracks = [t for t in tracks if frame_idx - t.last_seen <= MAX_TRACK_AGE_FRAMES]
        
        for track in tracks:
            if track.last_seen < frame_idx:
                track.time_since_update = frame_idx - track.last_seen
        
        for track in tracks:
            current_emb = track.current_embedding()
            if current_emb is not None:
                name, confidence, reason = advanced_gallery_matching(current_emb, gallery_embeddings)
                
                # Debug output for recognition decisions (every 50 frames)
                if frame_idx % 50 == 0 and track.id <= 3:  # Only show for first few tracks
                    print(f"🔍 Track-{track.id} Frame-{frame_idx}: {name} (conf: {confidence:.3f}) - {reason}")
                
                if name != 'Unknown':
                    track.add_recognition_vote(name, confidence, frame_idx)
                    recognition_stats[name] += 1
                else:
                    unknown_reasons[reason] += 1
                    recognition_stats['Unknown'] += 1
        
        # Visualization (same as original)
        vis_frame = frame.copy()
        for det_info in detections:
            x1, y1, x2, y2 = det_info['box']
            source = det_info.get('source', 'Unknown')
            conf = float(det_info.get('confidence', 0.0))
            if source == 'YOLO':
                color = (255, 100, 0)
            elif source == 'MTCNN':
                color = (0, 255, 100)
            elif source == 'MediaPipe':
                color = (100, 0, 255)
            else:
                color = (128, 128, 128)
            cv2.rectangle(vis_frame, (x1, y1), (x2, y2), color, 1)
            cv2.putText(vis_frame, f"{source[:1]}{conf:.2f}", (x1, max(0, y1-5)), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)
        
        for track in tracks:
            x1, y1, x2, y2 = track.bbox
            if track.stable_label is None:
                color = (128, 128, 128)
                label = f"Track-{track.id}"
            elif track.stable_label == 'Unknown':
                color = (0, 0, 255)
                label = 'Unknown'
            else:
                color = (0, 255, 0)
                label = track.stable_label
            thickness = 3 if track.stable_label is not None else 2
            cv2.rectangle(vis_frame, (x1, y1), (x2, y2), color, thickness)
            conf_val = track.get_track_confidence()
            cv2.putText(vis_frame, f"{label} ({conf_val:.2f})", (x1, max(0, y1-10)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
        
        if out is not None:
            out.write(vis_frame)

    cap.release()
    if out is not None:
        out.release()

    # Calculate video duration for percentage-based attendance
    video_duration_seconds = total_frames / max(fps, 1)
    processed_frames = frame_idx  # Actual frames processed
    
    print(f"📊 Video Analysis Complete:")
    print(f"   📹 Total frames: {total_frames}, Processed: {processed_frames}")
    print(f"   ⏱️  Video duration: {video_duration_seconds:.1f}s, FPS: {fps:.1f}")

    # Process attendance results with corrected time calculation
    attendance_data = {}
    for track in tracks:
        if track.stable_label and track.stable_label != 'Unknown':
            name = track.stable_label
            # Fix: Use actual video duration for time calculation
            presence_seconds = (track.present_frames / max(processed_frames, 1)) * video_duration_seconds
            presence_percentage = (track.present_frames / max(processed_frames, 1)) * 100
            
            if name not in attendance_data:
                attendance_data[name] = {
                    'total_frames': 0,
                    'presence_seconds': 0,
                    'presence_percentage': 0,
                    'tracks': [],
                    'avg_confidence': 0,
                    'detection_sources': []
                }
            attendance_data[name]['total_frames'] += track.present_frames
            attendance_data[name]['presence_seconds'] += presence_seconds
            attendance_data[name]['presence_percentage'] += presence_percentage
            attendance_data[name]['tracks'].append(track.id)
            if track.stable_label in track.confidence_scores:
                avg_conf = float(np.mean(track.confidence_scores[track.stable_label]))
                attendance_data[name]['avg_confidence'] = max(attendance_data[name]['avg_confidence'], avg_conf)
            attendance_data[name]['detection_sources'].extend(track.detection_sources)

    print(f"✅ Processing complete!")
    print(f"📹 Output video: {output_video}")
    
    # Print recognition statistics
    print(f"\n📈 Recognition Statistics:")
    for name, count in sorted(recognition_stats.items()):
        print(f"   {name}: {count} recognitions")
    
    print(f"\n❓ Unknown Detection Reasons:")
    for reason, count in sorted(unknown_reasons.items()):
        print(f"   {reason}: {count} times")
    
    print(f"\n👥 Attendance Summary (Threshold: {ATTENDANCE_PERCENTAGE_THRESHOLD}% of video):")
    for name, data in sorted(attendance_data.items()):
        status = "✅ Present" if data['presence_percentage'] >= ATTENDANCE_PERCENTAGE_THRESHOLD else "❌ Absent"
        print(f"   {name}: {data['presence_seconds']:.1f}s ({data['presence_percentage']:.1f}% of video, {data['avg_confidence']:.3f} conf) - {status}")
    
    # Cache statistics
    if use_cache:
        cache_info = cache.get_cache_info()
        print(f"💾 Cache statistics:")
        print(f"   Models cached: {'✅' if cache_info['models_cached'] else '❌'}")
        print(f"   Gallery cached: {'✅' if cache_info['gallery_cached'] else '❌'}")

    return {
        'video_path': video_path,
        'output_video': output_video,
        'gallery_stats': gallery_stats,
        'detection_stats': {k:int(v) for k,v in detection_stats.items()},
        'recognition_stats': {k:int(v) for k,v in recognition_stats.items()},
        'unknown_reasons': {k:int(v) for k,v in unknown_reasons.items()},
        'attendance': attendance_data,
        'cache_info': cache_info if use_cache else None
    }

# ==================== TRACK CLASS & COST MATRIX (from Cell 2/3) ====================

class AdvancedTrack:
    _next_id = 0
    def __init__(self, bbox, embedding, frame_idx, detection_info):
        self.id = AdvancedTrack._next_id
        AdvancedTrack._next_id += 1
        self.bbox = bbox
        self.embedding_history = deque(maxlen=20)
        if embedding is not None:
            self.embedding_history.append(embedding)
        self.last_seen = frame_idx
        self.age = 0
        self.hit_streak = 1
        self.time_since_update = 0
        self.label_votes = defaultdict(int)
        self.confidence_scores = defaultdict(list)
        self.stable_label = None
        self.frames_with_label = 0
        self.quality_history = deque(maxlen=10)
        self.detection_sources = [detection_info.get('source', 'unknown')]
        self.present_frames = 0
        self.last_recognition_time = frame_idx
    def current_embedding(self):
        if len(self.embedding_history) == 0:
            return None
        weights = np.exp(np.linspace(-1, 0, len(self.embedding_history)))
        weights = weights / weights.sum()
        embeddings = np.array(list(self.embedding_history))
        weighted_embedding = np.average(embeddings, axis=0, weights=weights)
        norm = np.linalg.norm(weighted_embedding)
        return weighted_embedding / max(norm, 1e-8)
    def update(self, bbox, embedding, frame_idx, detection_info, quality_metrics):
        self.bbox = bbox
        self.last_seen = frame_idx
        self.time_since_update = 0
        self.hit_streak += 1
        if embedding is not None:
            self.embedding_history.append(embedding)
        self.quality_history.append(quality_metrics)
        self.detection_sources.append(detection_info.get('source', 'unknown'))
        self.detection_sources = self.detection_sources[-10:]
    def add_recognition_vote(self, name, confidence, frame_idx):
        """
        Add recognition vote with strict requirements for unknown detection
        """
        if name is None or name == "Unknown":
            return
        
        # Only accept high-confidence votes
        if confidence < MIN_RECOGNITION_SIM:
            return
        
        self.label_votes[name] += 1
        self.confidence_scores[name].append(confidence)
        
        # STRICT requirements for establishing stable label
        if self.stable_label is None:
            # Require HIGH confidence AND multiple votes
            min_votes_required = max(STABILITY_FRAMES, 3)  # At least 3 votes minimum
            
            # For very high confidence, allow faster recognition
            if confidence >= 0.80 and self.label_votes[name] >= 2:
                recent_confidences = self.confidence_scores[name][-2:]
                if all(c >= 0.75 for c in recent_confidences):
                    self.stable_label = name
                    self.frames_with_label = 1
                    self.last_recognition_time = frame_idx
                    return
            
            # Standard path: require multiple consistent votes
            if self.label_votes[name] >= min_votes_required:
                recent_confidences = self.confidence_scores[name][-min_votes_required:]
                avg_confidence = np.mean(recent_confidences)
                min_confidence = min(recent_confidences)
                
                # All recent votes must be reasonably confident
                if avg_confidence >= (MIN_RECOGNITION_SIM + 0.1) and min_confidence >= MIN_RECOGNITION_SIM:
                    self.stable_label = name
                    self.frames_with_label = 1
                    self.last_recognition_time = frame_idx
                    
        elif self.stable_label == name:
            # Continue with same person
            self.frames_with_label += 1
            self.last_recognition_time = frame_idx
        else:
            # Different person detected - be very conservative
            if confidence >= 0.85 and self.label_votes[name] >= (STABILITY_FRAMES * 2):
                # Only change if very confident and many votes
                recent_avg = np.mean(self.confidence_scores[name][-STABILITY_FRAMES:])
                if recent_avg >= 0.80:
                    self.stable_label = name
                    self.frames_with_label = 1
                    self.last_recognition_time = frame_idx
        
        # Only count as present if we have a stable, non-unknown label
        if self.stable_label is not None and self.stable_label != 'Unknown':
            self.present_frames += 1
    def get_track_confidence(self):
        base_conf = min(1.0, self.hit_streak / 10.0)
        if len(self.quality_history) > 0:
            avg_quality = np.mean([q.get('blur', 0) for q in self.quality_history])
            quality_bonus = min(0.2, avg_quality / 500.0)
        else:
            quality_bonus = 0
        unique_sources = len(set(self.detection_sources))
        source_bonus = min(0.1, unique_sources * 0.05)
        return base_conf + quality_bonus + source_bonus

def compute_advanced_cost_matrix(detections, det_embeddings, tracks):
    n_det = len(detections)
    n_trk = len(tracks)
    if n_det == 0 or n_trk == 0:
        return np.zeros((n_det, n_trk), dtype=np.float32)
    cost_matrix = np.zeros((n_det, n_trk), dtype=np.float32)
    for i, det_info in enumerate(detections):
        det_box = det_info['box']
        det_emb = det_embeddings[i]
        for j, track in enumerate(tracks):
            iou_val = iou(det_box, track.bbox)
            iou_cost = 1.0 - iou_val
            if det_emb is not None and track.current_embedding() is not None:
                sim = np.dot(det_emb, track.current_embedding())
                app_cost = 1.0 - max(0.0, sim)
            else:
                app_cost = 1.0
            conf_bonus = 1.0 - track.get_track_confidence()
            age_penalty = min(0.3, track.time_since_update * 0.1)
            total_cost = (MATCHING_IOU_WEIGHT * iou_cost + MATCHING_APPEARANCE_WEIGHT * app_cost + 0.1 * conf_bonus + 0.1 * age_penalty)
            cost_matrix[i, j] = total_cost
    return cost_matrix

# ==================== USAGE EXAMPLES ====================

if __name__ == "__main__":
    # Example usage with caching (recommended)
    print("🚀 Running attendance processing with caching...")
    
    # Basic usage (caching enabled by default)
    result = run_attendance_cached()
    
    # Advanced usage examples:
    
    # Force cache rebuild (if you changed gallery or want fresh results)
    # result = run_attendance_cached(clear_cache=True)
    
    # Disable caching (original behavior)
    # result = run_attendance_cached(use_cache=False)
    
    # Custom paths
    # result = run_attendance_cached(
    #     gallery_dir="path/to/your/gallery",
    #     video_path="path/to/your/video.mp4",
    #     output_video="path/to/output.mp4"
    # )
    
    # Check cache status
    cache = AttendanceCache()
    info = cache.get_cache_info()
    print(f"\n💾 Final Cache Status:")
    print(f"   Cache directory: {info['cache_dir']}")
    print(f"   Models cached: {'✅' if info['models_cached'] else '❌'}")
    print(f"   Gallery cached: {'✅' if info['gallery_cached'] else '❌'}")
    if info['gallery_cached']:
        print(f"   Gallery people: {info.get('gallery_people_count', 'unknown')}")
    
    print(f"\n🎉 Processing complete! Found {len(result['attendance'])} people in attendance.")
    print(f"📹 Output video: {result['output_video']}")
    print(f"📊 CSV results: {result['csv_path']}")
    
    # Next run will be much faster due to caching! 🚀
