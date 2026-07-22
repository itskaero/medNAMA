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
from sqlalchemy import func
from sqlalchemy.orm import Session

import json
from app.config import settings
from app.database import SessionLocal, engine
from app.generation import generate_answer, generate_mcq_explanation
from app.ingestion import ingest_book
from app.models import Base, Book, Figure, User, MCQ, QuizAttempt, AttemptAnswer, ChatConversation, ChatMessage, MCQBookmark, ConceptBookmark
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


# Enable CORS LAST so CORSMiddleware is the outermost middleware handling preflights & headers for all responses
raw_origins = [origin.strip().rstrip("/") for origin in settings.allowed_origins.split(",") if origin.strip()]
trusted_domains = [
    "https://med-nama.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
for d in trusted_domains:
    if d not in raw_origins:
        raw_origins.append(d)

app.add_middleware(
    CORSMiddleware,
    allow_origins=raw_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import logging
    logging.getLogger("uvicorn.error").error(f"Global unhandled exception: {exc}", exc_info=True)
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal Server Error: {str(exc)}"},
    )


# Warm up models on application startup to avoid first-query cold-start delay
@app.on_event("startup")
def warmup_models():
    """Build any missing database tables and warm up models on startup."""
    print("INITIALIZING DATABASE TABLES...")
    Base.metadata.create_all(bind=engine)
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


class ChatQueryRequest(BaseModel):
    query: str
    conversation_id: int | None = None
    confidence_threshold: float = 0.55


class ConceptBookmarkCreate(BaseModel):
    content: str
    book_title: str | None = None
    page_number: int | None = None
    source_context: str | None = None


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
    user = User(username=user_in.username, password_hash=hashed_pw, role="student")
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

    recent_attempts = []
    db_attempts = db.query(QuizAttempt).filter(
        QuizAttempt.user_id == current_user.id,
        QuizAttempt.score.isnot(None)
    ).order_by(QuizAttempt.completed_at.desc()).limit(5).all()

    for att in db_attempts:
        first_ans = db.query(AttemptAnswer).filter(AttemptAnswer.quiz_attempt_id == att.id).first()
        category_name = "General Practice"
        if first_ans:
            mcq = db.query(MCQ).filter(MCQ.id == first_ans.mcq_id).first()
            if mcq:
                category_name = mcq.sub_category or mcq.main_category or "General Practice"
        
        recent_attempts.append({
            "id": att.id,
            "started_at": att.started_at.isoformat() if att.started_at else None,
            "completed_at": att.completed_at.isoformat() if att.completed_at else None,
            "score": att.score,
            "total_questions": att.total_questions,
            "category": category_name
        })

    return {
        "total_books": total_books,
        "total_mcqs": total_mcqs,
        "total_quizzes_taken": total_quizzes_taken,
        "average_score": round(avg_score, 1),
        "categories": categories_list,
        "recent_attempts": recent_attempts
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


# ─── AI Quiz Generation System ───────────────────────────────────

class GenerateAiQuizRequest(BaseModel):
    prompt: str
    book_id: int | None = None
    page_number: int | None = None
    count: int | None = None


@app.post("/api/chat/generate-ai-quiz")
def generate_ai_quiz(
    req: GenerateAiQuizRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student_or_admin),
):
    """Generates custom board-style MCQs from textbook RAG context or page filters."""
    import re
    import uuid
    from app.retrieval import RetrievalService
    from openai import OpenAI

    prompt_text = req.prompt.strip()
    if not prompt_text:
        raise HTTPException(status_code=400, detail="Prompt cannot be empty.")

    # 1. Parse prompt for page number and count if not provided
    page_num = req.page_number
    if page_num is None:
        page_match = re.search(r"page\s*#?\s*(\d+)", prompt_text, re.IGNORECASE)
        if page_match:
            page_num = int(page_match.group(1))

    mcq_count = req.count or 5
    count_match = re.search(r"(\d+)\s*(?:questions?|mcqs?|items?)", prompt_text, re.IGNORECASE)
    if count_match:
        try:
            parsed_count = int(count_match.group(1))
            if 1 <= parsed_count <= 20:
                mcq_count = parsed_count
        except ValueError:
            pass

    # 2. Retrieve textbook context
    retrieved_chunks = []
    if page_num is not None:
        query = db.query(Chunk)
        if req.book_id:
            query = query.filter(Chunk.book_id == req.book_id)
        retrieved_chunks = query.filter(Chunk.page_number == page_num).all()

    if not retrieved_chunks:
        # Fallback to RAG vector search
        retrieval_srv = RetrievalService()
        retrieved_chunks = retrieval_srv.hybrid_search(db, query=prompt_text, limit=6, book_id=req.book_id)

    context_str = "\n\n".join(
        [
            f"[Book: {c.book.title if hasattr(c, 'book') and c.book else 'Textbook'} | Page: {c.page_number or 'N/A'}]\n{c.content}"
            for c in retrieved_chunks
        ]
    )

    if not context_str.strip():
        context_str = f"Topic: {prompt_text}"

    # 3. Prompt DeepSeek LLM with strict JSON schema
    system_prompt = (
        "You are an expert medical educator and board exam question writer. "
        "Generate high-yield, USMLE/board-style Multiple Choice Questions based strictly on the provided medical textbook context.\n"
        "Return ONLY valid JSON matching this exact structure:\n"
        "{\n"
        '  "quiz_title": "Short descriptive topic title",\n'
        '  "questions": [\n'
        "    {\n"
        '      "question_text": "Clinical vignette question stem...",\n'
        '      "options": {"A": "Choice A", "B": "Choice B", "C": "Choice C", "D": "Choice D"},\n'
        '      "correct_option": "A",\n'
        '      "explanation": "Detailed clinical reasoning explaining why the correct choice is right and others are incorrect.",\n'
        '      "source_book": "Book Title",\n'
        '      "source_page": 120\n'
        "    }\n"
        "  ]\n"
        "}"
    )

    user_prompt = (
        f"Generate {mcq_count} high-yield MCQs based on the following context and prompt:\n\n"
        f"USER PROMPT: {prompt_text}\n\n"
        f"TEXTBOOK CONTEXT:\n{context_str[:6000]}"
    )

    if not settings.deepseek_api_key or settings.deepseek_api_key == "sk-dummy":
        raise HTTPException(
            status_code=400,
            detail="DEEPSEEK_API_KEY environment variable is not configured on the server. Please set DEEPSEEK_API_KEY in Railway project settings."
        )

    client = OpenAI(
        api_key=settings.deepseek_api_key,
        base_url=settings.deepseek_base_url
    )

    try:
        completion = client.chat.completions.create(
            model=settings.deepseek_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
        )
        raw_res = completion.choices[0].message.content or "{}"
        quiz_data = json.loads(raw_res)
    except Exception as e:
        logger.error(f"AI Quiz Generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate quiz: {e}")

    quiz_title = quiz_data.get("quiz_title") or prompt_text[:40].title()
    questions = quiz_data.get("questions", [])

    if not questions:
        raise HTTPException(status_code=500, detail="LLM did not return valid question sets.")

    quiz_set_id = f"quiz_set_{uuid.uuid4().hex[:8]}"
    created_mcqs = []

    for item in questions:
        book_id = req.book_id
        page_ref = item.get("source_page") or page_num
        source_book_name = item.get("source_book") or "Medical Textbook"

        explanation_txt = item.get("explanation") or "No detailed explanation provided."
        if page_ref or source_book_name:
            explanation_txt += f"\n\n**Source**: {source_book_name}, Page {page_ref or 'N/A'}"

        mcq = MCQ(
            book_id=book_id,
            quiz_set_id=quiz_set_id,
            quiz_set_title=quiz_title,
            question_text=item.get("question_text", "Untitled Question"),
            options=item.get("options", {"A": "Option A", "B": "Option B", "C": "Option C", "D": "Option D"}),
            correct_option=item.get("correct_option", "A").upper(),
            topic=quiz_title,
            main_category="AI MCQs",
            sub_category=source_book_name,
            explanation_markdown=explanation_txt,
            status="ready",
        )
        db.add(mcq)
        created_mcqs.append(mcq)

    db.commit()

    return {
        "quiz_set_id": quiz_set_id,
        "quiz_set_title": quiz_title,
        "total_questions": len(created_mcqs),
        "mcqs": [
            {
                "id": m.id,
                "question_text": m.question_text,
                "options": m.options,
                "correct_option": m.correct_option,
                "topic": m.topic,
                "explanation_markdown": m.explanation_markdown,
            }
            for m in created_mcqs
        ],
    }


@app.get("/api/chat/ai-quizzes")
def get_ai_quizzes_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student_or_admin),
):
    """Returns list of distinct AI-generated quiz sets for user history."""
    results = (
        db.query(
            MCQ.quiz_set_id,
            MCQ.quiz_set_title,
            func.count(MCQ.id).label("question_count"),
            func.max(MCQ.topic).label("topic"),
        )
        .filter(MCQ.quiz_set_id != None)
        .group_by(MCQ.quiz_set_id, MCQ.quiz_set_title)
        .order_by(func.max(MCQ.id).desc())
        .all()
    )

    return [
        {
            "quiz_set_id": r.quiz_set_id,
            "quiz_set_title": r.quiz_set_title or "AI Quiz Set",
            "question_count": r.question_count,
            "topic": r.topic,
        }
        for r in results
    ]


