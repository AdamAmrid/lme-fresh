
import sqlite3
import pandas as pd

conn = sqlite3.connect('lme.db')
query = "SELECT type, module, current_question_text, is_correct, current_score, timestamp FROM telemetry_logs WHERE student_id = 'adam.amrid@um6p.ma' ORDER BY timestamp DESC LIMIT 20"
df = pd.read_sql(query, conn)
print(df.to_string())
conn.close()
