from fastapi import FastAPI, UploadFile, File, Form, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
import shutil
import json
import asyncio
import time
import traceback
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
import cv2

from attendance_pipeline import run_attendance_cached, AttendanceCache, DEFAULT_GALLERY_DIR, DEFAULT_VIDEO_PATH, DEFAULT_OUTPUT_VIDEO, PROJECT_ROOT

# Try to import enhanced features, fall back gracefully if dependencies missing
try:
    from enhanced_attendance_pipeline import EnhancedAttendancePipeline
    ENHANCED_AVAILABLE = True
    print("✅ Enhanced attentiveness pipeline available")
except ImportError as e:
    ENHANCED_AVAILABLE = False
    print(f"⚠️ Enhanced pipeline not available: {e}")
    print("📝 Basic attendance system will work normally")
except Exception as e:
    ENHANCED_AVAILABLE = False
    print(f"❌ Enhanced pipeline failed to load: {e}")
    print("📝 Basic attendance system will work normally")

# Try to import database
try:
    from database import db
    DATABASE_AVAILABLE = True
    print("✅ Database module available for persistent storage")
except ImportError as e:
    DATABASE_AVAILABLE = False
    print(f"⚠️ Database not available: {e}")
    print("📝 Running without persistent storage")

# Path for frontend static data snapshots
FRONTEND_DATA_DIR = os.path.join(PROJECT_ROOT, 'frontend', 'public', 'data')

app = FastAPI(title="CORIS Attendance Backend", version="1.0.0")

# CORS for local dev UI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RunRequest(BaseModel):
    gallery_dir: Optional[str] = DEFAULT_GALLERY_DIR
    video_path: Optional[str] = DEFAULT_VIDEO_PATH
    output_video: Optional[str] = DEFAULT_OUTPUT_VIDEO
    use_cache: Optional[bool] = True
    clear_cache: Optional[bool] = False

class EnhancedRunRequest(BaseModel):
    gallery_dir: Optional[str] = DEFAULT_GALLERY_DIR
    video_path: Optional[str] = DEFAULT_VIDEO_PATH
    output_video: Optional[str] = DEFAULT_OUTPUT_VIDEO
    enable_attentiveness: Optional[bool] = True
    enable_pose: Optional[bool] = True
    enable_gaze: Optional[bool] = True
    use_cache: Optional[bool] = True
    clear_cache: Optional[bool] = False

# Global state management
class AppState:
    def __init__(self):
        self.last_result: Dict[str, Any] | None = None
        self.processing_status = {"is_processing": False, "progress": 0, "message": "Ready"}
        self.active_connections: List[WebSocket] = []
        self.cache = AttendanceCache()
    
    async def broadcast_status(self, status_update: Dict[str, Any]):
        """Broadcast status updates to all connected WebSocket clients"""
        self.processing_status.update(status_update)
        message = json.dumps({"type": "status_update", "data": self.processing_status})
        
        # Remove disconnected clients
        active_connections = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
                active_connections.append(connection)
            except:
                pass  # Client disconnected
        self.active_connections = active_connections
    
    async def broadcast_result(self, result: Dict[str, Any]):
        """Broadcast final result to all connected clients"""
        message = json.dumps({"type": "result_update", "data": result})
        
        active_connections = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
                active_connections.append(connection)
            except:
                pass
        self.active_connections = active_connections

app_state = AppState()

# Auto-start processing on server startup. Can be disabled with AUTO_START_PROCESSING=0.
AUTO_START_PROCESSING = os.getenv("AUTO_START_PROCESSING", "1").strip().lower() in ("1", "true", "yes", "on")

@app.on_event("startup")
async def startup_event():
    """Auto-start processing when server starts"""
    # Sync students from gallery to database on startup
    if DATABASE_AVAILABLE:
        try:
            db.sync_students_from_gallery(DEFAULT_GALLERY_DIR)
            print("\u2705 Students synced from gallery to database on startup")
        except Exception as e:
            print(f"\u26a0\ufe0f Gallery sync on startup failed: {e}")
        try:
            stale, orphans = db.cleanup_on_startup()
            if stale or orphans:
                print(f"\U0001f9f9 Cleanup: {stale} stale sessions marked failed, {orphans} orphan records removed")
        except Exception as e:
            print(f"\u26a0\ufe0f DB cleanup on startup failed: {e}")
        
        # Export existing database data to JSON files so offline pages work
        try:
            export_data_snapshot(None)  # Export from database
            print("\u2705 Database data exported to JSON files for offline support")
        except Exception as e:
            print(f"\u26a0\ufe0f Data export failed: {e}")

    # Restore last_result from disk so LiveAnalytics works immediately
    # Skip restore when auto-start is enabled to force a fresh processing session on boot.
    if app_state.last_result is None and not AUTO_START_PROCESSING:
        for fname in ("enhanced_last_result.json", "last_result.json"):
            fpath = os.path.join(PROJECT_ROOT, fname)
            if os.path.isfile(fpath):
                try:
                    with open(fpath, 'r', encoding='utf-8') as f:
                        app_state.last_result = json.load(f)
                    print(f"\u2705 Restored last_result from {fname}")
                    break
                except Exception as e:
                    print(f"\u26a0\ufe0f Failed to restore {fname}: {e}")

    if AUTO_START_PROCESSING:
        print("🚀 Server started! Auto-starting attendance processing...")

        # Force a fresh run status for this boot; previous runs remain in database history.
        app_state.last_result = None
        app_state.processing_status = {"is_processing": True, "progress": 0, "message": "Auto-starting fresh session..."}
        
        # Wait a moment for server to fully initialize
        await asyncio.sleep(2)
        
        # Create default request
        default_request = RunRequest(
            gallery_dir=DEFAULT_GALLERY_DIR,
            video_path=DEFAULT_VIDEO_PATH,
            output_video=DEFAULT_OUTPUT_VIDEO,  # Enable video output
            use_cache=True,
            clear_cache=False
        )
        
        print(f"📁 Gallery: {default_request.gallery_dir}")
        print(f"🎬 Video: {default_request.video_path}")
        print("🔄 Starting automatic processing...")
        
        # Start a fresh processing run (enhanced pipeline is used automatically if available)
        asyncio.create_task(process_attendance_async(default_request))

