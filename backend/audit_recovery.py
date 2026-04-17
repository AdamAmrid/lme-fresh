import pandas as pd
from sqlalchemy import create_engine

# Path to the database
DB_PATH = 'sqlite:///lme.db'
ADAM_ID = 'adam.amrid@um6p.ma'

print(f"🕵️‍♂️ Auditing Recovery Events for {ADAM_ID}...\n")

engine = create_engine(DB_PATH)
try:
    df = pd.read_sql(f"SELECT timestamp, type, current_question_text, learner_state, is_correct, total_hints_requested, module FROM telemetry_logs WHERE student_id = '{ADAM_ID}' ORDER BY timestamp", engine)
    
    if df.empty:
        print("❌ No logs found.")
        exit()

    # Apply session boundary logic
    df['datetime'] = pd.to_datetime(df['timestamp'], format='mixed', utc=True)
    is_not_lobby_switch = (~df['module'].shift().isin(['In Lobby', 'None', '', None]))
    boundary = (df['type'].shift() == 'session_complete') | \
               (df['datetime'].diff() > pd.Timedelta(minutes=5)) | \
               ((df['module'] != df['module'].shift()) & is_not_lobby_switch)
    boundary.iloc[0] = False
    df['session_idx'] = boundary.cumsum() + 1

    recovery_count = 0
    print(f"{'TIMESTAMP':<25} | {'SESS':<4} | {'STATE CHANGE':<25} | {'QUESTION'}")
    print("-" * 90)

    for s_idx in sorted(df['session_idx'].unique()):
        sdf = df[df['session_idx'] == s_idx].copy()
        sdf['hints_at_q_start'] = sdf.groupby('current_question_text')['total_hints_requested'].transform('first')
        sdf = sdf.reset_index(drop=True)
        recovered_questions = set()
        
        for i in range(len(sdf) - 1):
            row_n = sdf.iloc[i]
            row_n1 = sdf.iloc[i + 1]
            q_text = str(row_n1['current_question_text'])
            
            # Match the refined logic in analytics.py
            if (row_n['learner_state'] == 'Struggling'
                    and row_n1['learner_state'] == 'Engaged'
                    and bool(row_n1['is_correct'])
                    and row_n1['total_hints_requested'] == row_n1['hints_at_q_start']
                    and q_text not in recovered_questions):
                
                recovery_count += 1
                recovered_questions.add(q_text)
                print(f"{str(row_n1['timestamp']):<25} | {s_idx:<4} | {'STRUGGLE -> ENGAGED':<25} | {q_text}")

    print(f"\n✅ TOTAL RECOVERY EVENTS DETECTED: {recovery_count}")
    print("\n(Note: The logic now caps at 1 recovery per unique question per session.)")

except Exception as e:
    print(f"❌ Error: {e}")