@app.delete("/api/chat/ai-quizzes/{quiz_set_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ai_quiz_set(
    quiz_set_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student_or_admin),
):
    """Deletes all MCQs in a specific AI quiz set."""
    db.query(MCQ).filter(MCQ.quiz_set_id == quiz_set_id).delete(synchronize_session=False)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ─── Practice Quiz Management (Phase 11) ───────────────────────

class StartQuizRequest(BaseModel):
    quiz_set_id: str | None = None
    categories: list[str] | None = None
    sub_categories: list[str] | None = None
    num_questions: int = 10
    exclude_mastered: bool = False
    timer_mode: str = "none"                      # "none" | "session" | "per_question"
    timer_value: int | None = None                # minutes or seconds
    feedback_mode: str = "tutor"                  # "tutor" | "board"


class SelectedAnswer(BaseModel):
    mcq_id: int
    selected_option: str


class SubmitQuizRequest(BaseModel):
    answers: list[SelectedAnswer]


@app.post("/api/quizzes/start")
def start_quiz_endpoint(
    req: StartQuizRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student_or_admin)
):
    """Generates a randomized practice quiz, creates a QuizAttempt record, and returns the questions."""
    from sqlalchemy import func
    from app.models import AttemptAnswer, QuizAttempt
    
    query = db.query(MCQ)
    
    # Topic filters
    if req.quiz_set_id:
        query = query.filter(MCQ.quiz_set_id == req.quiz_set_id)
    elif req.sub_categories:
        query = query.filter(MCQ.sub_category.in_(req.sub_categories))
    elif req.categories:
        query = query.filter(MCQ.main_category.in_(req.categories))
        
    # Exclude mastered questions (answered correctly in any past attempt)
    if req.exclude_mastered:
        mastered_subquery = db.query(AttemptAnswer.mcq_id).join(
            QuizAttempt, QuizAttempt.id == AttemptAnswer.quiz_attempt_id
        ).filter(
            QuizAttempt.user_id == current_user.id,
            AttemptAnswer.is_correct == True
        ).subquery()
        query = query.filter(MCQ.id.notin_(mastered_subquery))
        
    mcqs = query.order_by(func.random()).limit(req.num_questions).all()
    
    if not mcqs:
        raise HTTPException(
            status_code=400,
            detail="No questions found matching the specified filters."
        )
        
    attempt = QuizAttempt(
        user_id=current_user.id,
        total_questions=len(mcqs),
        timer_mode=req.timer_mode,
        timer_value=req.timer_value,
        feedback_mode=req.feedback_mode
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    
    # Format questions (excluding deep explanation details initially)
    mcqs_data = []
    for m in mcqs:
        mcqs_data.append({
            "id": m.id,
            "question_text": m.question_text,
            "options": m.options,
            "correct_option": m.correct_option,
            "main_category": m.main_category,
            "sub_category": m.sub_category
        })
        
    return {
        "quiz_attempt_id": attempt.id,
        "mcqs": mcqs_data,
        "timer_mode": attempt.timer_mode,
        "timer_value": attempt.timer_value,
        "feedback_mode": attempt.feedback_mode
    }


@app.post("/api/quizzes/{attempt_id}/submit")
def submit_quiz_endpoint(
    attempt_id: int,
    req: SubmitQuizRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student_or_admin)
):
    """Scores a completed practice quiz, records individual choices, and saves results to the database."""
    from datetime import datetime
    
    attempt = db.query(QuizAttempt).filter(
        QuizAttempt.id == attempt_id,
        QuizAttempt.user_id == current_user.id
    ).first()
    
    if not attempt:
        raise HTTPException(
            status_code=404,
            detail="Quiz attempt session not found."
        )
        
    if attempt.completed_at is not None:
        raise HTTPException(
            status_code=400,
            detail="This quiz attempt has already been submitted and completed."
        )
        
    # Build a lookup dictionary of MCQs involved in the attempt to minimize DB queries
    mcq_ids = [ans.mcq_id for ans in req.answers]
    mcqs = db.query(MCQ).filter(MCQ.id.in_(mcq_ids)).all()
    mcq_map = {m.id: m for m in mcqs}
    
    correct_count = 0
    attempt_answers = []
    
    for ans in req.answers:
        mcq = mcq_map.get(ans.mcq_id)
        if not mcq:
            raise HTTPException(
                status_code=400,
                detail=f"Question with ID {ans.mcq_id} is invalid or not found."
            )
            
        selected_upper = ans.selected_option.upper().strip()
        correct_upper = mcq.correct_option.upper().strip()
        is_correct = (selected_upper == correct_upper)
        
        if is_correct:
            correct_count += 1
            
        ans_record = AttemptAnswer(
            quiz_attempt_id=attempt.id,
            mcq_id=mcq.id,
            selected_option=ans.selected_option,
            is_correct=is_correct
        )
        db.add(ans_record)
        attempt_answers.append(ans_record)
        
    attempt.score = correct_count
    attempt.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(attempt)
    
    return {
        "score": attempt.score,
        "total_questions": attempt.total_questions,
        "completed_at": attempt.completed_at
    }


