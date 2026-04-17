import sqlite3
import os

def clear_profile(email):
    # This script targets the lme.db in the backend folder
    db_path = "lme.db"
    
    # If not found, try to look up one level (in case user is in a subfolder)
    if not os.path.exists(db_path):
        db_path = os.path.join("..", "lme.db")
        
    if not os.path.exists(db_path):
        # Last resort fallback to where we usually find it
        db_path = "c:\\Users\\Adam\\OneDrive - Université Mohammed VI Polytechnique\\Bureau\\Internship\\Learner_Profiling_Analytics\\learner-modeling-engine\\backend\\lme.db"

    if not os.path.exists(db_path):
        print(f"❌ Error: Database not found at {db_path}.")
        return

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # 1. Check if user exists
        cursor.execute("SELECT id, name FROM users WHERE email = ?", (email,))
        user = cursor.fetchone()
        
        # 2. Find ghost telemetry tied to email
        cursor.execute("SELECT COUNT(*) FROM telemetry_logs WHERE student_id = ?", (email,))
        email_count = cursor.fetchone()[0]
        
        # 3. Find ghost telemetry tied to numerical ID (legacy seed format)
        id_count = 0
        if user:
            cursor.execute("SELECT COUNT(*) FROM telemetry_logs WHERE student_id = ?", (str(user[0]),))
            id_count = cursor.fetchone()[0]
        
        total = email_count + id_count
        if total == 0:
            print(f"✨ Profile for {email} is already clean!")
            return

        print(f"👻 Found {total} ghost rows for '{email}'. Purging now...")
        
        # DELETE ALL
        cursor.execute("DELETE FROM telemetry_logs WHERE student_id = ?", (email,))
        if user:
            cursor.execute("DELETE FROM telemetry_logs WHERE student_id = ?", (str(user[0]),))
        
        conn.commit()
        conn.close()
        print(f"✅ CLEANUP COMPLETE. Resetting sessions for {email}.")
        print(f"👉 Please REFRESH your Dashboard and Student Quiz tabs now.")
        
    except Exception as e:
        print(f"❌ Database error: {e}")

if __name__ == "__main__":
    clear_profile("adam.amrid@um6p.ma")
