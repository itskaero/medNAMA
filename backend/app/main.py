"""FastAPI application entry point.

Defines HTTP API endpoints for authentication (login, registration, profiles),
book management, PDF ingestion, hybrid RAG query answering, and figure rendering.
"""

import os
import shutil
import tempfile
from pathlib import Path
from typing import Any

from fastapi import BackgroundTasks, Depends, FastAPI, File, HTTPException, UploadFile, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.generation import generate_answer, generate_mcq_explanation
from app.ingestion import ingest_book
from app.models import Book, Figure, User, MCQ, QuizAttempt
from app.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    require_admin,
    require_student_or_admin,
    rate_limiter,
)

# Initialize FastAPI app
app = FastAPI(title="medNAMA Core API", version="1.0.0")

# Enable CORS with explicit trusted origins (required for allow_credentials=True with HttpOnly cookies)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Custom HTTP middleware enforcing security headers (Proposal 11)
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "img-src 'self' data: http: https:; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com;"
    )
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


# Warm up models on application startup to avoid first-query cold-start delay
@app.on_event("startup")
def warmup_models():
    """Warm up and load both quantized embedding and reranker models on startup."""
    from app.ingestion import get_embedding_model
    from app.retrieval import get_reranker_model

    print("\n" + "="*60)
    print("WARMING UP QUANTIZED TEXT EMBEDDING MODEL...")
    _ = get_embedding_model()
    print("WARMING UP QUANTIZED CROSS-ENCODER RERANKER MODEL...")
    _ = get_reranker_model()
    print("Warmup complete. All models preloaded and INT8 quantized in RAM.")
    print("="*60 + "\n")


# Dependency to get db session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Pydantic schemas
class QueryRequest(BaseModel):
    query: str
    confidence_threshold: float = 0.55


class UserRegister(BaseModel):
    username: str
    password: str
    role: str = "student"


# Ingestion background task worker
def bg_ingest_worker(temp_pdf_path: str, filename: str, book_title: str):
    """Executes the ingestion pipeline in a background task."""
    try:
        ingest_book(temp_pdf_path, title=book_title)
    except Exception as e:
        print(f"Background ingestion of {filename} failed: {e}")
    finally:
        # Clean up temp file
        if os.path.exists(temp_pdf_path):
            try:
                os.remove(temp_pdf_path)
            except Exception as e:
                print(f"Failed to remove temp file {temp_pdf_path}: {e}")


# ======================== AUTHENTICATION ROUTING ========================

@app.post(
    "/api/auth/register",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limiter(limit=5, window=60))],
)
def register_user(user_in: UserRegister, db: Session = Depends(get_db)):
    """Registers a new user (defaults to student role)."""
    # Check duplicate
    existing = db.query(User).filter(User.username == user_in.username).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username is already taken.")

    if user_in.role not in ["student", "admin"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role specification.")

    hashed_pw = hash_password(user_in.password)
    user = User(username=user_in.username, password_hash=hashed_pw, role=user_in.role)
    db.add(user)
    db.commit()

    return {"message": "Registration successful.", "username": user.username, "role": user.role}


@app.post(
    "/api/auth/login",
    dependencies=[Depends(rate_limiter(limit=10, window=60))],
)
def login_user(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """Authenticates credentials, sets HttpOnly cookie, and returns credentials."""
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect username or password."
        )

    token = create_access_token(data={"sub": user.username})

    # Set access token inside secure HttpOnly cookie (Proposal 1)
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=False,  # In production, set to True when using HTTPS
        samesite="lax",
        max_age=3600 * 24, # 1 day expiration
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user.role,
        "username": user.username,
    }


@app.post("/api/auth/logout")
def logout_user(response: Response):
    """Logs out current session by deleting the HttpOnly cookie."""
    response.delete_cookie(key="access_token")
    return {"message": "Logged out successfully."}


@app.get("/api/auth/me")
def get_user_profile(current_user: User = Depends(get_current_user)):
    """Returns profile information for the authenticated user."""
    return {"username": current_user.username, "role": current_user.role}


# ======================== TEXTBOOK MANAGEMENT ========================

@app.get("/api/books")
def list_books(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student_or_admin)
):
    """List all textbooks stored in the database."""
    books = db.query(Book).order_by(Book.id.desc()).all()
    return [
        {
            "id": b.id,
            "title": b.title,
            "filename": b.filename,
            "status": b.status,
            "total_pages": b.total_pages,
            "error_message": b.error_message,
            "created_at": b.created_at,
        }
        for b in books
    ]