@app.get("/api/quizzes/{attempt_id}")
def get_quiz_attempt(
    attempt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student_or_admin)
):
    """Retrieves the details of a previous quiz attempt, including all questions and selected answers."""
    attempt = db.query(QuizAttempt).filter(
        QuizAttempt.id == attempt_id,
        QuizAttempt.user_id == current_user.id
    ).first()
    
    if not attempt:
        raise HTTPException(status_code=404, detail="Quiz attempt not found.")
        
    answers = db.query(AttemptAnswer).filter(AttemptAnswer.quiz_attempt_id == attempt.id).all()
    
    mcqs_data = []
    selected_answers = {}
    
    for ans in answers:
        mcq = db.query(MCQ).filter(MCQ.id == ans.mcq_id).first()
        if mcq:
            mcqs_data.append({
                "id": mcq.id,
                "main_category": mcq.main_category,
                "sub_category": mcq.sub_category,
                "question_text": mcq.question_text,
                "options": mcq.options,
                "correct_option": mcq.correct_option
            })
            selected_answers[mcq.id] = ans.selected_option
            
    return {
        "id": attempt.id,
        "started_at": attempt.started_at.isoformat() if attempt.started_at else None,
        "completed_at": attempt.completed_at.isoformat() if attempt.completed_at else None,
        "score": attempt.score,
        "total_questions": attempt.total_questions,
        "questions": mcqs_data,
        "selected_answers": selected_answers,
        "timer_mode": attempt.timer_mode,
        "timer_value": attempt.timer_value,
        "feedback_mode": attempt.feedback_mode
    }


