from database import db
import json

insights = db.get_all_student_insights()
for s in insights['students']:
    print(f"{s['name']:12} att_rate={s['attendance_rate']}  sessions={s['total_sessions']}  present={s['total_present']}  avg_attn={s['avg_attention_score']}  avg_pres_time={s['avg_presence_time']}")

print()
print('Overall:', insights['overall'])
print('Sessions count:', len(insights['sessions']))
print('Trends count:', len(insights['trends']))

# Also check what snapshot files look like
import os
snap_dir = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'public', 'data')
if os.path.exists(snap_dir):
    print('\nSnapshot files:', os.listdir(snap_dir))
    si_file = os.path.join(snap_dir, 'student-insights.json')
    if os.path.exists(si_file):
        with open(si_file) as f:
            snap = json.load(f)
        print('\nSnapshot students:')
        for s in snap.get('data', {}).get('students', []):
            print(f"  {s['name']:12} att_rate={s.get('attendance_rate')}  sessions={s.get('total_sessions')}  present={s.get('total_present')}")
else:
    print('\nNo snapshot directory found')