@app.delete("/api/books/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_book(
    book_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Delete a book and all associated chunks and figures from the database (Admin only)."""
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    db.delete(book)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post(
    "/api/ingest",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(rate_limiter(limit=5, window=60))],
)
def upload_and_ingest_book(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Uploads a PDF and spawns background ingestion (Admin only)."""
    # 1. Enforce content MIME type and extension limits (Proposal 10)
    if not file.filename.endswith(".pdf") or file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    content_size = 0
    temp_dir = tempfile.gettempdir()
    temp_file_path = os.path.join(temp_dir, f"medrag_upload_{os.urandom(8).hex()}.pdf")

    try:
        with open(temp_file_path, "wb") as buffer:
            while chunk := file.file.read(1024 * 1024):
                content_size += len(chunk)
                if content_size > max_bytes:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Upload exceeds maximum size limit of {settings.max_upload_size_mb}MB.",
                    )
                buffer.write(chunk)
    except HTTPException:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        raise
    except Exception as e:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        raise HTTPException(status_code=500, detail=f"File save error: {e}")

    # 2. Open PDF with pypdf to check if encrypted or corrupted (Proposal 10)
    from pypdf import PdfReader
    try:
        reader = PdfReader(temp_file_path)
        if reader.is_encrypted:
            raise HTTPException(status_code=400, detail="Encrypted/password-protected PDFs are not supported.")
        _ = len(reader.pages) # simple extraction check
    except HTTPException:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        raise
    except Exception as e:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        raise HTTPException(status_code=400, detail=f"Failed to read PDF. The file might be corrupted: {e}")

    existing = db.query(Book).filter(Book.filename == file.filename).first()
    if existing:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        raise HTTPException(status_code=400, detail="A book with this filename has already been uploaded.")

    title = Path(file.filename).stem.replace("-", " ").replace("_", " ").title()

    background_tasks.add_task(
        bg_ingest_worker,
        temp_pdf_path=temp_file_path,
        filename=file.filename,
        book_title=title,
    )

    return {"message": f"Book '{title}' uploaded. Ingestion started."}


# ======================== QUERYING & DIAGRAMS ========================

@app.post(
    "/api/query",
    dependencies=[Depends(rate_limiter(limit=15, window=60))],
)
def query_rag(
    request: QueryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student_or_admin)
):
    """Processes RAG question answering using hybrid search and DeepSeek."""
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    answer_json = generate_answer(
        session=db, query=request.query, confidence_threshold=request.confidence_threshold
    )
    return answer_json


@app.get("/api/figures/{figure_id}")
def get_figure_image(
    figure_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student_or_admin)
):
    """Serves raw diagram image bytes directly from database with correct content headers."""
    figure = db.query(Figure).filter(Figure.id == figure_id).first()
    if not figure:
        raise HTTPException(status_code=404, detail="Figure not found.")

    return Response(content=figure.image_data, media_type=figure.mime_type)


@app.get("/api/dashboard/stats")
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student_or_admin)
):
    """Returns general statistics and topic lists for the student/admin dashboard."""
    from sqlalchemy import func
    
    total_books = db.query(Book).count()
    total_mcqs = db.query(MCQ).count()
    total_quizzes_taken = db.query(QuizAttempt).filter(QuizAttempt.user_id == current_user.id).count()
    
    attempts = db.query(QuizAttempt).filter(
        QuizAttempt.user_id == current_user.id,
        QuizAttempt.score.isnot(None)
    ).all()
    
    avg_score = 0.0
    if attempts:
        avg_score = sum(a.score for a in attempts) / len(attempts)
        
    # Get distinct main_category, sub_category and their counts
    categories_query = db.query(
        MCQ.main_category,
        MCQ.sub_category,
        func.count(MCQ.id)
    ).group_by(MCQ.main_category, MCQ.sub_category).all()
    
    categories_map = {}
    for main, sub, count in categories_query:
        if not main or not sub:
            continue
        if main not in categories_map:
            categories_map[main] = []
        categories_map[main].append({"name": sub, "count": count})
        
    for main in categories_map:
        categories_map[main] = sorted(categories_map[main], key=lambda x: x["name"])
        
    categories_list = [
        {"main_category": main, "sub_categories": sub_list}
        for main, sub_list in sorted(categories_map.items())
    ]

    return {
        "total_books": total_books,
        "total_mcqs": total_mcqs,
        "total_quizzes_taken": total_quizzes_taken,
        "average_score": round(avg_score, 1),
        "categories": categories_list
    }


@app.post("/api/mcqs/{mcq_id}/explain")
def explain_mcq_endpoint(
    mcq_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student_or_admin)
):
    """On-demand RAG-grounded explanation generation and caching for a specific MCQ."""
    mcq = db.query(MCQ).filter(MCQ.id == mcq_id).first()
    if not mcq:
        raise HTTPException(status_code=404, detail="MCQ not found.")

    # Return cached explanation if present
    if mcq.explanation_markdown and mcq.explanation_markdown.strip() and mcq.status == "ready":
        return {
            "answer_markdown": mcq.explanation_markdown,
            "citations": mcq.explanation_citations or [],
            "figures": mcq.explanation_figures or []
        }

    # Generate and cache explanation
    explanation_data = generate_mcq_explanation(db, mcq)
    
    # Save cache back to DB
    mcq.explanation_markdown = explanation_data.get("answer_markdown")
    mcq.explanation_citations = explanation_data.get("citations")
    mcq.explanation_figures = explanation_data.get("figures")
    mcq.status = "ready"
    db.commit()

    return explanation_data