@app.on_event("shutdown")
async def shutdown_event():
    """Export a final data snapshot when the backend stops so the frontend keeps working."""
    print("🛑 Server shutting down — exporting final data snapshot...")
    export_data_snapshot(app_state.last_result)
    print("✅ Shutdown snapshot complete.")

@app.get("/health")
def health():
    return {"status": "ok", "cache_info": app_state.cache.get_cache_info()}

@app.post("/export-data")
def export_data_endpoint():
    """Export all database data to static JSON files for offline use"""
    if not DATABASE_AVAILABLE:
        return {"error": "Database not available"}
    try:
        export_data_snapshot(app_state.last_result)
        return {"status": "success", "message": "Data exported to JSON files for offline use"}
    except Exception as e:
        return {"error": str(e)}

@app.get("/test-data")
def test_data():
    """Test endpoint to check if we have any result data"""
    return {
        "last_result_available": app_state.last_result is not None,
        "last_result": app_state.last_result,
        "processing_status": app_state.processing_status,
        "cache_info": app_state.cache.get_cache_info()
    }

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    app_state.active_connections.append(websocket)
    
    # Send current status
    try:
        await websocket.send_text(json.dumps({
            "type": "status_update", 
            "data": app_state.processing_status
        }))
        
        # Send last result if available
        if app_state.last_result:
            await websocket.send_text(json.dumps({
                "type": "result_update", 
                "data": app_state.last_result
            }))
        
        # Keep connection alive
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in app_state.active_connections:
            app_state.active_connections.remove(websocket)

@app.post("/process")
async def start_processing(req: RunRequest):
    """Start attendance processing manually"""
    if app_state.processing_status["is_processing"]:
        return {"error": "Already processing. Please wait for current process to complete."}
    
    try:
        # Update status
        await app_state.broadcast_status({
            "is_processing": True, 
            "progress": 0, 
            "message": "Starting attendance processing..."
        })
        
        # Run in background to avoid blocking
        asyncio.create_task(process_attendance_async(req))
        
        return {"status": "started", "message": "Processing started. Use WebSocket for real-time updates."}
        
    except Exception as e:
        await app_state.broadcast_status({
            "is_processing": False, 
            "progress": 0, 
            "message": f"Error: {str(e)}"
        })
        return {"error": str(e)}

@app.post("/run")
async def run(req: RunRequest):
    """Legacy endpoint - redirects to /process"""
    return await start_processing(req)

async def process_attendance_async(req: RunRequest):
    """Process attendance in background with real-time status updates"""
    try:
        # Auto-use enhanced pipeline if available for attention tracking
        if ENHANCED_AVAILABLE:
            enhanced_req = EnhancedRunRequest(
                gallery_dir=req.gallery_dir,
                video_path=req.video_path,
                output_video=req.output_video,
                use_cache=req.use_cache,
                clear_cache=req.clear_cache,
                enable_attentiveness=True,
                enable_pose=True,
                enable_gaze=True
            )
            await process_enhanced_attendance_async(enhanced_req)
            return

        main_loop = asyncio.get_running_loop()

        def progress_callback(percent, message):
            """Thread-safe progress callback that schedules async broadcast on the main loop."""
            payload = {
                "is_processing": True,
                "progress": min(95, max(10, percent)),  # Keep between 10-95 during processing
                "message": message
            }
            main_loop.call_soon_threadsafe(
                lambda: asyncio.create_task(app_state.broadcast_status(payload))
            )
        
        await app_state.broadcast_status({
            "is_processing": True, 
            "progress": 5, 
            "message": "Initializing attendance processing..."
        })
        
        # Run the actual processing with progress callback
        result = await asyncio.to_thread(
            run_attendance_cached,
            gallery_dir=req.gallery_dir or DEFAULT_GALLERY_DIR,
            video_path=req.video_path or DEFAULT_VIDEO_PATH,
            output_video=req.output_video or DEFAULT_OUTPUT_VIDEO,
            use_cache=req.use_cache,
            clear_cache=req.clear_cache,
            progress_callback=progress_callback
        )
        
        await app_state.broadcast_status({
            "is_processing": True, 
            "progress": 90, 
            "message": "Finalizing results..."
        })
        
        # Process and enhance the result
        enhanced_result = enhance_result_for_frontend(result)
        
        # Save to database if available
        if DATABASE_AVAILABLE:
            try:
                print("💾 Saving results to database...")
                await save_basic_results_to_database(enhanced_result, req)
                print("✅ Database save completed!")
            except Exception as db_error:
                import traceback
                print(f"⚠️ Database save error: {db_error}")
                traceback.print_exc()
        
        # Cache result
        app_state.last_result = enhanced_result
        save_result_to_file(enhanced_result)
        
        # Export data snapshot for offline frontend
        export_data_snapshot(enhanced_result)

        # Auto-send emails to defaulters after successful session completion
        trigger_auto_defaulter_emails(enhanced_result)
        
        # Broadcast completion
        await app_state.broadcast_status({
            "is_processing": False, 
            "progress": 100, 
            "message": "Processing completed successfully!"
        })
        
        await app_state.broadcast_result(enhanced_result)
        
    except Exception as e:
        print(f"❌ process_attendance_async failed: {e}")
        traceback.print_exc()
        await app_state.broadcast_status({
            "is_processing": False, 
            "progress": 0, 
            "message": f"Error: {str(e)}"
        })

