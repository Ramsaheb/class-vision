# CORIS Attendance System - Database Integration

## 🎯 **Dynamic UI with Persistent Data Storage**

The CORIS system now includes comprehensive database integration for dynamic UI that persists data across sessions.

## 📊 **Features Added**

### ✅ **Persistent Data Storage**
- SQLite database for storing all session data
- Student profiles with attendance history
- Session records with comprehensive metrics
- Analytics caching for fast dashboard loading

### ✅ **Dynamic UI Components**
- Real-time dashboard data from database
- Student performance tracking across sessions
- Session history and analytics
- No more reset on each new run - data persists!

### ✅ **API Endpoints**
- `/dashboard-data` - Complete dashboard statistics
- `/students` - All students with their performance
- `/student/{name}` - Individual student profile
- `/sessions` - Recent session history
- `/session/{id}` - Detailed session information
- `/sync-students` - Sync gallery directory to database

## 🗄️ **Database Schema**

### **Tables Created**
1. **students** - Master student list with statistics
2. **sessions** - Video analysis sessions
3. **attendance_records** - Individual student records per session
4. **analytics_cache** - Cached dashboard data

### **Data Tracked**
- **Attendance**: Present/absent, time present, confidence
- **Attentiveness**: Attention scores, engagement levels
- **Emotions**: Dominant emotions, emotion distributions  
- **Participation**: Hand gestures, participation rates
- **Session Analytics**: Duration, student counts, completion status

## 🚀 **Usage**

### **Automatic Integration**
The database is automatically initialized when the server starts:

```python
# Database auto-syncs students from gallery
db.sync_students_from_gallery(gallery_dir)

# Enhanced pipeline saves to database automatically
pipeline = EnhancedAttendancePipeline(
    gallery_dir=gallery_dir,
    enable_database=True  # Enable database storage
)
```

### **Dashboard Benefits**
- **Persistent Statistics**: Data survives server restarts
- **Historical Trends**: View attendance patterns over time
- **Student Profiles**: Individual performance tracking
- **Session Analytics**: Detailed session breakdowns

## 📈 **Database Dashboard Data**

### **Statistics Overview**
```json
{
  "statistics": {
    "total_sessions": 5,
    "total_students": 7,
    "avg_attention": 78.5,
    "total_present": 25,
    "total_absent": 10
  }
}
```

### **Student Performance**
```json
{
  "students": [
    {
      "name": "Ramsaheb",
      "total_sessions": 3,
      "total_present": 3,
      "attendance_rate": 100.0,
      "avg_attention": 85.2,
      "last_seen": "2025-10-15 14:30:00"
    }
  ]
}
```

### **Session History**
```json
{
  "recent_sessions": [
    {
      "id": 1,
      "name": "Enhanced_Session_20251015_143000",
      "start_time": "2025-10-15 14:30:00",
      "present": 5,
      "total": 7,
      "attendance_rate": 71.4
    }
  ]
}
```

## 🔧 **Frontend Integration**

The React dashboard now automatically uses database data:

```tsx
// Automatically switches between database and real-time data
const attendanceData = useMemo(() => {
  if (databaseAvailable && dashboardData?.students) {
    return dashboardData.students; // Use persistent database data
  }
  return realtimeData; // Fallback to WebSocket data
}, [databaseAvailable, dashboardData, realtimeData]);
```

## 📝 **Enhanced CSV Output**

With absent logic, your CSV now includes:
- **ALL 7 students** from database (not just detected ones)
- **Absent students** marked as `Present=False` with zero metrics
- **Present students** with full 25-field analytics
- **Historical context** for each student

## 🎉 **Benefits**

1. **No More Data Loss**: Attendance records persist across server restarts
2. **Historical Analytics**: Track student performance over time
3. **Dynamic UI**: Dashboard shows real accumulated data
4. **Complete Coverage**: All database students included in every report
5. **Fast Loading**: Cached analytics for instant dashboard updates

## 🚀 **Ready to Use**

The system is now completely ready with:
- ✅ Database integration active
- ✅ Dynamic UI with persistent data
- ✅ Absent logic for complete student coverage
- ✅ Enhanced attentiveness features (emotions + gestures)
- ✅ 25-field comprehensive CSV output

Start the server and your data will now persist across sessions!

```bash
cd backend
python server.py
```

🎯 **Your attendance system is now enterprise-ready with full data persistence!**