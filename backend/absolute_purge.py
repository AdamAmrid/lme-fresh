import sqlite3
import os

def absolute_purge():
    # Target lme.db in the backend folder
    db_path = "lme.db"
    
    if not os.path.exists(db_path):
        db_path = os.path.join("..", "lme.db")
        
    if not os.path.exists(db_path):
        # Local system absolute path check
        db_path = "c:\\Users\\Adam\\OneDrive - Université Mohammed VI Polytechnique\\Bureau\\Internship\\Learner_Profiling_Analytics\\learner-modeling-engine\\backend\\lme.db"

    if not os.path.exists(db_path):
        print(f"❌ Error: Database not found.")
        return

    print(f"📂 Cleaning Database: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 1. Find all possible user records for Adam
    cursor.execute("SELECT id, email, name FROM users WHERE email LIKE '%adam%' OR name LIKE '%Adam%'")
    aliases = cursor.fetchall()
    
    identifiers = set(["adam.amrid@um6p.ma"]) # Always include target email
    names = set(["Adam Amrid"]) # Always include target name
    
    for uid, email, name in aliases:
        if uid: identifiers.add(str(uid))
        if email: identifiers.add(email)
        if name: names.add(name)

    print(f"🔍 Identifiers found: {identifiers}")
    print(f"🔍 Names found: {names}")

    # 2. Count before deletion
    total_to_delete = 0
    for ident in identifiers:
        cursor.execute("SELECT COUNT(*) FROM telemetry_logs WHERE student_id = ?", (ident,))
        total_to_delete += cursor.fetchone()[0]
    
    for n in names:
        # Check by student_name column too, just in case
        cursor.execute("SELECT COUNT(*) FROM telemetry_logs WHERE student_name = ?", (n,))
        total_to_delete += cursor.fetchone()[0]

    if total_to_delete == 0:
        print("✨ No logs found for these terms. Database is already clean.")
        conn.close()
        return

    print(f"🔥 Found {total_to_delete} total log entries. Purging everything...")

    # 3. The Purge
    for ident in identifiers:
        cursor.execute("DELETE FROM telemetry_logs WHERE student_id = ?", (ident,))
    
    for n in names:
        cursor.execute("DELETE FROM telemetry_logs WHERE student_name = ?", (n,))

    conn.commit()
    conn.close()
    
    print(f"✅ DONE. {total_to_delete} rows vaporized.")
    print("🚀 REFRESH YOUR BROWSER NOW.")

if __name__ == "__main__":
    absolute_purge()
