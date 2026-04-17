import sqlite3
import os

db_path = os.path.join(os.getcwd(), 'lme.db')
if not os.path.exists(db_path):
    print(f"Error: Database not found at {db_path}")
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, email, role, name FROM users")
        users = cursor.fetchall()
        for user in users:
            print(f"ID: {user[0]} | Email: {user[1]} | Role: {user[2]} | Name: {user[3]}")
    except sqlite3.OperationalError as e:
        print(f"Error querying database: {e}")
    finally:
        conn.close()
