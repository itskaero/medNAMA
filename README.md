# medNAMA - Clinical Knowledge & Practice Assistant

medNAMA is a clinical-first, evidence-based Retrieval-Augmented Generation (RAG) platform and board exam practice quiz environment. Designed specifically for healthcare professionals and medical students, the application cross-references queries against verified medical reference textbooks to retrieve grounded clinical answers with inline footnotes, relevant medical figures, and interactive board practice questions.

---

## Key Features

- **Evidence-Based RAG Q&A Engine**: Ask complex diagnostic or treatment queries and receive answers synthesized by AI, grounded strictly in uploaded reference textbooks.
- **Inline Footnotes & Citations**: Every medical claim is cited inline referencing the exact book title and page number (e.g. `[Snell's Clinical Anatomy, Page 120]`), accompanied by collapsible quotation drawer verification.
- **Diagram & Figure Extraction**: Dynamically retrieves and displays high-resolution diagrams, figures, and anatomical charts linked to the context of the medical topic.
- **Interactive Mock Builder**:
  - **Manual Mode**: Select specific subjects and subtopics from a **12,717 pre-loaded board question bank**.
  - **AI MCQs Mode**: Generate tailored custom practice sets using natural language prompts grounded in selected medical textbooks.
  - **Quiz History Mode**: Save, search, and revisit previously generated custom quiz sets.
- **Custom Practice Session Rules**: Configure exam durations (10 to 180 mins), question counts (5 to 100 MCQs), mode (Tutor Mode with instant rationale vs Exam Mode), and passing thresholds.
- **On-Demand RAG Explanation Engine**: Cost-efficient, RAG-grounded explanations are synthesized and cached in the database on-demand whenever a user clicks 
---

## Tech Stack & Architecture

### Frontend (User Interface)
- **Framework**: Next.js 16+ (App Router), React 19, TypeScript.
- **Styling**: Vanilla CSS tokens & Tailwind CSS v4 with HSL dark/light clinical color system.
- **Animations**: Framer Motion & Tailwind Animate (`AnimatePresence`, floating keyframes, glassmorphic blurs).
- **Icons**: Lucide React.
- **Typography**: `Bespoke Serif` & `Gambarino` (academic headers) + `Excon` & `Pally` (sans body UI) + `JetBrains Mono` (data/code).

### Backend (API & Diagnostic Engine)
- **Framework**: FastAPI (Python 3.11+).
- **Database**: PostgreSQL with `pgvector` extension for vector search.
- **ORM**: SQLAlchemy with connection pooling and transaction management.
- **Semantic Vector Embedding**: `BAAI/bge-large-en-v1.5` (1024-dimensional embeddings).
- **Reranking**: `BAAI/bge-reranker-large` Cross-Encoder (top-5 reranking).
- **LLM Synthesis**: DeepSeek API for grounded clinical answer synthesis.

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
│   │   ├── main.py           # API endpoints (Q&A, stats, figures, library, quizzes)
│   │   ├── models.py         # SQLAlchemy database models
│   │   └── retrieval.py      # Hybrid Vector + BM25 keyword search service
│   ├── scripts/
│   │   ├── seed_mcqs.py      # MCQ extraction, categorization, and ingestion
│   │   ├── test_rag_queries.py # RAG validation query suite
│   │   └── update_db_schema.py# PostgreSQL schema migration utility
│   └── requirements.txt      # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── globals.css   # Clinical CSS variables, keyframe animations, themes
│   │   │   ├── layout.tsx    # Next.js root layout with Sonner Toaster
│   │   │   └── page.tsx      # Main application view manager
│   │   ├── components/
│   │   │   ├── layout/       # AuthCard, AppSidebar, Navigation
│   │   │   ├── ui/           # BasicDropdown, Checkbox, Glassmorphic Modal
│   │   │   └── views/        # DashboardView, ChatView, QuizView, MCQBankView
│   │   ├── hooks/            # useQuiz, useTheme, useChat
│   │   └── types.ts          # TypeScript domain interfaces
│   ├── package.json          # Node.js dependencies
│   └── next.config.ts        # Next.js configuration
├── mcqs/                     # 123 Board MCQ files structured by medical subtopics
└── schema.sql                # Complete SQL database reference schema
```

---

## Database Schema Overview

Programmatically managed via SQLAlchemy, the platform operates on 8 core tables:
1. **`books`**: Tracks uploaded medical reference textbooks and ingestion statuses (`ready`, `processing`).
2. **`chunks`**: Stores raw textbook page segments, page numbers, metadata, and 1024-d vector embeddings.
3. **`figures`**: Stores binary diagram image data, AI-generated captions, page numbers, and MIME types.
4. **`users`**: Manages credentials and roles (`student`, `admin`).
5. **`mcqs`**: Stores board questions, option blocks, correct letters, main/sub-categories, and RAG-grounded explanations.
6. **`ai_quiz_sets`**: Stores user-created AI custom quiz metadata and prompt configurations.
7. **`quiz_attempts`**: Records test session logs, starting/completion times, and student scores.
8. **`attempt_answers`**: Links specific attempt records to chosen options and correctness statuses.

---

## Local Installation & Setup

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL (with `vector` extension installed)

### 1. Database Setup
Create a PostgreSQL database and enable `pgvector`:
```sql
CREATE DATABASE medrag;
\c medrag
CREATE EXTENSION IF NOT EXISTS vector;
```

### 2. Backend Setup
```bash
cd backend
python -m venv venv

# Windows
.\venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
```

Create a `.env` file in the root project directory:
```env
DATABASE_URL=postgresql://username:password@localhost:5432/medrag
DEEPSEEK_API_KEY=your_deepseek_api_key
JWT_SECRET=your_jwt_secret
```

Initialize database tables and seed MCQ bank:
```bash
python scripts/update_db_schema.py
python scripts/seed_mcqs.py
```

Launch FastAPI server:
```bash
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 3. Frontend Setup
```bash
cd ../frontend
npm install
npm run dev
```

Open **`http://localhost:3000`** in your browser.

---

## License & Credits

Built for medical education and evidence-based clinical decision support.
