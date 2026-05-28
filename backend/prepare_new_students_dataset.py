import argparse
import math
import os
from pathlib import Path
from typing import List, Optional, Tuple

import cv2  # type: ignore[import-not-found]
import mediapipe as mp  # type: ignore[import-not-found]
import numpy as np


DEFAULT_OLD_STUDENTS = {
    "harsh",
    "harshit",
    "harshal",
    "vishal",
    "ramsaheb",
    "krish",
    "rajendra",
}

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp"}


def clamp(v: int, lo: int, hi: int) -> int:
    return max(lo, min(v, hi))


def list_images(folder: Path) -> List[Path]:
    return [p for p in sorted(folder.iterdir()) if p.is_file() and p.suffix.lower() in IMAGE_EXTS]


def detect_face_box_mediapipe(img_bgr: np.ndarray, detector) -> Optional[Tuple[int, int, int, int]]:
    h, w = img_bgr.shape[:2]
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    result = detector.process(rgb)
    if not result.detections:
        return None

    best = None
    best_area = -1
    for det in result.detections:
        bbox = det.location_data.relative_bounding_box
        x1 = int(bbox.xmin * w)
        y1 = int(bbox.ymin * h)
        x2 = int((bbox.xmin + bbox.width) * w)
        y2 = int((bbox.ymin + bbox.height) * h)
        x1 = clamp(x1, 0, w - 1)
        y1 = clamp(y1, 0, h - 1)
        x2 = clamp(x2, 0, w - 1)
        y2 = clamp(y2, 0, h - 1)
        if x2 <= x1 or y2 <= y1:
            continue
        area = (x2 - x1) * (y2 - y1)
        if area > best_area:
            best_area = area
            best = (x1, y1, x2, y2)
    return best


def detect_face_box_haar(img_bgr: np.ndarray, cascade) -> Optional[Tuple[int, int, int, int]]:
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(40, 40))
    if len(faces) == 0:
        return None
    x, y, w, h = max(faces, key=lambda t: t[2] * t[3])
    return int(x), int(y), int(x + w), int(y + h)


