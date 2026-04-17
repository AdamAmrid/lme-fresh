import sqlite3

conn = sqlite3.connect('lme.db')
cur = conn.cursor()

# Delete telemetry logs first
cur.execute("DELETE FROM telemetry_logs WHERE student_name LIKE '%Adam%' OR student_name LIKE '%101%'")
print(f"Deleted {cur.rowcount} telemetry rows")

# Delete users
cur.execute("DELETE FROM users WHERE email LIKE '%student101%' OR name LIKE '%Adam%'")
print(f"Deleted {cur.rowcount} users")

conn.commit()
conn.close()
print("Done! Restart the backend server now.")
