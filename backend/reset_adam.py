import sqlite3
import os

# Path to the database
DB_PATH = 'lme.db'
ADAM_ID = 'adam.amrid@um6p.ma'

if not os.path.exists(DB_PATH):
    print(f"❌ Error: Could not find database at {DB_PATH}. Please run this script from the backend directory.")
    exit(1)

print(f"🚀 Initiating Nuclear Reset for {ADAM_ID}...")

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

try:
    # 1. Delete all telemetry logs
    cursor.execute("DELETE FROM telemetry_logs WHERE student_id = ?", (ADAM_ID,))
    print(f"✅ Deleted {cursor.rowcount} telemetry logs.")

    # 2. Delete the user account record
    cursor.execute("DELETE FROM users WHERE email = ?", (ADAM_ID,))
    print(f"✅ Deleted user account record.")

    conn.commit()
    print("\n✨ Database synchronized successfully.")
except Exception as e:
    print(f"❌ Database error: {e}")
    conn.rollback()
finally:
    conn.close()

print("\n🌟 Reset Complete. You can now re-register your account and perform a clean test!")