# ======================== CONVERSATIONAL CHAT HISTORY ========================

@app.post("/api/chat/query")
def chat_query_endpoint(
    req: ChatQueryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student_or_admin)
):
    """Conversational RAG query answering endpoint that tracks message logs in DB and maintains LLM memory context."""
    conv_id = req.conversation_id
    if not conv_id:
        # Create a new conversation and auto-title based on the query prefix
        words = req.query.strip().split()
        title_text = " ".join(words[:6]) + ("..." if len(words) > 6 else "")
        if not title_text:
            title_text = "New Conversation"
            
        conv = ChatConversation(user_id=current_user.id, title=title_text)
        db.add(conv)
        db.commit()
        db.refresh(conv)
        conv_id = conv.id
    else:
        conv = db.query(ChatConversation).filter(
            ChatConversation.id == conv_id,
            ChatConversation.user_id == current_user.id
        ).first()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation session not found.")

    # Retrieve message history to maintain conversational memory (last 10 turns max)
    db_messages = db.query(ChatMessage).filter(
        ChatMessage.conversation_id == conv_id
    ).order_by(ChatMessage.created_at.asc()).all()

    recent_db_messages = db_messages[-10:] if len(db_messages) > 10 else db_messages

    history = []
    for msg in recent_db_messages:
        if msg.role == "user":
            history.append({"role": "user", "content": msg.content or ""})
        elif msg.role == "ai":
            ans_text = ""
            if msg.answer_json:
                try:
                    ans_data = json.loads(msg.answer_json)
                    ans_text = ans_data.get("answer_markdown", "")
                except:
                    pass
            if not ans_text:
                ans_text = msg.content or ""
            history.append({"role": "assistant", "content": ans_text})

    # Call LLM generation pipeline
    answer_dict = generate_answer(
        session=db, 
        query=req.query, 
        confidence_threshold=req.confidence_threshold,
        history=history
    )

    # Save messages to database
    user_msg = ChatMessage(
        conversation_id=conv_id,
        role="user",
        content=req.query
    )
    db.add(user_msg)

    serialized_answer = json.dumps(answer_dict)
    ai_msg = ChatMessage(
        conversation_id=conv_id,
        role="ai",
        content=answer_dict.get("answer_markdown", ""),
        answer_json=serialized_answer
    )
    db.add(ai_msg)

    from datetime import datetime
    conv.updated_at = datetime.utcnow()
    db.commit()

    return {
        "conversation_id": conv_id,
        "conversation_title": conv.title,
        "answer": answer_dict
    }


