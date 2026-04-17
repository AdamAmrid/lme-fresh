import sqlite3
import os

db_path = 'c:/Users/Adam/OneDrive - Université Mohammed VI Polytechnique/Bureau/Internship/Learner_Profiling_Analytics/learner-modeling-engine/backend/lme.db'

def cleanup():
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Keep Adam's data, delete everyone else
        # Also delete users who are not Adam to avoid duplicate seeding
        print("Cleaning up mock telemetry...")
        cursor.execute("DELETE FROM telemetry_logs WHERE student_id != 'adam.amrid@um6p.ma'")
        
        print(f"Rows deleted: {conn.total_changes}")
        conn.commit()
    except Exception as e:
        print(f"Error: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    cleanup()
