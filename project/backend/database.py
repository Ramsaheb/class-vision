"""
Database module for CORIS Attendance System
Provides persistent storage for sessions, students, and analytics
"""

import sqlite3
import json
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import pandas as pd
from pathlib import Path

# Compute a stable absolute path for the database file
_DB_DIR = os.path.dirname(os.path.abspath(__file__))  # backend/
DEFAULT_DB_PATH = os.path.join(_DB_DIR, "attendance_system.db")

class AttendanceDatabase:
    """SQLite database for attendance and attentiveness data"""
    
    def __init__(self, db_path: str = DEFAULT_DB_PATH):
        """Initialize database connection and create tables"""
        self.db_path = db_path
        self.init_database()
    
    def init_database(self):
        """Create database tables if they don't exist"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Students table - master list of all students
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS students (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    gallery_path TEXT,
                    email TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_seen TIMESTAMP,
                    total_sessions INTEGER DEFAULT 0,
                    total_present INTEGER DEFAULT 0
                )
            """)

            # Add email column if it doesn't exist (migration for existing DBs)
            try:
                cursor.execute("ALTER TABLE students ADD COLUMN email TEXT")
            except sqlite3.OperationalError:
                pass  # Column already exists
            
            # Sessions table - each video analysis session
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_name TEXT,
                    video_path TEXT,
                    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    end_time TIMESTAMP,
                    duration_seconds REAL,
                    total_students INTEGER DEFAULT 0,
                    present_students INTEGER DEFAULT 0,
                    absent_students INTEGER DEFAULT 0,
                    enhanced_analysis BOOLEAN DEFAULT FALSE,
                    status TEXT DEFAULT 'running' -- running, completed, failed
                )
            """)
            
            # Attendance records - individual student attendance per session
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS attendance_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER,
                    student_name TEXT,
                    present BOOLEAN,
                    total_time_seconds REAL DEFAULT 0,
                    first_seen TEXT,
                    last_seen TEXT,
                    attendance_confidence REAL DEFAULT 0,
                    
                    -- Attentiveness data
                    attentiveness_analyzed BOOLEAN DEFAULT FALSE,
                    avg_attention_score REAL DEFAULT 0,
                    attentiveness_percentage REAL DEFAULT 0,
                    time_attentive_seconds REAL DEFAULT 0,
                    time_distracted_seconds REAL DEFAULT 0,
                    time_drowsy_seconds REAL DEFAULT 0,
                    time_sleeping_seconds REAL DEFAULT 0,
                    attention_distribution TEXT, -- JSON
                    peak_attention_score REAL DEFAULT 0,
                    lowest_attention_score REAL DEFAULT 0,
                    blink_rate REAL DEFAULT 0,
                    head_movement_score REAL DEFAULT 0,
                    gaze_stability_score REAL DEFAULT 0,
                    engagement_level TEXT,
                    
                    -- Enhanced features
                    dominant_emotion TEXT,
                    emotion_distribution TEXT, -- JSON
                    participation_events INTEGER DEFAULT 0,
                    participation_rate REAL DEFAULT 0,
                    hand_gestures_detected TEXT,
                    
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (session_id) REFERENCES sessions (id)
                )
            """)
            
            # Analytics cache table - for dashboard metrics
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS analytics_cache (
                    key TEXT PRIMARY KEY,
                    value TEXT, -- JSON data
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            conn.commit()
            print("[OK] Database initialized successfully")
    
    def generate_student_email(self, name: str) -> str:
        """Generate default college email for a student"""
        return f"122{name.lower()}2025@sjcem.edu.in"

    def add_student(self, name: str, gallery_path: str = None) -> int:
        """Add a new student to the database"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            email = self.generate_student_email(name)
            try:
                cursor.execute("""
                    INSERT INTO students (name, gallery_path, email) 
                    VALUES (?, ?, ?)
                """, (name, gallery_path, email))
                conn.commit()
                return cursor.lastrowid
            except sqlite3.IntegrityError:
                # Student already exists, update gallery_path if provided
                if gallery_path:
                    cursor.execute("""
                        UPDATE students SET gallery_path = ? WHERE name = ?
                    """, (gallery_path, name))
                    conn.commit()
                # Set email if missing
                cursor.execute("UPDATE students SET email = ? WHERE name = ? AND (email IS NULL OR email = '')", (email, name))
                conn.commit()
                # Return existing student ID
                cursor.execute("SELECT id FROM students WHERE name = ?", (name,))
                return cursor.fetchone()[0]
    
    def sync_students_from_gallery(self, gallery_dir: str):
        """Sync students from gallery directory to database"""
        if not os.path.exists(gallery_dir):
            return
        
        students_added = 0
        for item in os.listdir(gallery_dir):
            item_path = os.path.join(gallery_dir, item)
            if os.path.isdir(item_path):
                student_id = self.add_student(item, item_path)
                if student_id:
                    students_added += 1
        
        print(f"✅ Synced {students_added} students from gallery")
        return students_added
    
    def create_session(self, session_name: str = None, video_path: str = None, 
                      enhanced_analysis: bool = False) -> int:
        """Create a new session and return session ID"""
        if session_name is None:
            session_name = f"Session_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO sessions (session_name, video_path, enhanced_analysis)
                VALUES (?, ?, ?)
            """, (session_name, video_path, enhanced_analysis))
            conn.commit()
            session_id = cursor.lastrowid
            print(f"✅ Created session {session_id}: {session_name}")
            return session_id
    
    def complete_session(self, session_id: int, duration_seconds: float = None):
        """Mark session as completed"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Count attendance statistics
            cursor.execute("""
                SELECT COUNT(*) as total, 
                       SUM(CASE WHEN present = 1 THEN 1 ELSE 0 END) as present
                FROM attendance_records WHERE session_id = ?
            """, (session_id,))
            
            total, present = cursor.fetchone()
            absent = total - (present or 0)
            
            cursor.execute("""
                UPDATE sessions 
                SET end_time = CURRENT_TIMESTAMP, 
                    duration_seconds = ?,
                    status = 'completed',
                    total_students = ?,
                    present_students = ?,
                    absent_students = ?
                WHERE id = ?
            """, (duration_seconds, total, present or 0, absent, session_id))
            conn.commit()
            
            print(f"✅ Completed session {session_id}: {total} students ({present or 0} present, {absent} absent)")
    
    def save_attendance_record(self, session_id: int, student_data: Dict[str, Any]):
        """Save individual student attendance record"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            attendance = student_data.get('attendance', {})
            attentiveness = student_data.get('attentiveness', {})
            
            # Convert JSON fields
            attention_dist = json.dumps(attentiveness.get('attention_distribution', {}))
            emotion_dist = json.dumps(attentiveness.get('emotion_distribution', {}))
            
            cursor.execute("""
                INSERT INTO attendance_records (
                    session_id, student_name, present, total_time_seconds,
                    first_seen, last_seen, attendance_confidence,
                    attentiveness_analyzed, avg_attention_score, attentiveness_percentage,
                    time_attentive_seconds, time_distracted_seconds, time_drowsy_seconds, time_sleeping_seconds,
                    attention_distribution, peak_attention_score, lowest_attention_score,
                    blink_rate, head_movement_score, gaze_stability_score, engagement_level,
                    dominant_emotion, emotion_distribution, participation_events, participation_rate, hand_gestures_detected
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                session_id,
                student_data.get('name', ''),
                attendance.get('present', False),
                attendance.get('total_time', 0),
                attendance.get('first_seen'),
                attendance.get('last_seen'),
                attendance.get('confidence', 0),
                attentiveness.get('analyzed', False),
                attentiveness.get('avg_attention_score', 0),
                attentiveness.get('attentiveness_percentage', 0),
                attentiveness.get('time_attentive', 0),
                attentiveness.get('time_distracted', 0),
                attentiveness.get('time_drowsy', 0),
                attentiveness.get('time_sleeping', 0),
                attention_dist,
                attentiveness.get('peak_attention_score', 0),
                attentiveness.get('lowest_attention_score', 0),
                attentiveness.get('blink_rate', 0),
                attentiveness.get('head_movement_score', 0),
                attentiveness.get('gaze_stability_score', 0),
                attentiveness.get('engagement_level', 'Not Analyzed'),
                attentiveness.get('dominant_emotion', 'unknown'),
                emotion_dist,
                attentiveness.get('participation_events', 0),
                attentiveness.get('participation_rate', 0),
                attentiveness.get('hand_gestures_detected', 'none')
            ))
            conn.commit()
    
    def save_session_results(self, session_id: int, results: Dict[str, Any]):
        """Save complete session results to database"""
        student_summaries = results.get('student_summaries', {})
        
        for student_name, student_data in student_summaries.items():
            # Add student name to data
            student_data['name'] = student_name
            self.save_attendance_record(session_id, student_data)
        
        # Update student statistics
        self.update_student_stats()
        
        print(f"✅ Saved {len(student_summaries)} attendance records for session {session_id}")
    
    def update_student_stats(self):
        """Update student total sessions and attendance statistics"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE students 
                SET total_sessions = (
                    SELECT COUNT(DISTINCT session_id) 
                    FROM attendance_records 
                    WHERE student_name = students.name
                ),
                total_present = (
                    SELECT COUNT(*) 
                    FROM attendance_records 
                    WHERE student_name = students.name AND present = 1
                ),
                last_seen = (
                    SELECT MAX(created_at)
                    FROM attendance_records 
                    WHERE student_name = students.name AND present = 1
                )
            """)
            conn.commit()
    
    def get_dashboard_data(self) -> Dict[str, Any]:
        """Get comprehensive dashboard data"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Overall statistics
            cursor.execute("""
                SELECT 
                    COUNT(DISTINCT s.id) as total_sessions,
                    COUNT(DISTINCT st.name) as total_students,
                    AVG(CASE WHEN ar.present = 1 THEN ar.attentiveness_percentage ELSE NULL END) as avg_attention,
                    COUNT(CASE WHEN ar.present = 1 THEN 1 END) as total_present,
                    COUNT(CASE WHEN ar.present = 0 THEN 1 END) as total_absent
                FROM sessions s
                LEFT JOIN attendance_records ar ON s.id = ar.session_id
                LEFT JOIN students st ON ar.student_name = st.name
                WHERE s.status = 'completed'
            """)
            
            stats = cursor.fetchone()
            
            # Recent sessions
            cursor.execute("""
                SELECT id, session_name, start_time, present_students, total_students,
                       (present_students * 100.0 / NULLIF(total_students, 0)) as attendance_rate
                FROM sessions 
                WHERE status = 'completed'
                ORDER BY start_time DESC 
                LIMIT 10
            """)
            
            recent_sessions = [
                {
                    'id': row[0],
                    'name': row[1],
                    'start_time': row[2],
                    'present': row[3],
                    'total': row[4],
                    'attendance_rate': round(row[5] or 0, 1)
                }
                for row in cursor.fetchall()
            ]
            
            # Student performance summary
            cursor.execute("""
                SELECT 
                    st.name,
                    st.total_sessions,
                    st.total_present,
                    (st.total_present * 100.0 / NULLIF(st.total_sessions, 0)) as attendance_rate,
                    AVG(ar.attentiveness_percentage) as avg_attention,
                    MAX(ar.created_at) as last_seen
                FROM students st
                LEFT JOIN attendance_records ar ON st.name = ar.student_name AND ar.present = 1
                GROUP BY st.name
                ORDER BY attendance_rate DESC
            """)
            
            students = [
                {
                    'name': row[0],
                    'total_sessions': row[1] or 0,
                    'total_present': row[2] or 0,
                    'attendance_rate': round(row[3] or 0, 1),
                    'avg_attention': round(row[4] or 0, 1),
                    'last_seen': row[5]
                }
                for row in cursor.fetchall()
            ]
            
            return {
                'statistics': {
                    'total_sessions': stats[0] or 0,
                    'total_students': stats[1] or 0,
                    'avg_attention': round(stats[2] or 0, 1),
                    'total_present': stats[3] or 0,
                    'total_absent': stats[4] or 0
                },
                'recent_sessions': recent_sessions,
                'students': students
            }
    
    def get_student_profile(self, student_name: str) -> Dict[str, Any]:
        """Get detailed profile for a specific student"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Student basic info
            cursor.execute("""
                SELECT name, total_sessions, total_present, last_seen
                FROM students WHERE name = ?
            """, (student_name,))
            
            student_info = cursor.fetchone()
            if not student_info:
                return {'error': 'Student not found'}
            
            # Attendance history
            cursor.execute("""
                SELECT s.session_name, s.start_time, ar.present, ar.total_time_seconds,
                       ar.attentiveness_percentage, ar.engagement_level, ar.dominant_emotion
                FROM attendance_records ar
                JOIN sessions s ON ar.session_id = s.id
                WHERE ar.student_name = ?
                ORDER BY s.start_time DESC
            """, (student_name,))
            
            history = [
                {
                    'session': row[0],
                    'date': row[1],
                    'present': bool(row[2]),
                    'time_seconds': row[3],
                    'attentiveness': row[4],
                    'engagement': row[5],
                    'emotion': row[6]
                }
                for row in cursor.fetchall()
            ]
            
            return {
                'name': student_info[0],
                'total_sessions': student_info[1] or 0,
                'total_present': student_info[2] or 0,
                'attendance_rate': round((student_info[2] or 0) * 100.0 / max(student_info[1] or 1, 1), 1),
                'last_seen': student_info[3],
                'history': history
            }
    
    def get_session_details(self, session_id: int) -> Dict[str, Any]:
        """Get detailed information for a specific session with ALL attentiveness data"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Session info
            cursor.execute("""
                SELECT session_name, start_time, end_time, duration_seconds,
                       total_students, present_students, absent_students, enhanced_analysis
                FROM sessions WHERE id = ?
            """, (session_id,))
            
            session_info = cursor.fetchone()
            if not session_info:
                return {'error': 'Session not found'}
            
            # Attendance records - fetch ALL fields including attentiveness data
            cursor.execute("""
                SELECT student_name, present, total_time_seconds, attendance_confidence,
                       attentiveness_analyzed, avg_attention_score, attentiveness_percentage,
                       time_attentive_seconds, time_distracted_seconds, time_drowsy_seconds, time_sleeping_seconds,
                       peak_attention_score, lowest_attention_score, blink_rate,
                       head_movement_score, gaze_stability_score, engagement_level,
                       dominant_emotion, participation_events, participation_rate, hand_gestures_detected
                FROM attendance_records 
                WHERE session_id = ?
                ORDER BY student_name
            """, (session_id,))
            
            records = []
            for row in cursor.fetchall():
                records.append({
                    'student_name': row[0],
                    'present': bool(row[1]),
                    'presence_seconds': row[2] or 0,
                    'confidence': row[3] or (0.95 if row[1] else 0),
                    'attentiveness_analyzed': bool(row[4]),
                    'avg_attention_score': row[5] or 0,
                    'attention_score': row[6] or row[5] or 0,  # Use attentiveness_percentage or avg
                    'attentiveness_percentage': row[6] or 0,
                    'time_attentive_seconds': row[7] or 0,
                    'time_distracted_seconds': row[8] or 0,
                    'time_drowsy_seconds': row[9] or 0,
                    'time_sleeping_seconds': row[10] or 0,
                    'peak_attention_score': row[11] or 0,
                    'lowest_attention_score': row[12] or 0,
                    'blink_rate': row[13] or 0,
                    'head_movement_score': row[14] or 0,
                    'gaze_stability_score': row[15] or 0,
                    'engagement_level': row[16] or ('N/A' if not row[1] else 'Unknown'),
                    'dominant_emotion': row[17] or ('N/A' if not row[1] else 'neutral'),
                    'participation_events': row[18] or 0,
                    'participation_rate': row[19] or 0,
                    'hand_gestures_detected': row[20] or 'none',
                    'detection_sources': 'Face Recognition' if row[1] else 'N/A'
                })
            
            return {
                'id': session_id,
                'name': session_info[0],
                'start_time': session_info[1],
                'end_time': session_info[2],
                'duration_seconds': session_info[3],
                'total_students': session_info[4],
                'present_students': session_info[5],
                'absent_students': session_info[6],
                'enhanced_analysis': bool(session_info[7]),
                'records': records
            }
    
    def cache_analytics(self, key: str, data: Any):
        """Cache analytics data for quick dashboard loading"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT OR REPLACE INTO analytics_cache (key, value, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
            """, (key, json.dumps(data)))
            conn.commit()
    
    def get_cached_analytics(self, key: str, max_age_minutes: int = 30) -> Optional[Any]:
        """Get cached analytics if not expired"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT value FROM analytics_cache 
                WHERE key = ? AND updated_at > datetime('now', ? || ' minutes')
            """, (key, f'-{int(max_age_minutes)}'))
            
            result = cursor.fetchone()
            if result:
                return json.loads(result[0])
            return None
    
    def cleanup_on_startup(self):
        """Clean up stale data on server startup:
        - Delete interrupted 'running' sessions that have no records (never finished)
        - Remove orphan attendance_records whose session was deleted
        - Recalculate student stats from actual records
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            # 1. Delete stale running sessions with no records (interrupted runs)
            cursor.execute("""
                DELETE FROM sessions
                WHERE status = 'running'
                  AND id NOT IN (SELECT DISTINCT session_id FROM attendance_records)
            """)
            stale = cursor.rowcount
            # 2. Delete orphan records whose session no longer exists
            cursor.execute("""
                DELETE FROM attendance_records
                WHERE session_id NOT IN (SELECT id FROM sessions)
            """)
            orphans = cursor.rowcount
            conn.commit()
        # 3. Recalculate student stats from actual remaining records
        self.update_student_stats()
        return stale, orphans

    def delete_session(self, session_id: int) -> bool:
        """Delete a session and all its attendance records"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            # Delete attendance records first
            cursor.execute("DELETE FROM attendance_records WHERE session_id = ?", (session_id,))
            # Delete the session
            cursor.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
            conn.commit()
            # Update student stats
            self.update_student_stats()
            return cursor.rowcount > 0
    
    def delete_all_sessions(self) -> int:
        """Delete all sessions and attendance records"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            # Count sessions
            cursor.execute("SELECT COUNT(*) FROM sessions")
            count = cursor.fetchone()[0]
            # Delete all attendance records
            cursor.execute("DELETE FROM attendance_records")
            # Delete all sessions
            cursor.execute("DELETE FROM sessions")
            # Clear analytics cache
            cursor.execute("DELETE FROM analytics_cache")
            conn.commit()
            # Reset student stats
            cursor.execute("UPDATE students SET total_sessions = 0, total_present = 0")
            conn.commit()
            return count

    def get_all_student_insights(self) -> Dict[str, Any]:
        """Get comprehensive insights for all students across all sessions"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()

            # Per-student insights
            cursor.execute("""
                SELECT 
                    st.name,
                    COUNT(DISTINCT ar.session_id) as total_sessions,
                    SUM(CASE WHEN ar.present = 1 THEN 1 ELSE 0 END) as total_present,
                    MAX(CASE WHEN ar.present = 1 THEN ar.created_at ELSE NULL END) as last_seen,
                    ROUND(
                        SUM(CASE WHEN ar.present = 1 THEN 1 ELSE 0 END) * 100.0 /
                        NULLIF(COUNT(DISTINCT ar.session_id), 0),
                        1
                    ) as attendance_rate,
                    ROUND(AVG(CASE WHEN ar.present = 1 THEN ar.avg_attention_score ELSE NULL END), 2) as avg_attention,
                    ROUND(AVG(CASE WHEN ar.present = 1 THEN ar.attentiveness_percentage ELSE NULL END), 1) as avg_attentiveness_pct,
                    ROUND(AVG(CASE WHEN ar.present = 1 THEN ar.total_time_seconds ELSE NULL END), 1) as avg_presence_time,
                    MAX(CASE WHEN ar.present = 1 THEN ar.peak_attention_score ELSE 0 END) as best_attention,
                    ROUND(AVG(CASE WHEN ar.present = 1 THEN ar.gaze_stability_score ELSE NULL END), 2) as avg_gaze_stability,
                    ROUND(AVG(CASE WHEN ar.present = 1 THEN ar.blink_rate ELSE NULL END), 2) as avg_blink_rate,
                    ROUND(AVG(CASE WHEN ar.present = 1 THEN ar.head_movement_score ELSE NULL END), 2) as avg_head_movement,
                    SUM(CASE WHEN ar.present = 1 THEN ar.participation_events ELSE 0 END) as total_participation_events,
                    ROUND(AVG(CASE WHEN ar.present = 1 THEN ar.participation_rate ELSE NULL END), 2) as avg_participation_rate
                FROM students st
                LEFT JOIN attendance_records ar ON st.name = ar.student_name
                GROUP BY st.name
                ORDER BY st.name
            """)

            students = []
            for row in cursor.fetchall():
                student = {
                    'name': row[0],
                    'total_sessions': row[1] or 0,
                    'total_present': row[2] or 0,
                    'last_seen': row[3],
                    'attendance_rate': row[4] or 0,
                    'avg_attention_score': row[5] or 0,
                    'avg_attentiveness_pct': row[6] or 0,
                    'avg_presence_time': row[7] or 0,
                    'best_attention_score': row[8] or 0,
                    'avg_gaze_stability': row[9] or 0,
                    'avg_blink_rate': row[10] or 0,
                    'avg_head_movement': row[11] or 0,
                    'total_participation_events': row[12] or 0,
                    'avg_participation_rate': row[13] or 0
                }
                students.append(student)

            # Session history
            cursor.execute("""
                SELECT 
                    s.id, s.session_name, s.start_time, s.end_time, 
                    s.duration_seconds, s.total_students, s.present_students, 
                    s.absent_students, s.enhanced_analysis, s.status
                FROM sessions s
                ORDER BY s.start_time DESC
            """)

            sessions = []
            for row in cursor.fetchall():
                sessions.append({
                    'id': row[0],
                    'name': row[1],
                    'start_time': row[2],
                    'end_time': row[3],
                    'duration_seconds': row[4],
                    'total_students': row[5] or 0,
                    'present_students': row[6] or 0,
                    'absent_students': row[7] or 0,
                    'enhanced': bool(row[8]),
                    'status': row[9]
                })

            # Overall stats
            total_sessions_count = len(sessions)
            completed_sessions = [s for s in sessions if s['status'] == 'completed']
            total_students_count = len(students)

            overall_attendance_rate = 0
            if total_sessions_count > 0 and total_students_count > 0:
                total_present_all = sum(s.get('present_students', 0) for s in completed_sessions)
                total_possible = sum(s.get('total_students', 0) for s in completed_sessions)
                overall_attendance_rate = round((total_present_all * 100.0 / max(total_possible, 1)), 1)

            # Per-session attendance for trends
            cursor.execute("""
                SELECT s.session_name, s.start_time,
                    ROUND(s.present_students * 100.0 / NULLIF(s.total_students, 0), 1) as rate,
                    ROUND(AVG(CASE WHEN ar.present = 1 THEN ar.avg_attention_score ELSE NULL END), 2) as avg_attention
                FROM sessions s
                LEFT JOIN attendance_records ar ON s.id = ar.session_id
                WHERE s.status = 'completed'
                GROUP BY s.id
                ORDER BY s.start_time ASC
            """)

            trends = []
            for row in cursor.fetchall():
                trends.append({
                    'session_name': row[0],
                    'date': row[1],
                    'attendance_rate': row[2] or 0,
                    'avg_attention': row[3] or 0
                })

            # Emotion distribution across all sessions
            cursor.execute("""
                SELECT dominant_emotion, COUNT(*) as cnt
                FROM attendance_records
                WHERE present = 1 AND dominant_emotion IS NOT NULL AND dominant_emotion != 'unknown' AND dominant_emotion != 'N/A'
                GROUP BY dominant_emotion
                ORDER BY cnt DESC
            """)
            emotion_dist = {row[0]: row[1] for row in cursor.fetchall()}

            # Engagement level distribution
            cursor.execute("""
                SELECT engagement_level, COUNT(*) as cnt
                FROM attendance_records
                WHERE present = 1 AND engagement_level IS NOT NULL AND engagement_level != 'N/A' AND engagement_level != 'Not Analyzed'
                GROUP BY engagement_level
                ORDER BY cnt DESC
            """)
            engagement_dist = {row[0]: row[1] for row in cursor.fetchall()}

            return {
                'overall': {
                    'total_sessions': total_sessions_count,
                    'total_students': total_students_count,
                    'overall_attendance_rate': overall_attendance_rate,
                },
                'students': students,
                'sessions': sessions,
                'trends': trends,
                'emotion_distribution': emotion_dist,
                'engagement_distribution': engagement_dist
            }

    def get_student_session_history(self, student_name: str) -> List[Dict[str, Any]]:
        """Get per-session breakdown for one student"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT s.id, s.session_name, s.start_time,
                    ar.present, ar.total_time_seconds, ar.attendance_confidence,
                    ar.avg_attention_score, ar.attentiveness_percentage,
                    ar.time_attentive_seconds, ar.time_distracted_seconds,
                    ar.time_drowsy_seconds, ar.time_sleeping_seconds,
                    ar.dominant_emotion, ar.engagement_level,
                    ar.participation_events, ar.participation_rate,
                    ar.blink_rate, ar.gaze_stability_score, ar.head_movement_score
                FROM attendance_records ar
                JOIN sessions s ON ar.session_id = s.id
                WHERE ar.student_name = ?
                ORDER BY s.start_time DESC
            """, (student_name,))

            history = []
            for row in cursor.fetchall():
                history.append({
                    'session_id': row[0],
                    'session_name': row[1],
                    'date': row[2],
                    'present': bool(row[3]),
                    'presence_seconds': row[4] or 0,
                    'confidence': row[5] or 0,
                    'attention_score': row[6] or 0,
                    'attentiveness_pct': row[7] or 0,
                    'time_attentive': row[8] or 0,
                    'time_distracted': row[9] or 0,
                    'time_drowsy': row[10] or 0,
                    'time_sleeping': row[11] or 0,
                    'emotion': row[12] or 'N/A',
                    'engagement': row[13] or 'N/A',
                    'participation_events': row[14] or 0,
                    'participation_rate': row[15] or 0,
                    'blink_rate': row[16] or 0,
                    'gaze_stability': row[17] or 0,
                    'head_movement': row[18] or 0
                })
            return history

    def get_student_emails(self, names: List[str]) -> Dict[str, str]:
        """Get email addresses for a list of student names"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            placeholders = ','.join('?' for _ in names)
            cursor.execute(f"SELECT name, email FROM students WHERE name IN ({placeholders})", names)
            return {row[0]: row[1] for row in cursor.fetchall() if row[1]}


# Global database instance
db = AttendanceDatabase()