# Enhanced Processing with Attentiveness Tracking
async def process_enhanced_attendance_async(req: EnhancedRunRequest):
    """Process attendance with attentiveness tracking in background"""
    try:
        # Check if enhanced features are available
        if not ENHANCED_AVAILABLE:
            await app_state.broadcast_status({
                "is_processing": True, 
                "progress": 5, 
                "message": "Enhanced features not available, falling back to basic attendance..."
            })
            
            # Fall back to basic attendance processing
            basic_req = RunRequest(
                gallery_dir=req.gallery_dir,
                video_path=req.video_path,
                output_video=req.output_video,
                use_cache=req.use_cache,
                clear_cache=req.clear_cache
            )
            
            await process_attendance_async(basic_req)
            return
        
        await app_state.broadcast_status({
            "is_processing": True, 
            "progress": 5, 
            "message": "Initializing enhanced attendance processing..."
        })
        
        # Initialize enhanced pipeline
        pipeline = EnhancedAttendancePipeline(
            gallery_dir=req.gallery_dir or DEFAULT_GALLERY_DIR,
            enable_attentiveness=req.enable_attentiveness,
            enable_pose=req.enable_pose,
            enable_gaze=req.enable_gaze,
            enable_database=DATABASE_AVAILABLE
        )
        
        await app_state.broadcast_status({
            "is_processing": True, 
            "progress": 10, 
            "message": "Processing attendance and attentiveness..."
        })

        main_loop = asyncio.get_running_loop()

        def progress_callback(percent, message):
            payload = {
                "is_processing": True,
                "progress": min(95, max(10, float(percent))),
                "message": str(message)
            }
            main_loop.call_soon_threadsafe(
                lambda: asyncio.create_task(app_state.broadcast_status(payload))
            )
        
        # Create output paths
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_csv = f"attendance_results_{timestamp}.csv"
        attention_output = f"attention_results_{timestamp}.json"
        session_name = f"Enhanced_Session_{timestamp}"
        
        # Process video (save_results=False to skip CSV/JSON file generation; DB save is separate)
        await app_state.broadcast_status({
            "is_processing": True,
            "progress": 20,
            "message": "Running frame-wise face detection and attentiveness analysis..."
        })

        result = await asyncio.to_thread(
            pipeline.process_video,
            video_path=req.video_path or DEFAULT_VIDEO_PATH,
            output_video_path=req.output_video,
            save_results=False,
            output_csv=output_csv,
            attention_output=attention_output,
            session_name=session_name,
            progress_callback=progress_callback
        )
        
        await app_state.broadcast_status({
            "is_processing": True, 
            "progress": 90, 
            "message": "Finalizing enhanced results..."
        })
        
        # Enhance result for frontend
        enhanced_result = enhance_enhanced_result_for_frontend(result, output_csv, attention_output)
        
        # Cache result
        app_state.last_result = enhanced_result
        save_result_to_file(enhanced_result)
        save_result_to_file(enhanced_result, "enhanced_last_result.json")
        
        # Export data snapshot for offline frontend
        export_data_snapshot(enhanced_result)

        # Auto-send emails to defaulters after successful session completion
        trigger_auto_defaulter_emails(enhanced_result)
        
        await app_state.broadcast_status({
            "is_processing": False, 
            "progress": 100, 
            "message": "Enhanced processing completed successfully!"
        })
        
        await app_state.broadcast_result(enhanced_result)
        
    except Exception as e:
        print(f"❌ process_enhanced_attendance_async failed: {e}")
        traceback.print_exc()
        await app_state.broadcast_status({
            "is_processing": False, 
            "progress": 0, 
            "message": f"Enhanced processing error: {str(e)}"
        })

def enhance_result_for_frontend(result: Dict[str, Any]) -> Dict[str, Any]:
    """Enhance result with additional data for frontend display"""
    enhanced = result.copy()
    
    # Add timestamp
    enhanced["timestamp"] = datetime.now().isoformat()
    
    # Calculate summary statistics and enhance attendance data
    attendance = result.get("attendance", {})
    
    # Enhance each attendance record with 'present' field based on presence_percentage >= 30%
    enhanced_attendance = {}
    for name, data in attendance.items():
        enhanced_record = data.copy()
        presence_pct = data.get("presence_percentage", 0)
        presence_sec = data.get("presence_seconds", 0)
        # Mark as present if >= 30% visible OR >= 10 seconds
        enhanced_record["present"] = presence_pct >= 30 or presence_sec >= 10
        enhanced_attendance[name] = enhanced_record
    
    enhanced["attendance"] = enhanced_attendance
    
    total_people = len(enhanced_attendance)
    present_people = sum(1 for data in enhanced_attendance.values() if data.get("present", False))
    
    enhanced["summary"] = {
        "total_people": total_people,
        "present_people": present_people,
        "absent_people": total_people - present_people,
        "attendance_rate": (present_people / max(total_people, 1)) * 100
    }
    
    # Add cache info
    enhanced["cache_info"] = app_state.cache.get_cache_info()
    
    # Process recognition stats for charts
    recognition_stats = result.get("recognition_stats", {})
    enhanced["recognition_chart_data"] = [
        {"name": name, "value": count, "color": get_color_for_name(name)}
        for name, count in recognition_stats.items()
    ]
    
    # Process unknown reasons for debugging - limit to top 10 for readability
    unknown_reasons = result.get("unknown_reasons", {})
    sorted_reasons = sorted(unknown_reasons.items(), key=lambda x: x[1], reverse=True)[:10]
    enhanced["unknown_reasons_chart"] = [
        {"reason": reason, "count": count}
        for reason, count in sorted_reasons
    ]
    
    # Add attentiveness placeholder for frontend compatibility
    if "attentiveness" not in enhanced:
        enhanced["attentiveness"] = {
            "class_average": 0,
            "focus_score": 0,
            "individual_scores": {}
        }
    
    return enhanced

