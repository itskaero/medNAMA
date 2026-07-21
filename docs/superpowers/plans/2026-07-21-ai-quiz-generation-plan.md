# Implementation Plan: AI Quiz Generation System

**Spec File:** [docs/superpowers/specs/2026-07-21-ai-quiz-generation-design.md](file:///F:/Code/medRAG/docs/superpowers/specs/2026-07-21-ai-quiz-generation-design.md)  
**Date:** 2026-07-21  

This implementation plan details the step-by-step technical tasks to build the **AI Quiz Generation System**.

---

## Task 1: Database Schema & SQLAlchemy Model Migration
- **Files**: `schema.sql`, `backend/app/models.py`, migration script
- **Steps**:
  1. Add `quiz_set_id` (Text) and `quiz_set_title` (Text) to `mcqs` table in `schema.sql`.
  2. Update `MCQ` SQLAlchemy model in `backend/app/models.py` with `quiz_set_id` and `quiz_set_title` columns.
  3. Create and execute migration script `backend/scripts/migrate_quiz_set_id.py` to alter PostgreSQL database table safely without data loss.

---

## Task 2: Backend API Endpoints & RAG MCQ Generator Engine
- **Files**: `backend/app/main.py`, `backend/app/retrieval.py`, `backend/app/generation.py`
- **Steps**:
  1. Implement prompt intent parser helper function to detect page numbers (e.g. `page 120`), question count, and topic keywords from natural language prompts.
  2. Implement RAG retrieval helper in `backend/app/main.py`:
     - If page number is specified, query `chunks` table filtering by `book_id` and `page_number`.
     - Otherwise, perform vector cosine similarity search via `search_chunks`.
  3. Implement LLM MCQ generator function using DeepSeek with strict JSON schema enforcing `quiz_title`, `questions` array with 4 options, `correct_option`, and `explanation`.
  4. Create `POST /api/chat/generate-ai-quiz` endpoint:
     - Generates unique `quiz_set_id`.
     - Inserts generated MCQs into database.
     - Returns `{ quiz_set_id, quiz_set_title, total_questions, mcqs }`.
  5. Create `GET /api/chat/ai-quizzes` endpoint to return distinct generated quiz sets for user history.
  6. Create `DELETE /api/chat/ai-quizzes/{quiz_set_id}` endpoint.

---

## Task 3: AI Quiz Studio Frontend Component
- **Files**: `frontend/src/components/views/AIQuizStudioView.tsx`, `frontend/src/types/index.ts`, `frontend/src/hooks/useQuiz.ts`
- **Steps**:
  1. Create `AIQuizStudioView.tsx` with:
     - Freeform prompt input bar.
     - Interactive suggestion chips (*"⚡ 5 MCQs from Guyton page 120"*, *"🫀 Cardiovascular Rapid Recall"*, *"🫁 Pulmonary Physiology"*).
     - **Quiz History Panel**: Displays cards for all generated quiz sets with title, question count, creation date, **"🎯 Take Quiz"**, and **"🗑️ Delete"** actions.
  2. Add `handleGenerateAiQuiz`, `fetchAiQuizzes`, and `handleDeleteAiQuizSet` hooks in `useQuiz.ts`.

---

## Task 4: Chat Bot Quiz Card Component
- **Files**: `frontend/src/components/chat/ChatMessage.tsx`, `frontend/src/app/page.tsx`
- **Steps**:
  1. Update Chat response handler to detect generated quiz payloads.
  2. Render interactive status card in Chat:
     - Display quiz title, question count, and textbook source.
     - Provide a **"🎯 Take Quiz"** button that sets `activeView = "practice"` and selects `quiz_set_id`.

---

## Task 5: Practice Mode Integration & Source Citations
- **Files**: `frontend/src/components/views/QuizView.tsx`
- **Steps**:
  1. Update `QuizView.tsx` to accept `selectedQuizSetId` prop.
  2. Filter questions by `selectedQuizSetId` when taking custom AI quizzes.
  3. Render **Textbook Source Citation Footnotes** (`📖 Source: Guyton & Hall Physiology, Page 120`) alongside explanations after each answer.

---

## Task 6: Testing, Compilation, & Verification
- **Files**: `backend/scripts/test_ai_quiz_generation.py`
- **Steps**:
  1. Write backend automated integration test `test_ai_quiz_generation.py` verifying RAG retrieval, DeepSeek generation, database storage, and history listing.
  2. Run `npx tsc --noEmit` on frontend to verify 0 TypeScript errors.
  3. Run `npm run build` to verify production compilation.
