import sqlite3
import pandas as pd

conn = sqlite3.connect("backend/lme.db")
df = pd.read_sql("SELECT student_id, student_name FROM telemetry_logs LIMIT 10", conn)
print(df)
conn.close()