@app.get("/api/chat/conversations")
def get_user_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student_or_admin)
):
    """Returns the user's active chat conversations list ordered by recent updates."""
    conversations = db.query(ChatConversation).filter(
        ChatConversation.user_id == current_user.id
    ).order_by(ChatConversation.updated_at.desc()).all()
    
    return [
        {
            "id": c.id,
            "title": c.title,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None
        }
        for c in conversations
    ]


@app.get("/api/chat/conversations/{conversation_id}")
def get_conversation_history(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student_or_admin)
):
    """Retrieves all chat messages for a specific conversation session."""
    conv = db.query(ChatConversation).filter(
        ChatConversation.id == conversation_id,
        ChatConversation.user_id == current_user.id
    ).first()
    
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")
        
    db_messages = db.query(ChatMessage).filter(
        ChatMessage.conversation_id == conversation_id
    ).order_by(ChatMessage.created_at.asc()).all()
    
    formatted_messages = []
    for msg in db_messages:
        answer_data = None
        if msg.answer_json:
            try:
                answer_data = json.loads(msg.answer_json)
            except:
                pass
                
        formatted_messages.append({
            "id": f"msg-{msg.id}",
            "type": "user" if msg.role == "user" else ("error" if msg.role == "error" else "ai"),
            "content": msg.content,
            "answer": answer_data,
            "timestamp": msg.created_at.strftime("%I:%M %p") if msg.created_at else None
        })
        
    return {
        "id": conv.id,
        "title": conv.title,
        "messages": formatted_messages
    }


