import sqlite3
import os

db_path = 'lme.db'
if not os.path.exists(db_path):
    print(f"Error: Database not found at {db_path}")
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        # Get table names
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        print(f"Tables: {tables}")
        
        for table in tables:
            print(f"\n--- Table: {table[0]} ---")
            cursor.execute(f"PRAGMA table_info({table[0]})")
            print(f"Columns: {cursor.fetchall()}")
            cursor.execute(f"SELECT * FROM {table[0]}")
            rows = cursor.fetchall()
            for row in rows:
                print(row)
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()
