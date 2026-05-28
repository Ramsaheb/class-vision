"""
Class Vision — Synthetic Test Data Generator
Generates clean, synthetic, and anonymized classroom video and gallery images
for academic benchmarking, pipeline testing, and reviewer verification.
"""

import os
import cv2
import numpy as np

# Setup paths
BENCHMARK_DIR = os.path.dirname(os.path.abspath(__file__))
GALLERY_DIR = os.path.join(BENCHMARK_DIR, "synthetic_gallery")
VIDEO_PATH = os.path.join(BENCHMARK_DIR, "synthetic_video.mp4")

# Student Names
STUDENTS = ["Alice", "Bob", "Charlie"]

def draw_synthetic_face(img, center, scale=1.0, eye_open=True, head_pose="front", hand_raised=False):
    """Draws a recognizable geometric face for synthetic video creation."""
    cx, cy = center
    
    # 1. Draw head (circle)
    color = (220, 200, 180) # light skin tone
    cv2.circle(img, (cx, cy), int(50 * scale), color, -1)
    cv2.circle(img, (cx, cy), int(50 * scale), (50, 50, 50), 2) # border
    
    # 2. Draw Hair
    cv2.ellipse(img, (cx, cy - int(20 * scale)), (int(45 * scale), int(30 * scale)), 0, 180, 360, (60, 40, 20), -1)
    
    # 3. Eyes position depending on yaw
    eye_offset_x = int(18 * scale)
    eye_offset_y = int(10 * scale)
    
    if head_pose == "left":
        lex, rex = cx - int(28 * scale), cx - int(5 * scale)
    elif head_pose == "right":
        lex, rex = cx + int(5 * scale), cx + int(28 * scale)
    else: # front
        lex, rex = cx - eye_offset_x, cx + eye_offset_x
        
    ley = rey = cy - eye_offset_y
    
    # Draw eyes
    eye_color = (0, 0, 0)
    if eye_open:
        cv2.circle(img, (lex, ley), int(6 * scale), (255, 255, 255), -1)
        cv2.circle(img, (lex, ley), int(3 * scale), eye_color, -1)
        cv2.circle(img, (rex, rey), int(6 * scale), (255, 255, 255), -1)
        cv2.circle(img, (rex, rey), int(3 * scale), eye_color, -1)
    else:
        # Closed eyes (arcs/drowsy)
        cv2.ellipse(img, (lex, ley), (int(6 * scale), int(2 * scale)), 0, 0, 180, eye_color, 2)
        cv2.ellipse(img, (rex, rey), (int(6 * scale), int(2 * scale)), 0, 0, 180, eye_color, 2)
        
    # 4. Mouth (attentive=smile, sleeping/drowsy=flat, distracted=left/right)
    mouth_y = cy + int(15 * scale)
    if not eye_open:
        # Sleeping (small circle or line)
        cv2.circle(img, (cx, mouth_y), int(4 * scale), (0, 0, 255), -1)
    elif head_pose in ("left", "right"):
        cv2.line(img, (cx - int(5 * scale), mouth_y), (cx + int(5 * scale), mouth_y), (0, 0, 0), 2)
    else:
        # Smile!
        cv2.ellipse(img, (cx, mouth_y), (int(12 * scale), int(6 * scale)), 0, 0, 180, (0, 0, 255), 2)
        
    # 5. Hand raised indicator
    if hand_raised:
        hand_color = (150, 220, 150)
        hx, hy = cx + int(70 * scale), cy + int(20 * scale)
        cv2.rectangle(img, (hx - 10, hy - 40), (hx + 10, hy + 20), hand_color, -1)
        cv2.circle(img, (hx, hy - 40), 12, hand_color, -1)
        cv2.putText(img, "🖐️", (hx - 12, hy - 35), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 1)

def generate_gallery():
    """Generates synthetic portrait reference photos for each student."""
    print("🎨 Generating synthetic reference gallery...")
    os.makedirs(GALLERY_DIR, exist_ok=True)
    
    for name in STUDENTS:
        student_path = os.path.join(GALLERY_DIR, name)
        os.makedirs(student_path, exist_ok=True)
        
        # Create a clean white background square portrait
        img = np.ones((300, 300, 3), dtype=np.uint8) * 255
        
        # Add labels
        cv2.putText(img, f"REF: {name}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (50, 50, 50), 2)
        
        # Draw the student face in center
        draw_synthetic_face(img, (150, 160), scale=2.0)
        
        # Save portrait
        file_path = os.path.join(student_path, "photo.jpg")
        cv2.imwrite(file_path, img)
        print(f"  ✓ Saved portrait for {name} to {file_path}")

def generate_video():
    """Generates a 10-second synthetic classroom video simulating diverse attention states."""
    print("🎥 Generating synthetic classroom video...")
    
    # 1920x1080 resolution, 30 fps
    width, height = 1280, 720
    fps = 30
    duration_sec = 10
    total_frames = fps * duration_sec
    
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(VIDEO_PATH, fourcc, fps, (width, height))
    
    for frame_idx in range(total_frames):
        # Create dark classroom background with grid lines
        img = np.ones((height, width, 3), dtype=np.uint8) * 30
        
        # Draw desks/background lines
        cv2.line(img, (0, 450), (width, 450), (100, 100, 100), 2)
        cv2.putText(img, "SYNTHETIC CLASSROOM SIMULATION", (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (150, 150, 150), 2)
        
        # Time progression
        time_elapsed = frame_idx / fps
        cv2.putText(img, f"Time: {time_elapsed:.1f}s", (50, 100), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        
        # Alice states: Always attentive, looking straight, hand raise at 5-7s
        alice_center = (250, 300)
        alice_hand = 5.0 <= time_elapsed <= 7.0
        draw_synthetic_face(img, alice_center, scale=1.8, eye_open=True, head_pose="front", hand_raised=alice_hand)
        cv2.putText(img, "Alice", (alice_center[0] - 25, alice_center[1] + 120), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        
        # Bob states: Attentive for 3s, then drowsy/sleeping from 3-8s, then wakes up
        bob_center = (640, 300)
        bob_awake = not (3.0 <= time_elapsed <= 8.0)
        draw_synthetic_face(img, bob_center, scale=1.8, eye_open=bob_awake, head_pose="front")
        cv2.putText(img, "Bob", (bob_center[0] - 15, bob_center[1] + 120), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        
        # Charlie states: Attentive, but looking left (distracted) from 4s onwards
        charlie_center = (1030, 300)
        charlie_pose = "left" if time_elapsed >= 4.0 else "front"
        draw_synthetic_face(img, charlie_center, scale=1.8, eye_open=True, head_pose=charlie_pose)
        cv2.putText(img, "Charlie", (charlie_center[0] - 35, charlie_center[1] + 120), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        
        out.write(img)
        
    out.release()
    print(f"  ✓ Saved synthetic test video to {VIDEO_PATH}")

if __name__ == "__main__":
    print("🚀 Initializing synthetic benchmark dataset creation...")
    generate_gallery()
    generate_video()
    print("\n🎉 Synthetic benchmark materials successfully created!")
    print("📁 Gallery path: benchmark/synthetic_gallery/")
    print("🎬 Video path:   benchmark/synthetic_video.mp4")