@app.delete("/api/chat/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student_or_admin)
):
    """Deletes a chat conversation thread and all its messages."""
    conv = db.query(ChatConversation).filter(
        ChatConversation.id == conversation_id,
        ChatConversation.user_id == current_user.id
    ).first()
    
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")
        
    db.delete(conv)
    db.commit()
    
    return {"message": "Conversation deleted successfully."}


# ======================== MCQ BANK & BOOKMARKS ========================

@app.get("/api/mcqs")
def get_all_mcqs(
    category: str | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student_or_admin)
):
    """Retrieves list of all MCQs inside the database with category filters, searches, and bookmark indicators."""
    query = db.query(MCQ)
    if category and category != "all":
        query = query.filter(MCQ.main_category == category)
    if search:
        query = query.filter(MCQ.question_text.ilike(f"%{search}%"))
        
    mcqs = query.limit(100).all()
    
    # Fetch user's bookmarked MCQ IDs
    bookmarks = db.query(MCQBookmark.mcq_id).filter(MCQBookmark.user_id == current_user.id).all()
    bookmarked_ids = {b[0] for b in bookmarks}
    
    return [
        {
            "id": m.id,
            "main_category": m.main_category,
            "sub_category": m.sub_category,
            "question_text": m.question_text,
            "options": m.options,
            "correct_option": m.correct_option,
            "bookmarked": m.id in bookmarked_ids
        }
        for m in mcqs
    ]


@app.post("/api/bookmarks/mcq/{mcq_id}")
def toggle_mcq_bookmark(
    mcq_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student_or_admin)
):
    """Toggles bookmark status of an MCQ for the current student."""
    mcq = db.query(MCQ).filter(MCQ.id == mcq_id).first()
    if not mcq:
        raise HTTPException(status_code=404, detail="MCQ not found.")
        
    existing = db.query(MCQBookmark).filter(
        MCQBookmark.user_id == current_user.id,
        MCQBookmark.mcq_id == mcq_id
    ).first()
    
    if existing:
        db.delete(existing)
        db.commit()
        return {"bookmarked": False}
    else:
        bookmark = MCQBookmark(user_id=current_user.id, mcq_id=mcq_id)
        db.add(bookmark)
        db.commit()
        return {"bookmarked": True}


@app.get("/api/bookmarks/mcq")
def get_mcq_bookmarks(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student_or_admin)
):
    """Returns the list of questions bookmarked by the user."""
    bookmarks = db.query(MCQBookmark).filter(MCQBookmark.user_id == current_user.id).all()
    return [
        {
            "id": b.mcq.id,
            "main_category": b.mcq.main_category,
            "sub_category": b.mcq.sub_category,
            "question_text": b.mcq.question_text,
            "options": b.mcq.options,
            "correct_option": b.mcq.correct_option,
            "bookmarked": True
        }
        for b in bookmarks if b.mcq
    ]


@app.post("/api/bookmarks/concept")
def create_concept_bookmark(
    req: ConceptBookmarkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student_or_admin)
):
    """Creates a persistent bookmark for textbook lines, RAG chatbot answers, or question concepts."""
    if not req.content.strip():
        raise HTTPException(status_code=400, detail="Content cannot be empty.")
        
    bookmark = ConceptBookmark(
        user_id=current_user.id,
        content=req.content,
        book_title=req.book_title,
        page_number=req.page_number,
        source_context=req.source_context
    )
    db.add(bookmark)
    db.commit()
    db.refresh(bookmark)
    return {
        "id": bookmark.id,
        "content": bookmark.content,
        "book_title": bookmark.book_title,
        "page_number": bookmark.page_number,
        "source_context": bookmark.source_context,
        "created_at": bookmark.created_at.isoformat()
    }