async def save_basic_results_to_database(enhanced_result: Dict[str, Any], req: RunRequest):
    """Save basic attendance results to database for persistence"""
    try:
        # Create a new session
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        session_name = f"Session_{timestamp}"
        video_path = req.video_path or DEFAULT_VIDEO_PATH
        
        session_id = db.create_session(
            session_name=session_name,
            video_path=video_path,
            enhanced_analysis=False
        )
        
        # Get all students from gallery directory directly (not from result)
        gallery_students = set()
        gallery_dir = req.gallery_dir or DEFAULT_GALLERY_DIR
        if os.path.exists(gallery_dir):
            for person_dir in os.listdir(gallery_dir):
                person_path = os.path.join(gallery_dir, person_dir)
                if os.path.isdir(person_path):
                    gallery_students.add(person_dir)
        
        # Also add from attendance in case names differ
        attendance = enhanced_result.get("attendance", {})
        for student_name in attendance.keys():
            gallery_students.add(student_name)
        
        print(f"📊 Saving {len(gallery_students)} students to database: {gallery_students}")
        
        present_count = 0
        total_count = len(gallery_students)
        
        # Save attendance records for each student
        for student_name in gallery_students:
            att_data = attendance.get(student_name, {})
            is_present = att_data.get("present", False)
            
            if is_present:
                present_count += 1
            
            # Prepare student data for database
            student_data = {
                'name': student_name,
                'attendance': {
                    'present': is_present,
                    'total_time': att_data.get('presence_seconds', 0),
                    'first_seen': None,
                    'last_seen': None,
                    'confidence': att_data.get('avg_confidence', 0)
                },
                'attentiveness': {
                    'analyzed': False,
                    'avg_attention_score': 0,
                    'attentiveness_percentage': 0,
                    'time_attentive': 0,
                    'time_distracted': 0,
                    'time_drowsy': 0,
                    'time_sleeping': 0,
                    'attention_distribution': {},
                    'peak_attention_score': 0,
                    'lowest_attention_score': 0,
                    'blink_rate': 0,
                    'head_movement_score': 0,
                    'gaze_stability_score': 0,
                    'engagement_level': 'N/A' if not is_present else 'Not Analyzed',
                    'dominant_emotion': 'N/A' if not is_present else 'unknown',
                    'emotion_distribution': {},
                    'participation_events': 0,
                    'participation_rate': 0,
                    'hand_gestures_detected': 'none'
                }
            }
            
            db.save_attendance_record(session_id, student_data)
        
        # Complete the session
        db.complete_session(session_id)
        
        # Update student statistics (total_sessions, total_present, last_seen)
        db.update_student_stats()
        
        # Cache dashboard analytics
        dashboard_data = db.get_dashboard_data()
        db.cache_analytics('dashboard_data', dashboard_data)
        
        print(f"✅ Basic results saved to database (Session ID: {session_id})")
        
    except Exception as e:
        print(f"❌ Failed to save basic results to database: {e}")
        raise

def enhance_enhanced_result_for_frontend(result: Dict[str, Any], csv_path: str, json_path: str) -> Dict[str, Any]:
    """Enhance enhanced result with additional data for frontend display"""
    enhanced = result.copy()
    
    # Add timestamp
    enhanced["timestamp"] = datetime.now().isoformat()
    enhanced["processing_type"] = "enhanced_with_attentiveness"
    enhanced["output_files"] = {
        "csv": csv_path,
        "detailed_json": json_path
    }
    
    # Calculate summary statistics
    student_summaries = result.get("student_summaries", {})
    total_students = len(student_summaries)
    present_students = sum(1 for s in student_summaries.values() if s["attendance"]["present"])
    analyzed_students = sum(1 for s in student_summaries.values() if s["attentiveness"]["analyzed"])
    
    enhanced["summary"] = {
        "total_people": total_students,
        "present_people": present_students,
        "absent_people": total_students - present_students,
        "attendance_rate": (present_students / max(total_students, 1)) * 100,
        "total_students": total_students,
        "present_students": present_students,
        "absent_students": total_students - present_students,
        "attentiveness_analyzed": analyzed_students,
        "analysis_coverage": (analyzed_students / max(total_students, 1)) * 100
    }
    
    # Build attendance dict in the format the frontend expects
    frontend_attendance = {}
    for name, sdata in student_summaries.items():
        att = sdata["attendance"]
        frontend_attendance[name] = {
            "presence_seconds": att.get("total_time", 0),
            "presence_percentage": (att.get("total_time", 0) / max(1, 60)) * 100 if att.get("present") else 0,
            "avg_confidence": att.get("confidence", 0),
            "present": att.get("present", False),
            "num_tracks": 1 if att.get("present") else 0,
            "detection_sources": []
        }
    enhanced["attendance"] = frontend_attendance

    # Build attentiveness dict with individual_scores for frontend
    individual_scores = {}
    total_attention = 0.0
    attn_count = 0
    for name, sdata in student_summaries.items():
        attn = sdata["attentiveness"]
        if attn.get("analyzed"):
            score = attn.get("avg_attention_score", 0)
            total_attention += score
            attn_count += 1
            
            # Determine attention state
            dist = attn.get("attention_distribution", {})
            if dist:
                state = max(dist, key=dist.get) if dist else "attentive"
            else:
                state = "attentive" if score >= 0.6 else "distracted"
            
            individual_scores[name] = {
                "attention_pct": round(score * 100, 1),
                "state": state,
                "gaze_score": attn.get("gaze_stability_score", score * 0.85),
                "emotion": attn.get("dominant_emotion", "neutral"),
                "engagement_level": attn.get("engagement_level", "N/A"),
                "blink_rate": attn.get("blink_rate", 0),
                "head_movement": attn.get("head_movement_score", 0),
            }
    
    class_avg = (total_attention / attn_count * 100) if attn_count > 0 else 0
    enhanced["attentiveness"] = {
        "class_average": round(class_avg, 1),
        "focus_score": round(class_avg * 0.9, 1),
        "individual_scores": individual_scores
    }
    
    return enhanced

def get_color_for_name(name: str) -> str:
    """Generate consistent colors for names"""
    colors = [
        "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#3B82F6",
        "#8B5A5A", "#6B7280", "#EC4899", "#14B8A6", "#F97316"
    ]
    if name == "Unknown":
        return "#6B7280"
    return colors[hash(name) % len(colors)]