def center_box(img_bgr: np.ndarray, frac: float = 0.65) -> Tuple[int, int, int, int]:
    h, w = img_bgr.shape[:2]
    side = int(min(h, w) * frac)
    cx, cy = w // 2, h // 2
    x1 = clamp(cx - side // 2, 0, w - 1)
    y1 = clamp(cy - side // 2, 0, h - 1)
    x2 = clamp(x1 + side, 1, w)
    y2 = clamp(y1 + side, 1, h)
    return x1, y1, x2, y2


def expand_box(box: Tuple[int, int, int, int], w: int, h: int, margin: float = 0.35) -> Tuple[int, int, int, int]:
    x1, y1, x2, y2 = box
    bw = x2 - x1
    bh = y2 - y1
    mx = int(bw * margin)
    my = int(bh * margin)
    nx1 = clamp(x1 - mx, 0, w - 1)
    ny1 = clamp(y1 - my, 0, h - 1)
    nx2 = clamp(x2 + mx, 1, w)
    ny2 = clamp(y2 + my, 1, h)
    return nx1, ny1, nx2, ny2


def crop_face(img_bgr: np.ndarray, detector, cascade, out_size: int) -> np.ndarray:
    h, w = img_bgr.shape[:2]
    box = detect_face_box_mediapipe(img_bgr, detector)
    if box is None:
        box = detect_face_box_haar(img_bgr, cascade)
    if box is None:
        box = center_box(img_bgr, frac=0.65)
    box = expand_box(box, w, h, margin=0.35)
    x1, y1, x2, y2 = box
    face = img_bgr[y1:y2, x1:x2]
    if face.size == 0:
        face = img_bgr
    face = cv2.resize(face, (out_size, out_size), interpolation=cv2.INTER_LANCZOS4)
    return face


def rotate_image(img: np.ndarray, angle_deg: float) -> np.ndarray:
    h, w = img.shape[:2]
    c = (w / 2.0, h / 2.0)
    m = cv2.getRotationMatrix2D(c, angle_deg, 1.0)
    return cv2.warpAffine(img, m, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


def change_brightness_contrast(img: np.ndarray, alpha: float, beta: float) -> np.ndarray:
    out = cv2.convertScaleAbs(img, alpha=alpha, beta=beta)
    return out


def zoom_center(img: np.ndarray, zoom: float) -> np.ndarray:
    if zoom <= 1.0:
        return img.copy()
    h, w = img.shape[:2]
    nh, nw = int(h / zoom), int(w / zoom)
    y1 = (h - nh) // 2
    x1 = (w - nw) // 2
    crop = img[y1:y1 + nh, x1:x1 + nw]
    return cv2.resize(crop, (w, h), interpolation=cv2.INTER_LINEAR)


def make_augmented(face_img: np.ndarray) -> List[np.ndarray]:
    return [
        cv2.flip(face_img, 1),
        rotate_image(face_img, -8),
        rotate_image(face_img, 8),
        change_brightness_contrast(face_img, alpha=1.10, beta=8),
        change_brightness_contrast(face_img, alpha=0.92, beta=-8),
        zoom_center(face_img, 1.12),
    ]


def save_unique(img: np.ndarray, folder: Path, stem: str, quality: int = 95) -> Path:
    idx = 0
    while True:
        suffix = "" if idx == 0 else f"_{idx}"
        out = folder / f"{stem}{suffix}.jpg"
        if not out.exists():
            cv2.imwrite(str(out), img, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
            return out
        idx += 1


def process_student_folder(folder: Path, detector, cascade, out_size: int, augment_per_image: int) -> Tuple[int, int]:
    images = list_images(folder)
    if not images:
        return 0, 0

    created = 0
    processed = 0

    for img_path in images:
        img = cv2.imread(str(img_path))
        if img is None:
            continue

        face = crop_face(img, detector, cascade, out_size=out_size)
        save_unique(face, folder, img_path.stem + "_face")
        created += 1
        processed += 1

        aug_imgs = make_augmented(face)
        for i, aug in enumerate(aug_imgs[:augment_per_image]):
            save_unique(aug, folder, img_path.stem + f"_aug{i+1}")
            created += 1

    return processed, created


def main() -> None:
    parser = argparse.ArgumentParser(description="Crop faces + augment only OLD student folders in SI1")
    parser.add_argument("--gallery-dir", default=str(Path(__file__).resolve().parents[1] / "SI1"), help="Path to SI1 folder")
    parser.add_argument("--out-size", type=int, default=224, help="Output face size")
    parser.add_argument("--augment-per-image", type=int, default=4, help="How many augmentations per input image")
    parser.add_argument("--include", default="", help="Comma-separated names to force include")
    parser.add_argument("--exclude", default="", help="Comma-separated names to force exclude")
    args = parser.parse_args()

    gallery_dir = Path(args.gallery_dir)
    if not gallery_dir.exists():
        raise SystemExit(f"Gallery dir not found: {gallery_dir}")

    include = {x.strip().lower() for x in args.include.split(",") if x.strip()}
    exclude = {x.strip().lower() for x in args.exclude.split(",") if x.strip()}

    mp_detector = mp.solutions.face_detection.FaceDetection(model_selection=0, min_detection_confidence=0.4)
    haar = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")

    total_students = 0
    total_processed = 0
    total_created = 0

    print(f"[INFO] Gallery: {gallery_dir}")
    print(f"[INFO] Base old students targeted: {sorted(DEFAULT_OLD_STUDENTS)}")

    for person_dir in sorted(gallery_dir.iterdir()):
        if not person_dir.is_dir():
            continue

        name = person_dir.name.strip().lower()
        if include:
            should_process = name in include
        else:
            should_process = name in DEFAULT_OLD_STUDENTS

        if name in exclude:
            should_process = False

        if not should_process:
            continue

        total_students += 1
        processed, created = process_student_folder(
            person_dir,
            detector=mp_detector,
            cascade=haar,
            out_size=args.out_size,
            augment_per_image=max(0, args.augment_per_image),
        )
        total_processed += processed
        total_created += created
        print(f"[DONE] {person_dir.name}: processed={processed}, new_images={created}")

    print("\n=== SUMMARY ===")
    print(f"Students processed: {total_students}")
    print(f"Original images processed: {total_processed}")
    print(f"New images created: {total_created}")
    print("Finished. Re-run backend process after this.")


if __name__ == "__main__":
    main()