@app.get("/api/bookmarks/concept")
def get_concept_bookmarks(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student_or_admin)
):
    """Lists all the saved textbook concepts, citation selections, or RAG answers."""
    bookmarks = db.query(ConceptBookmark).filter(
        ConceptBookmark.user_id == current_user.id
    ).order_by(ConceptBookmark.created_at.desc()).all()
    
    return [
        {
            "id": b.id,
            "content": b.content,
            "book_title": b.book_title,
            "page_number": b.page_number,
            "source_context": b.source_context,
            "created_at": b.created_at.strftime("%b %d, %Y %I:%M %p") if b.created_at else None
        }
        for b in bookmarks
    ]


@app.delete("/api/bookmarks/concept/{bookmark_id}")
def delete_concept_bookmark(
    bookmark_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student_or_admin)
):
    """Deletes a saved concept/text bookmark."""
    bookmark = db.query(ConceptBookmark).filter(
        ConceptBookmark.id == bookmark_id,
        ConceptBookmark.user_id == current_user.id
    ).first()
    if not bookmark:
        raise HTTPException(status_code=404, detail="Bookmark not found.")
    db.delete(bookmark)
    db.commit()
    return {"message": "Concept bookmark deleted successfully."}


# ======================== DETAILED TELEMETRY STATS ========================

@app.get("/api/dashboard/detailed-stats")
def get_detailed_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student_or_admin)
):
    """Fetches comprehensive mock attempts stats, category accuracies, and attempt trends for Chart.js dashboard charts."""
    attempts = db.query(QuizAttempt).filter(
        QuizAttempt.user_id == current_user.id,
        QuizAttempt.completed_at != None
    ).order_by(QuizAttempt.started_at.asc()).all()
    
    total_attempts = len(attempts)
    if total_attempts == 0:
        return {
            "total_attempts": 0,
            "avg_accuracy": 0,
            "total_questions": 0,
            "history_trend": [],
            "category_breakdown": {}
        }
        
    total_score = sum(a.score for a in attempts if a.score)
    total_questions = sum(a.total_questions for a in attempts if a.total_questions)
    avg_accuracy = round((total_score / total_questions) * 100, 1) if total_questions > 0 else 0
    
    # Accuracy trend over time (last 15 completed mock sessions)
    trend = []
    for a in attempts[-15:]:
        acc = round((a.score / a.total_questions) * 100, 1) if a.total_questions and a.total_questions > 0 else 0
        date_str = a.started_at.strftime("%b %d") if a.started_at else "N/A"
        trend.append({
            "attempt_id": a.id,
            "date": date_str,
            "accuracy": acc,
            "score": a.score,
            "total": a.total_questions
        })
        
    # Group and count correct answers and totals per subject category
    category_breakdown = {}
    answers_query = db.query(AttemptAnswer.is_correct, MCQ.main_category).join(
        MCQ, MCQ.id == AttemptAnswer.mcq_id
    ).join(
        QuizAttempt, QuizAttempt.id == AttemptAnswer.quiz_attempt_id
    ).filter(
        QuizAttempt.user_id == current_user.id,
        QuizAttempt.completed_at != None
    ).all()
    
    for is_correct, cat in answers_query:
        category_name = cat if cat else "General"
        if category_name not in category_breakdown:
            category_breakdown[category_name] = {"correct": 0, "total": 0}
        category_breakdown[category_name]["total"] += 1
        if is_correct:
            category_breakdown[category_name]["correct"] += 1
            
    formatted_breakdown = {}
    for cat, stats in category_breakdown.items():
        formatted_breakdown[cat] = {
            "total_questions": stats["total"],
            "correct_answers": stats["correct"],
            "accuracy": round((stats["correct"] / stats["total"]) * 100, 1)
        }
        
    return {
        "total_attempts": total_attempts,
        "avg_accuracy": avg_accuracy,
        "total_questions": total_questions,
        "history_trend": trend,
        "category_breakdown": formatted_breakdown
    }




