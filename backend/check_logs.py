import pandas as pd
from sqlalchemy import create_engine

# Path to the database
DB_PATH = 'sqlite:///lme.db'
ADAM_ID = 'adam.amrid@um6p.ma'

print(f"🔍 Analyzing logs for {ADAM_ID}...\n")

engine = create_engine(DB_PATH)
try:
    df = pd.read_sql(f"SELECT timestamp, type, current_question_text, answered_count, total_hints_requested, module FROM telemetry_logs WHERE student_id = '{ADAM_ID}' ORDER BY timestamp", engine)
    
    if df.empty:
        print("❌ No logs found for this user.")
        exit()

    # Apply the same session boundary logic as the dashboard
    df['datetime'] = pd.to_datetime(df['timestamp'], format='mixed', utc=True)
    boundary = (df['type'].shift() == 'session_complete') | \
               (df['datetime'].diff() > pd.Timedelta(minutes=5)) | \
               (df['module'] != df['module'].shift())
    boundary.iloc[0] = False
    df['session_idx'] = boundary.cumsum() + 1

    print(f"{'TIMESTAMP':<25} | {'SESS':<4} | {'ANS':<3} | {'HINTS':<5} | {'QUESTION'}")
    print("-" * 80)
    for _, row in df.iterrows():
        print(f"{str(row['timestamp']):<25} | {row['session_idx']:<4} | {row['answered_count']:<3} | {row['total_hints_requested']:<5} | {row['current_question_text']}")

    # Calculate final stats per session
    print("\n📈 SESSION SUMMARY (Hint Dependency Calculation):")
    summary = df.groupby('session_idx')[['answered_count', 'total_hints_requested']].max()
    for sess, row in summary.iterrows():
        rate = row['total_hints_requested'] / max(1, row['answered_count'])
        print(f"Session {sess}: {row['total_hints_requested']} hints / {row['answered_count']} questions = {rate:.2f} dependency")

except Exception as e:
    print(f"❌ Error during diagnosis: {e}")
