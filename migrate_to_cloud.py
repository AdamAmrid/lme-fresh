import sqlite3
import os
import pandas as pd
from sqlalchemy import create_engine
from dotenv import load_dotenv

load_dotenv()

# 1. Connect to Local DB
local_conn = sqlite3.connect("backend/lme.db")

# 2. Connect to Cloud DB
# Use the DATABASE_URL or POSTGRES_URL from your .env
cloud_url = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL")
if not cloud_url:
    print("ERROR: No cloud database URL found in .env!")
    exit()

if cloud_url.startswith("postgres://"):
    cloud_url = cloud_url.replace("postgres://", "postgresql://", 1)

cloud_engine = create_engine(cloud_url)

TABLES = ['users', 'telemetry_logs']

print(f"Starting Migration to: {cloud_url[:20]}...")

for table in TABLES:
    try:
        print(f"Migrating table: {table}...")
        # Read local data
        df = pd.read_sql(f"SELECT * FROM {table}", local_conn)
        
        if table == 'telemetry_logs' and 'is_correct' in df.columns:
            # Postgres needs real Booleans, not 1/0
            df['is_correct'] = df['is_correct'].astype(bool)

        # Push to cloud
        # We use a loop for users to avoid the 'UniqueViolation' crash
        if table == 'users':
            success_count = 0
            for _, row in df.iterrows():
                try:
                    row_df = pd.DataFrame([row])
                    row_df.to_sql(table, cloud_engine, if_exists='append', index=False)
                    success_count += 1
                except Exception:
                    pass # Skip if user already exists
            print(f"DONE: {success_count} new users added (others already existed).")
        else:
            df.to_sql(table, cloud_engine, if_exists='append', index=False, chunksize=100)
            print(f"SUCCESS: {len(df)} rows migrated for {table}.")
            
    except Exception as e:
        print(f"FAILED to migrate {table}: {e}")

local_conn.close()
print("\nMigration Complete! Refresh your Vercel website now.")
