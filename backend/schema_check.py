import sqlite3
import pandas as pd

conn = sqlite3.connect('lme.db')
cursor = conn.cursor()
cursor.execute("PRAGMA table_info(telemetry_logs);")
columns = cursor.fetchall()
print("Columns in telemetry_logs:")
for col in columns:
    print(f"- {col[1]}")

conn.close()
