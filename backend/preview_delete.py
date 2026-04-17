import sqlite3

conn = sqlite3.connect('lme.db')
cur = conn.cursor()

print("=== USERS TO DELETE ===")
cur.execute("SELECT id, email, name FROM users WHERE email LIKE '%student101%' OR name LIKE '%Adam%'")
for r in cur.fetchall():
    print(r)

print()
print("=== TELEMETRY ROWS TO DELETE ===")
cur.execute("SELECT student_id, student_name, COUNT(*) FROM telemetry_logs WHERE student_name LIKE '%Adam%' OR student_name LIKE '%101%' GROUP BY student_id, student_name")
for r in cur.fetchall():
    print(r)

conn.close()
