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

# Auto-start flag - set to True to automatically start processing on server startup
AUTO_START_PROCESSING = True

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

    if AUTO_START_PROCESSING:
        print("🚀 Server started! Auto-starting attendance processing...")
        
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
        
        # Use the basic pipeline (which was working fine)
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
        def progress_callback(percent, message):
            """Sync progress callback that schedules async broadcast"""
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(app_state.broadcast_status({
                    "is_processing": True,
                    "progress": min(95, max(10, percent)),  # Keep between 10-95 during processing
                    "message": message
                }))
        
        await app_state.broadcast_status({
            "is_processing": True, 
            "progress": 5, 
            "message": "Initializing attendance processing..."
        })
        
        # Run the actual processing with progress callback
        result = run_attendance_cached(
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
        
        # Broadcast completion
        await app_state.broadcast_status({
            "is_processing": False, 
            "progress": 100, 
            "message": "Processing completed successfully!"
        })
        
        await app_state.broadcast_result(enhanced_result)
        
    except Exception as e:
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
        
        # Create output paths
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_csv = f"attendance_results_{timestamp}.csv"
        attention_output = f"attention_results_{timestamp}.json"
        session_name = f"Enhanced_Session_{timestamp}"
        
        # Process video (save_results=False to skip CSV/JSON file generation; DB save is separate)
        result = pipeline.process_video(
            video_path=req.video_path or DEFAULT_VIDEO_PATH,
            output_video_path=req.output_video,
            save_results=False,
            output_csv=output_csv,
            attention_output=attention_output,
            session_name=session_name
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
        save_result_to_file(enhanced_result, "enhanced_last_result.json")
        
        # Export data snapshot for offline frontend
        export_data_snapshot(enhanced_result)
        
        await app_state.broadcast_status({
            "is_processing": False, 
            "progress": 100, 
            "message": "Enhanced processing completed successfully!"
        })
        
        await app_state.broadcast_result(enhanced_result)
        
    except Exception as e:
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
        "total_students": total_students,
        "present_students": present_students,
        "absent_students": total_students - present_students,
        "attendance_rate": (present_students / max(total_students, 1)) * 100,
        "attentiveness_analyzed": analyzed_students,
        "analysis_coverage": (analyzed_students / max(total_students, 1)) * 100
    }
    
    # Process attentiveness statistics
    if analyzed_students > 0:
        total_attention_score = sum(s["attentiveness"]["avg_attention_score"] 
                                  for s in student_summaries.values() 
                                  if s["attentiveness"]["analyzed"])
        avg_attention_score = total_attention_score / analyzed_students
        
        # Count attention states
        attention_states = {"attentive": 0, "distracted": 0, "drowsy": 0, "sleeping": 0}
        for student in student_summaries.values():
            if student["attentiveness"]["analyzed"]:
                distribution = student["attentiveness"]["attention_distribution"]
                for state, time_spent in distribution.items():
                    if state in attention_states and time_spent > 0:
                        attention_states[state] += 1
        
        enhanced["attentiveness_summary"] = {
            "average_attention_score": avg_attention_score,
            "attention_state_counts": attention_states,
            "highly_attentive_students": sum(1 for s in student_summaries.values() 
                                           if s["attentiveness"]["analyzed"] and 
                                              s["attentiveness"]["avg_attention_score"] > 0.7)
        }
    else:
        enhanced["attentiveness_summary"] = {
            "average_attention_score": 0,
            "attention_state_counts": {"attentive": 0, "distracted": 0, "drowsy": 0, "sleeping": 0},
            "highly_attentive_students": 0
        }
    
    # Create chart data for frontend
    enhanced["attendance_chart_data"] = [
        {"name": "Present", "value": present_students, "color": "#10B981"},
        {"name": "Absent", "value": total_students - present_students, "color": "#EF4444"}
    ]
    
    enhanced["attention_chart_data"] = [
        {"name": "Attentive", "value": enhanced["attentiveness_summary"]["attention_state_counts"]["attentive"], "color": "#10B981"},
        {"name": "Distracted", "value": enhanced["attentiveness_summary"]["attention_state_counts"]["distracted"], "color": "#F59E0B"},
        {"name": "Drowsy", "value": enhanced["attentiveness_summary"]["attention_state_counts"]["drowsy"], "color": "#F97316"},
        {"name": "Sleeping", "value": enhanced["attentiveness_summary"]["attention_state_counts"]["sleeping"], "color": "#EF4444"}
    ]
    
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
    """
    try:
        os.makedirs(FRONTEND_DATA_DIR, exist_ok=True)

        if DATABASE_AVAILABLE:
            # 1. Student insights (used by Dashboard, Students, Defaulters)
            insights = db.get_all_student_insights()
            _write_snapshot('student-insights.json', {"data": insights})

            # 2. Sessions list
            _write_snapshot('sessions.json', {"sessions": insights.get('sessions', [])})

            # 3. Per-session detail (used by Sessions page drill-down)
            for session in insights.get('sessions', []):
                sid = session.get('id')
                if sid is not None:
                    try:
                        detail = db.get_session_details(sid)
                        _write_snapshot(f'session-{sid}.json', detail)
                    except Exception:
                        pass

            # 4. Per-student history (used by Students page drill-down)
            for student in insights.get('students', []):
                name = student.get('name', '')
                if name:
                    try:
                        history = db.get_student_session_history(name)
                        _write_snapshot(f'student-history-{name}.json', {"data": history})
                    except Exception:
                        pass

            # 5. Dashboard data
            try:
                dashboard = db.get_dashboard_data()
                _write_snapshot('dashboard-data.json', {"data": dashboard, "cached": False})
            except Exception:
                pass

        # 6. Last result (used by LiveAnalytics)
        if last_result:
            _write_snapshot('last-result.json', last_result)

        # 7. Gallery info
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

        print("📦 Data snapshot exported for offline frontend")
    except Exception as e:
        print(f"⚠️ Data snapshot export failed: {e}")


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
        
        if not os.path.exists(video_path):
            # Check if processing is happening
            if app_state.processing_status.get("is_processing", False):
                # Show processing message
                import numpy as np
                dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
                cv2.putText(dummy_frame, "Processing Video...", (120, 200), 
                           cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
                cv2.putText(dummy_frame, f"{app_state.processing_status.get('progress', 0)}% Complete", (150, 250), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
                ret, buffer = cv2.imencode('.jpg', dummy_frame)
                frame = buffer.tobytes()
                while True:
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
                    time.sleep(0.5)
            else:
                # Show waiting message
                import numpy as np
                dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
                cv2.putText(dummy_frame, "Starting Processing...", (100, 200), 
                           cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
                cv2.putText(dummy_frame, "Please wait", (180, 250), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
                ret, buffer = cv2.imencode('.jpg', dummy_frame)
                frame = buffer.tobytes()
                while True:
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
                    time.sleep(1)
            
        cap = cv2.VideoCapture(video_path)
        
        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    # Loop the processed video continuously
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue
                    
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
