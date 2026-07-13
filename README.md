# medNAMA - Clinical Knowledge & Practice Assistant

medNAMA is a clinical-first, evidence-based Retrieval-Augmented Generation (RAG) platform and board exam practice quiz environment. Designed specifically for healthcare professionals and medical students, the application cross-references queries against verified textbook libraries to retrieve grounded clinical answers with inline footnotes, relevant medical figures, and interactive board practice questions.

---

## Application Preview

![medNAMA Landing Dashboard](backend/screenshots/dashboard.png)
*Landing Dashboard showing Reference Library statistics, active MCQ categories, and Practice Explorer.*

![medNAMA Textbook Q&A Chat Workspace](backend/screenshots/RAG.png)
*Evidence-based textbook search interface with inline citations and collapsible references.*

![medNAMA Diagnostic Chat Thread](backend/screenshots/RAG2.png)
*Interactive diagnostic chat thread illustrating clinical response synthesis, citations drawer, and diagram gallery drawers.*

---

## Key Features

*   **Evidence-Based RAG Q&A**: Ask complex diagnostic or treatment queries and receive answers synthesized by AI, grounded strictly in uploaded reference textbooks.
*   **Inline Footnotes & Citations**: Every medical claim is cited inline referencing the exact book title and page number (e.g. `[Snell's Clinical Anatomy, Page 120]`), accompanied by collapsible quotation drawer verification.
*   **Diagram & Figure Drawer Extraction**: Dynamically retrieves and displays high-resolution diagrams, figures, and charts linked to the context of the medical topic.
*   **Grouped Board MCQ Practice**: Self-assess medical knowledge with **12,717 pre-loaded board questions** structured under a primary and sub-category clinical hierarchy (e.g., *Part 1 Basic Sciences -> Microbiology*, *Part 2 Clinical Specializations -> Surgery - General Surgery*).
*   **On-Demand Explanation Engine**: Cost-efficient, RAG-grounded explanations are synthesized and cached in the database on-demand whenever a user clicks "Explain" on a board question.
*   **Clinical Dark Mode Interface**: Built using modern aesthetics optimized for clinical environments (high-contrast ratios, Inter body typeface, Instrument Serif academic headings, and custom EKG pulse animation overlays).

---

## Tech Stack & Architecture

### Frontend (User Interface)
*   **Core**: Next.js 16+ (App Router), React, and TypeScript.
*   **Styling**: Tailwind CSS v4 (CSS-first approach) with a clinical-dark color palette.
*   **Icons**: Lucide React.
*   **Font Pairing**: `Instrument Serif` (headers) + `Inter` (body copy) + `JetBrains Mono` (page numbers/data).

### Backend (API & Diagnostic Engine)
*   **Framework**: FastAPI (Python 3.11+).
*   **Database**: PostgreSQL with `pgvector` extension for vector search.
*   **ORM**: SQLAlchemy with transaction-safe connection pooling.
*   **Semantic Vector Embedding**: `BAAI/bge-large-en-v1.5` (1024-dimensional, preloaded and quantized in RAM on startup).
*   **Reranking**: `BAAI/bge-reranker-large` Cross-Encoder (reranks retrieved segments to pick the top 5 most relevant contexts).
*   **Synthesis LLM**: DeepSeek API (compares textbook context to formulate clinical answers).

---

## Project Structure

```
medNAMA/
├── backend/
│   ├── app/
│   │   ├── auth.py           # JWT Authentication, rate limiting, and RBAC
│   │   ├── config.py         # App settings and environment variables
│   │   ├── database.py       # SQLAlchemy engine and session factories
│   │   ├── generation.py     # RAG text synthesis and verification engine
│   │   ├── ingestion.py      # PDF parser, image extraction, and chunk indexer
│   │   ├── main.py           # API endpoints (Q&A, stats, figures, library)
│   │   ├── models.py         # SQLAlchemy database models
│   │   └── retrieval.py      # Hybrid Vector + BM25 keyword search service
│   ├── scripts/
│   │   ├── seed_mcqs.py      # MCQ extraction, categorization, and ingestion
│   │   ├── test_rag_queries.py # RAG validation query suite
│   │   └── update_db_schema.py# PostgreSQL schema migration utility
│   └── requirements.txt      # Python dependencies
├── frontend/
│   ├── src/app/
│   │   ├── globals.css       # Custom clinical variables and animations
│   │   ├── layout.tsx        # Next.js global meta structure
│   │   └── page.tsx          # Dashboard, Q&A Chat, and Quiz interfaces
│   ├── package.json          # Node.js dependencies
│   └── next.config.ts        # Next.js build configurations
├── mcqs/                     # 123 Board MCQ files structured in sub-folders
└── schema.sql                # Complete SQL database reference schema
```