def export_data_snapshot(last_result: Dict[str, Any] = None):
    """Export all key API data as static JSON files so the frontend works offline.
    
    Writes to frontend/public/data/ which Vite serves at /data/*.json.
    This covers every endpoint the frontend uses so it can run fully without the backend.
    Priority: Database > last_result parameter > empty defaults
    """
    try:
        os.makedirs(FRONTEND_DATA_DIR, exist_ok=True)
        print("📦 Starting data snapshot export...")

        # Build student insights from database first, fallback to last_result
        insights = None
        if DATABASE_AVAILABLE:
            try:
                insights = db.get_all_student_insights()
                print(f"  ✓ Got {len(insights.get('students', []))} students from database")
            except Exception as e:
                print(f"  ⚠ Database insights failed: {e}")
                insights = None
        
        # If database data unavailable, build from last_result
        if not insights and last_result:
            print("  Building insights from last_result...")
            attendance = last_result.get('attendance', {})
            students = []
            for name, data in attendance.items():
                students.append({
                    'name': name,
                    'total_sessions': 1,
                    'total_present': 1 if data.get('present', False) else 0,
                    'last_seen': None,
                    'attendance_rate': 100.0 if data.get('present', False) else 0.0,
                    'avg_attention_score': 0,
                    'avg_attentiveness_pct': 0,
                    'avg_presence_time': data.get('presence_seconds', 0),
                    'best_attention_score': 0,
                    'avg_gaze_stability': 0,
                    'avg_blink_rate': 0,
                    'avg_head_movement': 0,
                    'total_participation_events': 0,
                    'avg_participation_rate': 0
                })
            
            sessions = []
            summary = last_result.get('summary', {})
            if summary.get('total_people', 0) > 0:
                sessions.append({
                    'id': 999,
                    'name': f"Live_Session_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
                    'start_time': last_result.get('timestamp', datetime.now().isoformat()),
                    'end_time': None,
                    'duration_seconds': None,
                    'total_students': summary.get('total_people', 0),
                    'present_students': summary.get('present_people', 0),
                    'absent_students': summary.get('absent_people', 0),
                    'enhanced_analysis': False,
                    'status': 'completed'
                })
            
            insights = {
                'overall': {
                    'total_sessions': len(sessions),
                    'total_students': len(students),
                    'overall_attendance_rate': summary.get('attendance_rate', 0)
                },
                'students': students,
                'sessions': sessions,
                'trends': []
            }
            print(f"  Built insights for {len(students)} students from live data")
        
        # Export student insights if available
        if insights:
            _write_snapshot('student-insights.json', {"data": insights})
            _write_snapshot('sessions.json', {"sessions": insights.get('sessions', [])})
            
            # Per-session and per-student details from DB
            if DATABASE_AVAILABLE:
                for session in insights.get('sessions', []):
                    sid = session.get('id')
                    if sid and sid != 999:  # Skip the synthetic session
                        try:
                            detail = db.get_session_details(sid)
                            _write_snapshot(f'session-{sid}.json', detail)
                        except Exception:
                            pass
                
                for student in insights.get('students', []):
                    name = student.get('name', '')
                    if name:
                        try:
                            history = db.get_student_session_history(name)
                            _write_snapshot(f'student-history-{name}.json', {"data": history})
                        except Exception:
                            pass

        # Export dashboard data
        dashboard = None
        if DATABASE_AVAILABLE:
            try:
                dashboard = db.get_dashboard_data()
            except Exception as e:
                print(f"  ⚠ Dashboard data failed: {e}")
        
        if not dashboard and insights:
            # Build dashboard from insights
            students = insights.get('students', [])
            total_present = sum(s.get('total_present', 0) for s in students)
            total_sessions = insights.get('overall', {}).get('total_sessions', 0)
            dashboard = {
                'statistics': {
                    'total_sessions': total_sessions,
                    'total_students': len(students),
                    'avg_attention': insights.get('overall', {}).get('overall_attendance_rate', 0),
                    'total_present': total_present,
                    'total_absent': sum(s.get('total_sessions', 0) - s.get('total_present', 0) for s in students)
                },
                'recent_sessions': insights.get('sessions', [])[:5],
                'students': students
            }
        
        if dashboard:
            _write_snapshot('dashboard-data.json', {"data": dashboard, "cached": False})

        # Export last result (used by LiveAnalytics)
        if last_result:
            _write_snapshot('last-result.json', last_result)

        # Export gallery info
        gallery_path = DEFAULT_GALLERY_DIR
        if os.path.exists(gallery_path):
            people = []
            for person_dir in os.listdir(gallery_path):
                person_path = os.path.join(gallery_path, person_dir)
                if os.path.isdir(person_path):
                    image_count = len([f for f in os.listdir(person_path)
                                       if f.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp'))])
                    people.append({"name": person_dir, "image_count": image_count})
            _write_snapshot('gallery-info.json', {"gallery_path": gallery_path, "people": people})

        print("✅ Data snapshot exported successfully for offline frontend")
    except Exception as e:
        import traceback
        print(f"❌ Data snapshot export failed: {e}")
        traceback.print_exc()


def _write_snapshot(filename: str, data: Any):
    """Write a single snapshot JSON file."""
    path = os.path.join(FRONTEND_DATA_DIR, filename)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2, default=str)


def save_result_to_file(result: Dict[str, Any], filename: str = 'last_result.json'):
    """Save result to JSON file for persistence"""
    try:
        save_path = os.path.join(PROJECT_ROOT, filename)
        with open(save_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Failed to write {filename}: {e}")

@app.get("/last-result")
def get_last_result():
    # Prefer memory; fall back to disk if available
    if app_state.last_result is not None:
        return app_state.last_result
    
    file_path = os.path.join(PROJECT_ROOT, 'last_result.json')
    if os.path.isfile(file_path):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            # Enhance the data if it doesn't have 'present' field in attendance records
            attendance = data.get("attendance", {})
            needs_enhancement = any(
                "present" not in record for record in attendance.values()
            ) if attendance else False
            
            if needs_enhancement or "summary" not in data:
                data = enhance_result_for_frontend(data)
                # Cache the enhanced result in memory
                app_state.last_result = data
            
            return data
        except Exception as e:
            return {"error": f"Failed to load last_result.json: {e}"}
    
    return {"error": "No results available yet. POST /run to start a session."}

@app.get("/status")
def get_status():
    """Get current processing status"""
    return app_state.processing_status

@app.get("/cache-info")
def get_cache_info():
    """Get cache information"""
    return app_state.cache.get_cache_info()

@app.post("/clear-cache")
def clear_cache():
    """Clear all cached data"""
    app_state.cache.clear_cache()
    return {"message": "Cache cleared successfully"}

# Enhanced Processing Endpoints
@app.post("/process-enhanced")
async def start_enhanced_processing(req: EnhancedRunRequest):
    """Start enhanced attendance processing with attentiveness tracking"""
    if app_state.processing_status["is_processing"]:
        return {"error": "Already processing. Please wait for current process to complete."}
    
    try:
        if not ENHANCED_AVAILABLE:
            # Update status
            await app_state.broadcast_status({
                "is_processing": True, 
                "progress": 0, 
                "message": "Enhanced features not available. Starting basic attendance processing..."
            })
            
            # Convert to basic request and process
            basic_req = RunRequest(
                gallery_dir=req.gallery_dir,
                video_path=req.video_path,
                output_video=req.output_video,
                use_cache=req.use_cache,
                clear_cache=req.clear_cache
            )
            
            asyncio.create_task(process_attendance_async(basic_req))
            
            return {
                "status": "started", 
                "message": "Enhanced features not available. Basic attendance processing started. Use WebSocket for real-time updates.",
                "fallback": True
            }
        
        # Update status
        await app_state.broadcast_status({
            "is_processing": True, 
            "progress": 0, 
            "message": "Starting enhanced attendance processing with attentiveness tracking..."
        })
        
        # Run in background to avoid blocking
        asyncio.create_task(process_enhanced_attendance_async(req))
        
        return {"status": "started", "message": "Enhanced processing started. Use WebSocket for real-time updates."}
        
    except Exception as e:
        await app_state.broadcast_status({
            "is_processing": False, 
            "progress": 0, 
            "message": f"Error: {str(e)}"
        })
        return {"error": str(e)}

@app.get("/enhanced-results")
def get_enhanced_results():
    """Get the last enhanced processing results"""
    enhanced_file = os.path.join(PROJECT_ROOT, "enhanced_last_result.json")
    
    if os.path.exists(enhanced_file):
        try:
            with open(enhanced_file, 'r') as f:
                data = json.load(f)
            return data
        except Exception as e:
            return {"error": f"Failed to load enhanced results: {e}"}
    
    # Fallback to regular results
    return get_last_result()

@app.get("/attentiveness-config")
def get_attentiveness_config():
    """Get current attentiveness tracking configuration"""
    return {
        "pose_estimation_available": ENHANCED_AVAILABLE,
        "gaze_tracking_available": ENHANCED_AVAILABLE,
        "ml_classifier_available": ENHANCED_AVAILABLE,
        "enhanced_pipeline_available": ENHANCED_AVAILABLE,
        "default_settings": {
            "enable_attentiveness": ENHANCED_AVAILABLE,
            "enable_pose": ENHANCED_AVAILABLE,
            "enable_gaze": ENHANCED_AVAILABLE
        }
    }

@app.get("/video-stream")
def video_stream():
    """Stream the processed output video with face detection boxes and names"""
    def generate_frames():
        # Check if we have processed output video
        video_path = DEFAULT_OUTPUT_VIDEO

        # Never read the output file while a new run is writing it.
        # This avoids decoding partially written/corrupted frames.
        if app_state.processing_status.get("is_processing", False):
            import numpy as np
            while app_state.processing_status.get("is_processing", False):
                progress = app_state.processing_status.get('progress', 0)
                dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
                cv2.putText(dummy_frame, "Processing Video...", (120, 200),
                           cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
                cv2.putText(dummy_frame, f"{progress}% Complete", (150, 250),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
                ret, buffer = cv2.imencode('.jpg', dummy_frame)
                frame = buffer.tobytes()
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
                time.sleep(0.5)
        
        if not os.path.exists(video_path):
            # Check if processing is happening
            if app_state.processing_status.get("is_processing", False):
                # Show processing message, re-check for the video file periodically
                import numpy as np
                while not os.path.exists(video_path):
                    progress = app_state.processing_status.get('progress', 0)
                    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
                    cv2.putText(dummy_frame, "Processing Video...", (120, 200), 
                               cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
                    cv2.putText(dummy_frame, f"{progress}% Complete", (150, 250), 
                               cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
                    ret, buffer = cv2.imencode('.jpg', dummy_frame)
                    frame = buffer.tobytes()
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
                    time.sleep(0.5)
            else:
                # Show waiting message, re-check periodically in case processing starts
                import numpy as np
                for _ in range(20):  # Wait up to 10 seconds then stop
                    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
                    cv2.putText(dummy_frame, "No Processed Video Yet", (80, 200), 
                               cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
                    cv2.putText(dummy_frame, "Run an analysis to begin", (100, 250), 
                               cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 200, 200), 2)
                    ret, buffer = cv2.imencode('.jpg', dummy_frame)
                    frame = buffer.tobytes()
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
                    time.sleep(0.5)
                    if os.path.exists(video_path):
                        break
                if not os.path.exists(video_path):
                    return
            
        cap = cv2.VideoCapture(video_path)
        consecutive_read_failures = 0
        
        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    consecutive_read_failures += 1
                    if consecutive_read_failures == 1:
                        # One rewind attempt is enough for normal loop playback.
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        continue

                    # Stop instead of infinite retry on a corrupted/unreadable video.
                    import numpy as np
                    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
                    cv2.putText(dummy_frame, "Video stream unavailable", (90, 210),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2)
                    cv2.putText(dummy_frame, "Please rerun processing", (130, 250),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 200, 200), 2)
                    ok, buffer = cv2.imencode('.jpg', dummy_frame)
                    if ok:
                        frame_bytes = buffer.tobytes()
                        yield (b'--frame\r\n'
                               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
                    break
                else:
                    consecutive_read_failures = 0
                    
                # Resize frame for web display
                height, width = frame.shape[:2]
                if width > 800:
                    scale = 800 / width
                    new_width = int(width * scale)
                    new_height = int(height * scale)
                    frame = cv2.resize(frame, (new_width, new_height))
                
                ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                frame_bytes = buffer.tobytes()
                
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
                
                # Control frame rate for smooth playback
                time.sleep(0.033)  # ~30 FPS
                
        except Exception as e:
            print(f"Error in video stream: {e}")
        finally:
            cap.release()
    
    return StreamingResponse(generate_frames(), media_type="multipart/x-mixed-replace; boundary=frame")

@app.get("/download-output")
def download_output(path: str = None):
    file_path = path or DEFAULT_OUTPUT_VIDEO
    if not os.path.isabs(file_path):
        file_path = os.path.join(PROJECT_ROOT, file_path)
    if not os.path.isfile(file_path):
        return {"error": f"File not found: {file_path}"}
    return FileResponse(file_path, filename=os.path.basename(file_path))

@app.post("/upload-video")
def upload_video(file: UploadFile = File(...)):
    # Save uploaded video to workspace root
    save_path = os.path.join(PROJECT_ROOT, file.filename)
    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"saved_as": save_path, "filename": file.filename}

@app.get("/gallery-info")
def get_gallery_info():
    """Get information about the gallery directory"""
    gallery_path = DEFAULT_GALLERY_DIR
    if not os.path.exists(gallery_path):
        return {"error": f"Gallery directory not found: {gallery_path}"}
    
    people = []
    for person_dir in os.listdir(gallery_path):
        person_path = os.path.join(gallery_path, person_dir)
        if os.path.isdir(person_path):
            image_count = len([f for f in os.listdir(person_path) 
                             if f.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp'))])
            people.append({"name": person_dir, "image_count": image_count})
    
    return {"gallery_path": gallery_path, "people": people}

@app.post("/set-gallery")
def set_gallery(path: str = Form(...)):
    if not os.path.isdir(path):
        return {"error": f"Not a directory: {path}"}
    return {"ok": True, "gallery_dir": path}

# ==================== DATABASE API ENDPOINTS ====================

@app.get("/dashboard-data")
def get_dashboard_data():
    """Get comprehensive dashboard data from database"""
    if not DATABASE_AVAILABLE:
        return {"error": "Database not available"}
    
    try:
        # Try to get cached data first
        cached_data = db.get_cached_analytics('dashboard_data', max_age_minutes=5)
        if cached_data:
            return {"data": cached_data, "cached": True}
        
        # Get fresh data
        dashboard_data = db.get_dashboard_data()
        db.cache_analytics('dashboard_data', dashboard_data)
        
        return {"data": dashboard_data, "cached": False}
    except Exception as e:
        return {"error": str(e)}

@app.get("/students")
def get_all_students():
    """Get all students with their statistics"""
    if not DATABASE_AVAILABLE:
        return {"error": "Database not available"}
    
    try:
        dashboard_data = db.get_dashboard_data()
        return {"students": dashboard_data.get('students', [])}
    except Exception as e:
        return {"error": str(e)}

@app.get("/student/{student_name}")
def get_student_profile(student_name: str):
    """Get detailed profile for a specific student"""
    if not DATABASE_AVAILABLE:
        return {"error": "Database not available"}
    
    try:
        profile = db.get_student_profile(student_name)
        return profile
    except Exception as e:
        return {"error": str(e)}

@app.get("/sessions")
def get_recent_sessions():
    """Get all sessions data"""
    if not DATABASE_AVAILABLE:
        return {"error": "Database not available"}
    
    try:
        insights = db.get_all_student_insights()
        return {"sessions": insights.get('sessions', [])}
    except Exception as e:
        return {"error": str(e)}

@app.get("/session/{session_id}")
def get_session_details(session_id: int):
    """Get detailed information for a specific session"""
    if not DATABASE_AVAILABLE:
        return {"error": "Database not available"}
    
    try:
        session_details = db.get_session_details(session_id)
        return session_details
    except Exception as e:
        return {"error": str(e)}

@app.get("/analytics/summary")
def get_analytics_summary():
    """Get analytics summary for dashboard widgets"""
    if not DATABASE_AVAILABLE:
        return {"error": "Database not available"}
    
    try:
        dashboard_data = db.get_dashboard_data()
        return {"summary": dashboard_data.get('statistics', {})}
    except Exception as e:
        return {"error": str(e)}

@app.post("/sync-students")
def sync_students_from_gallery():
    """Sync students from gallery directory to database"""
    if not DATABASE_AVAILABLE:
        return {"error": "Database not available"}
    
    try:
        count = db.sync_students_from_gallery(DEFAULT_GALLERY_DIR)
        return {"students_synced": count, "gallery_dir": DEFAULT_GALLERY_DIR}
    except Exception as e:
        return {"error": str(e)}

@app.get("/database-status")
def get_database_status():
    """Get database availability and statistics"""
    return {
        "available": DATABASE_AVAILABLE,
        "enhanced_available": ENHANCED_AVAILABLE,
        "gallery_dir": DEFAULT_GALLERY_DIR
    }

@app.get("/student-insights")
def get_student_insights():
    """Get comprehensive student insights from all sessions"""
    if not DATABASE_AVAILABLE:
        return {"error": "Database not available"}
    try:
        insights = db.get_all_student_insights()
        return {"data": insights}
    except Exception as e:
        return {"error": str(e)}

@app.get("/student-history/{student_name}")
def get_student_history(student_name: str):
    """Get per-session history for a student"""
    if not DATABASE_AVAILABLE:
        return {"error": "Database not available"}
    try:
        history = db.get_student_session_history(student_name)
        return {"data": history}
    except Exception as e:
        return {"error": str(e)}

@app.delete("/session/{session_id}")
def delete_session(session_id: int):
    """Delete a specific session"""
    if not DATABASE_AVAILABLE:
        return {"error": "Database not available"}
    
    try:
        success = db.delete_session(session_id)
        if success:
            # Clear cached dashboard data
            db.cache_analytics('dashboard_data', db.get_dashboard_data())
            return {"success": True, "message": f"Session {session_id} deleted"}
        return {"error": f"Session {session_id} not found"}
    except Exception as e:
        return {"error": str(e)}

@app.delete("/sessions/all")
def delete_all_sessions():
    """Delete all sessions - use with caution!"""
    if not DATABASE_AVAILABLE:
        return {"error": "Database not available"}
    
    try:
        count = db.delete_all_sessions()
        return {"success": True, "message": f"Deleted {count} sessions", "deleted_count": count}
    except Exception as e:
        return {"error": str(e)}

# ─── Email Configuration ───────────────────────────────────────────
# Uses Gmail SMTP with App Password. Set these environment variables:
#   CORIS_SENDER_EMAIL  - Gmail address to send from
#   CORIS_SENDER_PASS   - Gmail App Password (not regular password)
# Or the defaults below will be used.
SENDER_EMAIL = os.environ.get("CORIS_SENDER_EMAIL", "coris.attendance.system@gmail.com")
SENDER_PASS = os.environ.get("CORIS_SENDER_PASS", "")
AUTO_SEND_DEFAULTER_EMAILS = os.environ.get("AUTO_SEND_DEFAULTER_EMAILS", "1").strip().lower() in ("1", "true", "yes", "on")
DEFAULTER_ATTENDANCE_THRESHOLD = float(os.environ.get("DEFAULTER_ATTENDANCE_THRESHOLD", "60"))
MIN_SESSIONS_FOR_DEFAULTER = int(os.environ.get("MIN_SESSIONS_FOR_DEFAULTER", "2"))
PRESENT_PCT_THRESHOLD = float(os.environ.get("PRESENT_PCT_THRESHOLD", "30"))
PRESENT_SEC_THRESHOLD = float(os.environ.get("PRESENT_SEC_THRESHOLD", "10"))


def _send_email_to_students(student_names: List[str], subject: str, body: str) -> Dict[str, Any]:
    """Shared SMTP sender used by API and auto-defaulter workflow."""
    if not DATABASE_AVAILABLE:
        return {"error": "Database not available"}
    if not student_names:
        return {"error": "No students provided"}
    if not SENDER_PASS:
        return {"error": "Email not configured. Set CORIS_SENDER_EMAIL and CORIS_SENDER_PASS environment variables."}

    try:
        emails = db.get_student_emails(student_names)
        if not emails:
            return {"error": "No email addresses found for selected students"}

        sent = []
        failed = []

        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.starttls()
        server.login(SENDER_EMAIL, SENDER_PASS)

        for name, email_addr in emails.items():
            try:
                msg = MIMEMultipart()
                msg["From"] = SENDER_EMAIL
                msg["To"] = email_addr
                msg["Subject"] = subject
                msg.attach(MIMEText(body, "plain"))
                server.sendmail(SENDER_EMAIL, email_addr, msg.as_string())
                sent.append({"name": name, "email": email_addr})
            except Exception as e:
                failed.append({"name": name, "email": email_addr, "error": str(e)})

        server.quit()

        return {
            "success": True,
            "sent": sent,
            "failed": failed,
            "total_sent": len(sent),
            "total_failed": len(failed)
        }
    except smtplib.SMTPAuthenticationError:
        return {"error": "Email authentication failed. Check CORIS_SENDER_EMAIL and CORIS_SENDER_PASS."}
    except Exception as e:
        return {"error": f"Failed to send emails: {str(e)}"}


def _get_auto_defaulters(latest_result: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Select current defaulters from DB using the same threshold policy as frontend."""
    insights = db.get_all_student_insights()
    students = insights.get("students", [])

    present_now = set()
    attendance = (latest_result or {}).get("attendance", {})
    for name, rec in attendance.items():
        try:
            pct = float((rec or {}).get("presence_percentage", 0) or 0)
            sec = float((rec or {}).get("presence_seconds", 0) or 0)
            if pct >= PRESENT_PCT_THRESHOLD or sec >= PRESENT_SEC_THRESHOLD:
                present_now.add(str(name).strip().lower())
        except Exception:
            continue

    defaulters = []
    for s in students:
        total_sessions = int(s.get("total_sessions", 0) or 0)
        attendance_rate = float(s.get("attendance_rate", 0) or 0)
        name = str(s.get("name", "")).strip()
        if not name:
            continue

        if total_sessions >= MIN_SESSIONS_FOR_DEFAULTER and attendance_rate < DEFAULTER_ATTENDANCE_THRESHOLD:
            if name.lower() not in present_now:
                defaulters.append(s)

    return defaulters


def trigger_auto_defaulter_emails(latest_result: Optional[Dict[str, Any]] = None):
    """Auto-email all current defaulters after each completed run."""
    if not AUTO_SEND_DEFAULTER_EMAILS:
        return
    if not DATABASE_AVAILABLE:
        return

    defaulters = _get_auto_defaulters(latest_result)
    if not defaulters:
        print("📧 Auto-email: no current defaulters")
        return

    names = [str(s.get("name", "")).strip() for s in defaulters if str(s.get("name", "")).strip()]
    if not names:
        return

    subject = "Attendance Alert - Immediate Attention Required"
    details = "\n".join([f"- {s['name']} ({float(s.get('attendance_rate', 0) or 0):.1f}%)" for s in defaulters])
    body = (
        "Dear Parent/Guardian,\n\n"
        f"This is to inform you that the student attendance is below the required {DEFAULTER_ATTENDANCE_THRESHOLD:.0f}% threshold:\n\n"
        f"{details}\n\n"
        "Please ensure regular attendance to avoid academic consequences.\n\n"
        "Regards,\n"
        "Attendance Monitoring System"
    )

    result = _send_email_to_students(names, subject, body)
    if result.get("error"):
        print(f"⚠️ Auto-email failed: {result['error']}")
    else:
        print(f"📧 Auto-email sent: {result.get('total_sent', 0)} sent, {result.get('total_failed', 0)} failed")

class EmailRequest(BaseModel):
    student_names: List[str]
    subject: str
    body: str

@app.post("/send-defaulter-emails")
def send_defaulter_emails(req: EmailRequest):
    """Send attendance alert emails to defaulter students"""
    return _send_email_to_students(req.student_names, req.subject, req.body)

@app.get("/student-emails")
def get_student_emails():
    """Get all student email addresses"""
    if not DATABASE_AVAILABLE:
        return {"error": "Database not available"}
    try:
        import sqlite3
        with sqlite3.connect(db.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name, email FROM students WHERE email IS NOT NULL")
            return {"emails": {row[0]: row[1] for row in cursor.fetchall()}}
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
