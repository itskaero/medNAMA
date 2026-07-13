"""Seeding script to create default test users (admin and student)."""

import sys
from pathlib import Path

# Allow running from backend/ folder
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal
from app.models import User
from app.auth import hash_password


def seed_users():
    session = SessionLocal()
    try:
        # 1. Seed Admin
        admin = session.query(User).filter(User.username == "admin").first()
        if not admin:
            hashed_admin = hash_password("admin123")
            admin_user = User(username="admin", password_hash=hashed_admin, role="admin")
            session.add(admin_user)
            print("OK: Default admin user seeded: username='admin', password='admin123'")
        else:
            print("- Admin user already exists. Skipping.")

        # 2. Seed Student
        student = session.query(User).filter(User.username == "student").first()
        if not student:
            hashed_student = hash_password("student123")
            student_user = User(username="student", password_hash=hashed_student, role="student")
            session.add(student_user)
            print("OK: Default student user seeded: username='student', password='student123'")
        else:
            print("- Student user already exists. Skipping.")

        session.commit()
    except Exception as e:
        session.rollback()
        print(f"Error seeding users: {e}")
    finally:
        session.close()


if __name__ == "__main__":
    seed_users()