---

## Database Schema Overview

Programmatically managed via SQLAlchemy, the platform operates on 7 core tables:
1.  **`books`**: Tracks uploaded medical reference textbooks and processing states (`pending`, `processing`, `ready`, `failed`).
2.  **`chunks`**: Stores raw textbook page segments, page numbers, metadata, and high-dimensional vector embeddings.
3.  **`figures`**: Stores binary diagram image data, captions, page numbers, and MIME types.
4.  **`users`**: Manages credentials and roles (`student`, `admin`).
5.  **`mcqs`**: Stores board questions, option blocks, correct letters, main/sub-categories, and RAG-grounded explanations.
6.  **`quiz_attempts`**: Records test session logs, starting/completion times, and student scores.
7.  **`attempt_answers`**: Links specific attempt records to chosen options and correctness statuses.

---

## Local Installation & Setup

### Prerequisites
*   Python 3.11+
*   Node.js 18+
*   PostgreSQL (with `vector` extension installed)

### 1. Database Setup
Create a PostgreSQL database and install the vector extension:
```sql
CREATE DATABASE medrag;
\c medrag
CREATE EXTENSION IF NOT EXISTS vector;
```

### 2. Backend Installation
1.  Navigate to the backend folder:
    ```bash
    cd backend
    ```
2.  Create and activate a virtual environment:
    ```bash
    python -m venv venv
    # Windows
    .\venv\Scripts\activate
    # macOS/Linux
    source venv/bin/activate
    ```
3.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
4.  Create a `.env` file in the root project directory (see `.env.example`):
    ```env
    DATABASE_URL=postgresql://username:password@localhost:5433/medrag
    DEEPSEEK_API_KEY=your_deepseek_api_key_here
    JWT_SECRET=your_jwt_secret_here
    ```
5.  Migrate the schema and seed the MCQ bank:
    ```bash
    python scripts/update_db_schema.py
    python scripts/seed_mcqs.py
    ```
6.  Launch the FastAPI server:
    ```bash
    python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
    ```

### 3. Frontend Installation
1.  Navigate to the frontend folder:
    ```bash
    cd ../frontend
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Launch the Next.js development server:
    ```bash
    npm run dev
    ```
4.  Access the web application at **`http://localhost:3000`**.

---

## Ingesting Reference Textbooks
1.  Sign in as an `admin` role user.
2.  In the reference sidebar, click **Upload Textbook**.
3.  Select a PDF textbook (e.g., *Snell's Clinical Anatomy*).
4.  The backend triggers an asynchronous pipeline:
    *   Extracts raw page text via `pdfplumber`.
    *   Extracts diagram figures and uses the Gemini API to write descriptive captions.
    *   Segments text into overlapping semantic blocks.
    *   Encodes segments into vectors and loads them into PostgreSQL.
    *   Pulls figure associations and marks the book as `ready`.

---

## Security & Rate Limiting
*   **Role-Based Access Control (RBAC)**: Enforces `admin`-only privileges for deleting/uploading textbooks, and `student`-level privileges for taking quizzes and executing Q&A queries.
*   **Cookie Authentication**: Secure `HttpOnly` JWT cookie tracking prevents client-side token spoofing.
*   **IP-Based Rate Limiting**: Limit API abuses (10 login queries/min, 15 RAG queries/min) via sliding-window rate limiters.
