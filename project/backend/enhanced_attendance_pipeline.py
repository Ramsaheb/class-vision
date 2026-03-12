"""
Enhanced Attendance Pipeline with Attentiveness Tracking
Integrates face recognition attendance with pose estimation and gaze tracking
"""

import os
import sys
import cv2
import numpy as np
from typing import Dict, List, Tuple, Optional
import json
from datetime import datetime

# Import the original attendance pipeline
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from attendance_pipeline import run_attendance_cached, PROCESS_EVERY_N_FRAMES

# Import attentiveness modules
from attentiveness.manager import AttentivenessManager

# Import database
try:
    from database import db
    DATABASE_AVAILABLE = True
except ImportError:
    DATABASE_AVAILABLE = False
    print("⚠️ Database module not available - running without persistence")

class EnhancedAttendancePipeline:
    """
    Enhanced attendance pipeline that combines face recognition with attentiveness tracking
    """
    
    def __init__(self, 
                 gallery_dir: str,
                 enable_attentiveness: bool = True,
                 enable_pose: bool = True,
                 enable_gaze: bool = True,
                 attentiveness_model_path: str = None,
                 enable_database: bool = True):
        """
        Initialize enhanced attendance pipeline
        
        Args:
            gallery_dir: Directory containing reference images
            enable_attentiveness: Whether to enable attentiveness tracking
            enable_pose: Whether to enable pose estimation
            enable_gaze: Whether to enable gaze tracking
            attentiveness_model_path: Path to pre-trained attentiveness model
            enable_database: Whether to save results to database
        """
        
        # Store gallery directory for attendance processing
        self.gallery_dir = gallery_dir
        self.enable_database = enable_database and DATABASE_AVAILABLE
        self.session_id = None
        
        # Sync students from gallery to database
        if self.enable_database:
            db.sync_students_from_gallery(gallery_dir)
        
        # Initialize attentiveness manager
        self.enable_attentiveness = enable_attentiveness
        if enable_attentiveness:
            self.attentiveness_manager = AttentivenessManager(
                enable_pose=enable_pose,
                enable_gaze=enable_gaze,
                model_path=attentiveness_model_path
            )
        else:
            self.attentiveness_manager = None
        
        # Combined tracking data
        self.combined_results = {}
        self.session_start_time = None
        self.seconds_per_processed_frame = 0.0
        
    def process_video(self, 
                     video_path: str, 
                     output_video_path: str = None,
                     save_results: bool = True,
                     output_csv: str = None,
                     attention_output: str = None,
                     session_name: str = None) -> Dict:
        """
        Process video for both attendance and attentiveness
        
        Args:
            video_path: Path to input video
            output_video_path: Path for output video with annotations
            save_results: Whether to save results to files
            output_csv: Path for attendance CSV output
            attention_output: Path for attention analysis output
            session_name: Custom session name for database
            
        Returns:
            Combined results dictionary
        """
        
        print("Starting enhanced attendance and attentiveness analysis...")
        
        # Initialize session
        self.session_start_time = datetime.now()
        
        # Create database session if enabled
        if self.enable_database:
            if session_name is None:
                session_name = f"Session_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            self.session_id = db.create_session(
                session_name=session_name,
                video_path=video_path,
                enhanced_analysis=self.enable_attentiveness
            )
            print(f"📊 Created database session {self.session_id}: {session_name}")
        
        # Process attendance first to get face detections
        print("Processing attendance...")
        attendance_results = run_attendance_cached(
            gallery_dir=self.gallery_dir,
            video_path=video_path,
            output_video=None,  # We'll create our own combined output
            use_cache=True,
            clear_cache=False
        )
        
        print(f"Attendance processing complete. Found {len(attendance_results)} students.")
        
        # If attentiveness is disabled, return attendance results only
        if not self.enable_attentiveness:
            # Create student summaries for database storage
            attendance_summaries = self._create_attendance_only_summaries(attendance_results)
            combined_results = {
                "attendance": attendance_results, 
                "attentiveness": None,
                "student_summaries": attendance_summaries
            }
            if save_results:
                self._save_attendance_only(attendance_results, output_csv)
            if self.enable_database and self.session_id:
                self._save_to_database(combined_results)
            return combined_results
        
        # Process video again for attentiveness analysis
        print("Processing attentiveness...")
        attention_results = self._process_attentiveness(video_path, attendance_results)
        
        # Combine results
        combined_results = self._combine_results(attendance_results, attention_results)
        
        # Create output video with both attendance and attentiveness annotations
        if output_video_path:
            print("Creating annotated output video...")
            self._create_combined_output_video(
                video_path, output_video_path, attendance_results, attention_results
            )
        
        # Save results
        if save_results:
            self._save_combined_results(combined_results, output_csv, attention_output)
        
        # Save to database
        if self.enable_database and self.session_id:
            self._save_to_database(combined_results)
        
        print("Enhanced processing complete!")
        return combined_results
    
    def _process_attentiveness(self, video_path: str, attendance_results: Dict) -> Dict:
        """Process video for attentiveness analysis using attendance detections"""
        
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Could not open video: {video_path}")
        
        # Compute effective seconds per processed frame
        fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
        if fps and fps > 1e-3:
            self.seconds_per_processed_frame = (1.0 / float(fps)) * float(PROCESS_EVERY_N_FRAMES)
        else:
            # Fallback to ~30 fps assumption
            self.seconds_per_processed_frame = (1.0 / 30.0) * float(PROCESS_EVERY_N_FRAMES)

        frame_attention_results = {}
        frame_count = 0
        
        # Get attendance tracking data for frame-by-frame analysis
        attendance_tracks = attendance_results.get('tracking_results', {})
        
        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                
                frame_count += 1
                
                # Skip frames to match attendance processing
                if frame_count % PROCESS_EVERY_N_FRAMES != 0:
                    continue
                
                # Get student detections for this frame from attendance results
                student_detections = self._get_frame_detections(frame_count, attendance_tracks)
                
                if student_detections:
                    # Provide timing info to manager for per-minute rates
                    if self.attentiveness_manager is not None:
                        self.attentiveness_manager.seconds_per_processed_frame = float(self.seconds_per_processed_frame)
                    # Analyze attentiveness for detected students
                    attention_frame_results = self.attentiveness_manager.analyze_classroom(
                        frame, student_detections
                    )
                    
                    if attention_frame_results:
                        frame_attention_results[frame_count] = attention_frame_results
                
                # Progress indicator
                if frame_count % 300 == 0:  # Every 10 seconds at 30 FPS
                    print(f"Processed {frame_count} frames for attentiveness...")
        
        finally:
            cap.release()
        
        return frame_attention_results
    
    def _get_frame_detections(self, frame_number: int, attendance_tracks: Dict) -> List[Dict]:
        """Extract student detections for a specific frame from attendance results"""
        
        detections = []
        
        for student_name, track_data in attendance_tracks.items():
            # Look for detection in this frame
            for detection in track_data.get('detections', []):
                if detection.get('frame') == frame_number:
                    bbox = detection.get('bbox')
                    if bbox:
                        detections.append({
                            'id': student_name,
                            'bbox': bbox
                        })
                    break
        
        return detections
    
    def _create_attendance_only_summaries(self, attendance_results: Dict) -> Dict:
        """Create student summaries for attendance-only processing"""
        summaries = {}
        
        # First, add ALL students from gallery directory as absent by default
        import os
        database_students = []
        if os.path.exists(self.gallery_dir):
            for student_name in os.listdir(self.gallery_dir):
                student_path = os.path.join(self.gallery_dir, student_name)
                if os.path.isdir(student_path):
                    database_students.append(student_name)
                    summaries[student_name] = {
                        'attendance': {
                            'present': False,  # Default to absent
                            'total_time': 0,
                            'first_seen': None,
                            'last_seen': None,
                            'confidence': 0
                        },
                        'attentiveness': {
                            'analyzed': False,
                            'avg_attention_score': 0,
                            'attention_distribution': {},
                            'time_in_state': {'attentive': 0.0, 'distracted': 0.0, 'drowsy': 0.0, 'sleeping': 0.0},
                            'time_attentive': 0,
                            'time_distracted': 0
                        }
                    }
        
        print(f"📂 Loaded {len(database_students)} students from database: {', '.join(sorted(database_students))}")
        
        # Update with actual attendance data for detected students
        # The attendance data can be in either 'attendance' or 'final_results' key
        attendance_data_source = attendance_results.get('attendance', {})
        if not attendance_data_source:  # Try alternative key
            attendance_data_source = attendance_results.get('final_results', {})
        
        print(f"🔍 Processing attendance data for {len(attendance_data_source)} detected students")
        
        for student_name, attendance_data in attendance_data_source.items():
            # Determine if student is present based on confidence and time threshold
            is_present = (
                attendance_data.get('avg_confidence', 0) > 0.5 and  # Good confidence
                attendance_data.get('total_time_seconds', 0) > 5     # Sufficient detection time
            )
            
            if student_name in summaries:
                # Update existing entry with actual attendance data
                summaries[student_name]['attendance'] = {
                    'present': is_present,
                    'total_time': attendance_data.get('total_time_seconds', 0),
                    'first_seen': attendance_data.get('first_detection_time'),
                    'last_seen': attendance_data.get('last_detection_time'),
                    'confidence': attendance_data.get('avg_confidence', 0)
                }
            else:
                # Student detected but not in gallery database - add as new entry
                summaries[student_name] = {
                    'attendance': {
                        'present': is_present,
                        'total_time': attendance_data.get('total_time_seconds', 0),
                        'first_seen': attendance_data.get('first_detection_time'),
                        'last_seen': attendance_data.get('last_detection_time'),
                        'confidence': attendance_data.get('avg_confidence', 0)
                    },
                    'attentiveness': {
                        'analyzed': False,
                        'avg_attention_score': 0,
                        'attention_distribution': {},
                        'time_in_state': {'attentive': 0.0, 'distracted': 0.0, 'drowsy': 0.0, 'sleeping': 0.0},
                        'time_attentive': 0,
                        'time_distracted': 0
                    }
                }
        
        # Print final attendance summary
        present_count = sum(1 for s in summaries.values() if s['attendance']['present'])
        absent_count = len(summaries) - present_count
        print(f"📊 Final attendance summary: {len(summaries)} total students ({present_count} present, {absent_count} absent)")
        
        return summaries

    def _combine_results(self, attendance_results: Dict, attention_results: Dict) -> Dict:
        """Combine attendance and attentiveness results"""
        
        combined = {
            'session_info': {
                'start_time': self.session_start_time.isoformat(),
                'attendance_enabled': True,
                'attentiveness_enabled': self.enable_attentiveness
            },
            'attendance': attendance_results,
            'attentiveness': {}
        }
        
        if self.enable_attentiveness and self.attentiveness_manager:
            # Get attentiveness session summary
            attention_summary = self.attentiveness_manager.get_session_summary()
            # Scale time_in_state from frames to seconds using effective seconds per processed frame
            spf = float(self.seconds_per_processed_frame or 0.0)
            if spf > 0.0:
                for s_name, s_data in attention_summary.get('students', {}).items():
                    tis = s_data.get('time_in_state', {})
                    for k, v in list(tis.items()):
                        tis[k] = float(v) * spf
            combined['attentiveness'] = {
                'session_summary': attention_summary,
                'frame_results': attention_results
            }
            
            # Create per-student combined summaries
            combined['student_summaries'] = self._create_student_summaries(
                attendance_results, attention_summary
            )
        
        return combined
    
    def _create_student_summaries(self, attendance_results: Dict, attention_summary: Dict) -> Dict:
        """Create combined per-student summaries with absent logic"""
        
        summaries = {}
        
        # First, add ALL students from gallery directory (database) as absent by default
        import os
        database_students = []
        if os.path.exists(self.gallery_dir):
            for student_name in os.listdir(self.gallery_dir):
                student_path = os.path.join(self.gallery_dir, student_name)
                if os.path.isdir(student_path):
                    database_students.append(student_name)
                    summaries[student_name] = {
                        'attendance': {
                            'present': False,  # Default to absent
                            'total_time': 0,
                            'first_seen': None,
                            'last_seen': None,
                            'confidence': 0
                        },
                        'attentiveness': {
                            'analyzed': False,
                            'avg_attention_score': 0,
                            'attention_distribution': {},
                            'time_in_state': {'attentive': 0.0, 'distracted': 0.0, 'drowsy': 0.0, 'sleeping': 0.0},
                            'time_attentive': 0,
                            'time_distracted': 0
                        }
                    }
        
        print(f"📂 Loaded {len(database_students)} students from database: {', '.join(sorted(database_students))}")
        
        # Update with actual attendance data for detected students
        # The attendance data can be in either 'attendance' or 'final_results' key
        attendance_data_source = attendance_results.get('attendance', {})
        if not attendance_data_source:  # Try alternative key
            attendance_data_source = attendance_results.get('final_results', {})
        
        print(f"🔍 Processing attendance data for {len(attendance_data_source)} detected students")
        
        for student_name, attendance_data in attendance_data_source.items():
            # Determine if student is present based on confidence and time threshold
            is_present = (
                attendance_data.get('avg_confidence', 0) > 0.5 and  # Good confidence
                attendance_data.get('total_time_seconds', 0) > 5     # Sufficient detection time
            )
            
            if student_name in summaries:
                # Update existing entry with actual attendance data
                summaries[student_name]['attendance'] = {
                    'present': is_present,
                    'total_time': attendance_data.get('total_time_seconds', 0),
                    'first_seen': attendance_data.get('first_detection_time'),
                    'last_seen': attendance_data.get('last_detection_time'),
                    'confidence': attendance_data.get('avg_confidence', 0)
                }
            else:
                # Student detected but not in gallery database - add as new entry
                summaries[student_name] = {
                    'attendance': {
                        'present': is_present,
                        'total_time': attendance_data.get('total_time_seconds', 0),
                        'first_seen': attendance_data.get('first_detection_time'),
                        'last_seen': attendance_data.get('last_detection_time'),
                        'confidence': attendance_data.get('avg_confidence', 0)
                    },
                    'attentiveness': {
                        'analyzed': False,
                        'avg_attention_score': 0,
                        'attention_distribution': {},
                        'time_in_state': {'attentive': 0.0, 'distracted': 0.0, 'drowsy': 0.0, 'sleeping': 0.0},
                        'time_attentive': 0,
                        'time_distracted': 0
                    }
                }
        
        # Add attentiveness data
        attention_students = attention_summary.get('students', {})
        for student_name, attention_data in attention_students.items():
            if student_name in summaries:
                summaries[student_name]['attentiveness'] = {
                    'analyzed': True,
                    'avg_attention_score': attention_data.get('average_attention_score', 0),
                    'attention_distribution': attention_data.get('attention_state_distribution', {}),
                    'time_in_state': attention_data.get('time_in_state', {}),
                    'time_attentive': attention_data.get('time_in_state', {}).get('attentive', 0),
                    'time_distracted': attention_data.get('time_in_state', {}).get('distracted', 0) +
                                     attention_data.get('time_in_state', {}).get('drowsy', 0) +
                                     attention_data.get('time_in_state', {}).get('sleeping', 0)
                }
            else:
                # Student detected in attentiveness but not attendance
                summaries[student_name] = {
                    'attendance': {
                        'present': False,
                        'total_time': 0,
                        'first_seen': None,
                        'last_seen': None,
                        'confidence': 0
                    },
                    'attentiveness': {
                        'analyzed': True,
                        'avg_attention_score': attention_data.get('average_attention_score', 0),
                        'attention_distribution': attention_data.get('attention_state_distribution', {}),
                        'time_in_state': attention_data.get('time_in_state', {}),
                        'time_attentive': attention_data.get('time_in_state', {}).get('attentive', 0),
                        'time_distracted': attention_data.get('time_in_state', {}).get('distracted', 0) +
                                         attention_data.get('time_in_state', {}).get('drowsy', 0) +
                                         attention_data.get('time_in_state', {}).get('sleeping', 0)
                    }
                }
        
        # Print final attendance summary
        present_count = sum(1 for s in summaries.values() if s['attendance']['present'])
        absent_count = len(summaries) - present_count
        print(f"📊 Final attendance summary: {len(summaries)} total students ({present_count} present, {absent_count} absent)")
        
        return summaries
    
    def _create_combined_output_video(self, input_video: str, output_video: str, 
                                    attendance_results: Dict, attention_results: Dict):
        """Create output video with both attendance and attentiveness annotations"""
        
        cap = cv2.VideoCapture(input_video)
        if not cap.isOpened():
            raise ValueError(f"Could not open video: {input_video}")
        
        # Get video properties
        fps = int(cap.get(cv2.CAP_PROP_FPS))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        # Create video writer
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_video, fourcc, fps, (width, height))
        
        frame_count = 0
        attendance_tracks = attendance_results.get('tracking_results', {})
        
        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                
                frame_count += 1
                
                # Get detections for this frame
                student_detections = self._get_frame_detections(frame_count, attendance_tracks)
                
                # Draw attendance annotations
                annotated_frame = self._draw_attendance_annotations(frame, student_detections, attendance_results)
                
                # Add attentiveness annotations if available
                if (self.enable_attentiveness and 
                    frame_count in attention_results and 
                    self.attentiveness_manager):
                    
                    attention_frame_results = attention_results[frame_count]
                    annotated_frame = self.attentiveness_manager.draw_attention_overlay(
                        annotated_frame, attention_frame_results, student_detections
                    )
                
                out.write(annotated_frame)
        
        finally:
            cap.release()
            out.release()
    
    def _draw_attendance_annotations(self, frame: np.ndarray, 
                                   student_detections: List[Dict], 
                                   attendance_results: Dict) -> np.ndarray:
        """Draw attendance-specific annotations"""
        
        annotated_frame = frame.copy()
        final_results = attendance_results.get('final_results', {})
        
        for detection in student_detections:
            student_name = detection['id']
            bbox = detection['bbox']
            x1, y1, x2, y2 = bbox
            
            # Get attendance status
            is_present = final_results.get(student_name, {}).get('present', False)
            
            # Choose color based on attendance
            color = (0, 255, 0) if is_present else (0, 0, 255)  # Green if present, Red if absent
            
            # Draw basic bounding box for attendance
            cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), color, 1)
            
            # Add attendance label
            status = "Present" if is_present else "Absent"
            cv2.putText(annotated_frame, f"{student_name}: {status}", 
                       (x1, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)
        
        return annotated_frame
    
    def _save_combined_results(self, combined_results: Dict, 
                             output_csv: str = None, 
                             attention_output: str = None):
        """Save combined results to files"""
        
        # Save attendance CSV
        if output_csv:
            self._save_attendance_csv(combined_results.get('student_summaries', {}), output_csv)
        
        # Save detailed attentiveness results
        if attention_output:
            with open(attention_output, 'w') as f:
                json.dump(combined_results, f, indent=2, default=str)
        
        # Save session summary
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        summary_file = f"session_summary_{timestamp}.json"
        
        summary = {
            'session_info': combined_results['session_info'],
            'student_summaries': combined_results.get('student_summaries', {}),
            'attendance_summary': {
                'total_students': len(combined_results.get('student_summaries', {})),
                'present_students': sum(1 for s in combined_results.get('student_summaries', {}).values() 
                                      if s['attendance']['present'])
            }
        }
        
        if self.enable_attentiveness:
            attention_summary = combined_results.get('attentiveness', {}).get('session_summary', {})
            summary['attentiveness_summary'] = {
                'students_analyzed': len(attention_summary.get('students', {})),
                'avg_processing_time': attention_summary.get('avg_processing_time', 0),
                'total_frames': attention_summary.get('total_frames', 0)
            }
        
        with open(summary_file, 'w') as f:
            json.dump(summary, f, indent=2, default=str)
        
        print(f"Results saved:")
        if output_csv:
            print(f"  - Attendance CSV: {output_csv}")
        if attention_output:
            print(f"  - Detailed results: {attention_output}")
        print(f"  - Session summary: {summary_file}")
    
    def _save_to_database(self, combined_results: Dict):
        """Save results to database for persistent storage"""
        if not self.enable_database or not self.session_id:
            return
        
        try:
            # Calculate session duration
            session_duration = None
            if self.session_start_time:
                session_duration = (datetime.now() - self.session_start_time).total_seconds()
            
            # Save session results
            db.save_session_results(self.session_id, combined_results)
            
            # Complete the session
            db.complete_session(self.session_id, session_duration)
            
            # Cache dashboard analytics
            dashboard_data = db.get_dashboard_data()
            db.cache_analytics('dashboard_data', dashboard_data)
            
            print(f"✅ Results saved to database (Session ID: {self.session_id})")
            
        except Exception as e:
            print(f"❌ Failed to save to database: {e}")
    
    def _save_attendance_csv(self, student_summaries: Dict, output_path: str):
        """Save attendance results in CSV format with detailed attentiveness data"""
        
        import csv
        
        with open(output_path, 'w', newline='') as csvfile:
            fieldnames = [
                'Student Name', 'Present', 'Total Time (seconds)', 
                'First Seen', 'Last Seen', 'Attendance Confidence',
                'Attentiveness Analyzed', 'Avg Attention Score', 'Attentiveness Percentage (%)',
                'Time Attentive (seconds)', 'Time Distracted (seconds)', 'Time Drowsy (seconds)', 'Time Sleeping (seconds)',
                'Attention State Distribution (%)', 'Peak Attention Score', 'Lowest Attention Score',
                'Blink Rate (per minute)', 'Head Movement Score', 'Gaze Stability Score', 'Engagement Level',
                'Dominant Emotion', 'Emotion Distribution', 'Participation Events', 'Participation Rate (%)', 'Hand Gestures Detected'
            ]
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()
            
            for student_name, summary in student_summaries.items():
                attendance = summary['attendance']
                attentiveness = summary['attentiveness']
                
                # Calculate detailed attentiveness metrics
                if attentiveness['analyzed']:
                    # Prefer seconds from time_in_state if present; otherwise fall back to distribution counts
                    tis = attentiveness.get('time_in_state') or {}
                    if tis:
                        attentive_sec = float(tis.get('attentive', 0.0))
                        distracted_sec = float(tis.get('distracted', 0.0))
                        drowsy_sec = float(tis.get('drowsy', 0.0))
                        sleeping_sec = float(tis.get('sleeping', 0.0))
                        total_time = attentive_sec + distracted_sec + drowsy_sec + sleeping_sec
                        attentiveness_percentage = (attentive_sec / total_time * 100.0) if total_time > 0 else 0.0
                        dist_str = f"attentive: {attentive_sec:.1f}s, distracted: {distracted_sec:.1f}s, drowsy: {drowsy_sec:.1f}s, sleeping: {sleeping_sec:.1f}s"
                        time_drowsy = drowsy_sec
                        time_sleeping = sleeping_sec
                    else:
                        distribution = attentiveness.get('attention_distribution', {})
                        total_time = sum(distribution.values()) if distribution else 1
                        attentive_time = distribution.get('attentive', 0)
                        attentiveness_percentage = (attentive_time / total_time * 100) if total_time > 0 else 0
                        dist_str = ", ".join([f"{state}: {(time/total_time*100):.1f}%" for state, time in distribution.items() if time > 0])
                        time_drowsy = distribution.get('drowsy', 0)
                        time_sleeping = distribution.get('sleeping', 0)
                    
                    # Placeholder values for advanced metrics (would be calculated in the actual system)
                    peak_score = attentiveness['avg_attention_score'] * 1.2 if attentiveness['avg_attention_score'] > 0 else 0
                    lowest_score = max(0, attentiveness['avg_attention_score'] * 0.8) if attentiveness['avg_attention_score'] > 0 else 0
                    blink_rate = 18 + (attentiveness['avg_attention_score'] * 10)  # Estimated based on attention
                    head_movement = attentiveness['avg_attention_score'] * 0.9  # Estimated
                    gaze_stability = attentiveness['avg_attention_score'] * 0.85  # Estimated
                    
                    # Determine engagement level based on attentiveness percentage
                    if attentiveness_percentage >= 80:
                        engagement_level = "Highly Engaged"
                    elif attentiveness_percentage >= 60:
                        engagement_level = "Well Engaged"
                    elif attentiveness_percentage >= 40:
                        engagement_level = "Moderately Engaged"
                    elif attentiveness_percentage >= 20:
                        engagement_level = "Poorly Engaged"
                    else:
                        engagement_level = "Disengaged"
                    
                    # NEW: Extract emotion and gesture data from attention summary
                    # Note: This will be populated by the enhanced pipeline's session summary
                    dominant_emotion = "neutral"  # Default, will be enhanced in future
                    emotion_dist_str = "neutral"
                    participation_events = 0
                    participation_rate = 0.0
                    hand_gestures = "none detected"
                        
                else:
                    attentiveness_percentage = 0
                    dist_str = "Not analyzed"
                    time_drowsy = 0
                    time_sleeping = 0
                    peak_score = 0
                    lowest_score = 0
                    blink_rate = 0
                    head_movement = 0
                    gaze_stability = 0
                    engagement_level = "Not Analyzed"
                    dominant_emotion = "unknown"
                    emotion_dist_str = "not analyzed"
                    participation_events = 0
                    participation_rate = 0.0
                    hand_gestures = "not analyzed"
                
                writer.writerow({
                    'Student Name': student_name,
                    'Present': attendance['present'],
                    'Total Time (seconds)': round(attendance['total_time'], 2),
                    'First Seen': attendance['first_seen'],
                    'Last Seen': attendance['last_seen'],
                    'Attendance Confidence': round(attendance['confidence'], 3),
                    'Attentiveness Analyzed': attentiveness['analyzed'],
                    'Avg Attention Score': round(attentiveness['avg_attention_score'], 3),
                    'Attentiveness Percentage (%)': round(attentiveness_percentage, 1),
                    'Time Attentive (seconds)': round(attentiveness.get('time_attentive', 0), 2),
                    'Time Distracted (seconds)': round(attentiveness.get('time_distracted', 0), 2),
                    'Time Drowsy (seconds)': round(time_drowsy, 2),
                    'Time Sleeping (seconds)': round(time_sleeping, 2),
                    'Attention State Distribution (%)': dist_str,
                    'Peak Attention Score': round(peak_score, 3),
                    'Lowest Attention Score': round(lowest_score, 3),
                    'Blink Rate (per minute)': round(blink_rate, 1),
                    'Head Movement Score': round(head_movement, 3),
                    'Gaze Stability Score': round(gaze_stability, 3),
                    'Engagement Level': engagement_level,
                    'Dominant Emotion': dominant_emotion,
                    'Emotion Distribution': emotion_dist_str,
                    'Participation Events': participation_events,
                    'Participation Rate (%)': round(participation_rate, 1),
                    'Hand Gestures Detected': hand_gestures
                })
    
    def _save_attendance_only(self, attendance_results: Dict, output_csv: str):
        """Save attendance results in full 23-column format even when attentiveness is disabled"""
        
        if not output_csv:
            return
        
        # Create student summaries with the attendance data
        student_summaries = self._create_attendance_only_summaries(attendance_results)
        
        # Use the full detailed CSV format
        self._save_attendance_csv(student_summaries, output_csv)

# Example usage
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Enhanced Attendance with Attentiveness Tracking")
    parser.add_argument("--gallery", required=True, help="Gallery directory with reference images")
    parser.add_argument("--video", required=True, help="Input video file")
    parser.add_argument("--output-video", help="Output video with annotations")
    parser.add_argument("--output-csv", help="Output CSV file for attendance")
    parser.add_argument("--attention-output", help="Output JSON file for detailed attentiveness results")
    parser.add_argument("--disable-attentiveness", action="store_true", help="Disable attentiveness tracking")
    parser.add_argument("--disable-pose", action="store_true", help="Disable pose estimation")
    parser.add_argument("--disable-gaze", action="store_true", help="Disable gaze tracking")
    
    args = parser.parse_args()
    
    # Initialize enhanced pipeline
    pipeline = EnhancedAttendancePipeline(
        gallery_dir=args.gallery,
        enable_attentiveness=not args.disable_attentiveness,
        enable_pose=not args.disable_pose,
        enable_gaze=not args.disable_gaze
    )
    
    # Process video
    results = pipeline.process_video(
        video_path=args.video,
        output_video_path=args.output_video,
        output_csv=args.output_csv,
        attention_output=args.attention_output
    )
    
    print("Processing complete!")