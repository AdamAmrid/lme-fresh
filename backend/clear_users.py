import sys
import os
from database import SessionLocal
from models.learner_state import User

def clear_all_users():
    db = SessionLocal()
    try:
        deleted_count = db.query(User).delete()
        db.commit()
        print(f"Successfully deleted {deleted_count} users from the database.")
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    clear_all_users()
