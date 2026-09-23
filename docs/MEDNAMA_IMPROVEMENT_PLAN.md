# medNAMA: reliability, grounding and FCPS readiness plan

One plan covering the problems reported so far, why each happens, and the fixes in order. This is an investigation and proposal. No application code has been changed.

**Problems reported**
1. "Fluid of choice in hypertrophic pyloric stenosis" returned *"not covered in the provided textbooks"*, although Bailey & Love is ingested.
2. Chat and AI-MCQ generation show **"Failed to fetch"**, **HTTP 500** or **"Failed to generate MCQs"**. In one case the MCQs *were* generated and saved while the screen showed the error.
3. CPSP/FCPS questions use current terms and concepts (for example "paradoxical aciduria" in HPS) that a textbook edition may not state. A "books only, otherwise refuse" design fails these questions.
4. MCQ generation is not aware of the database, so it can keep generating the same questions again.

**Ingested books:** Bailey & Love, Davidson, Dhingra ENT, Levinson Microbiology, Snell Anatomy, Katzung Pharmacology, Guyton & Hall Physiology, Robbins Pathology, Ramadas Pathology.

**Model:** DeepSeek `deepseek-v4-flash` through the OpenAI-compatible client.

---

## 1. How the system works today

**Chat** (`backend/app/generation.py::generate_answer`)
1. **Confidence check:** `vector_search` + `keyword_search` → `calculate_confidence()`. **If the result is below 0.55, all retrieved passages are dropped** and the LLM gets "NO MEDICAL CONTEXT FOUND".
2. `hybrid_search()` runs vector and keyword search again on child chunks (about 150 words each). The results are merged with RRF (Reciprocal Rank Fusion) onto parent chunks. The ms-marco cross-encoder then re-ranks them, and the top 5 parents go to the LLM.
3. The prompt says: if the answer isn't in the context, return the **exact fallback sentence**.
4. `candidate_search()` runs retrieval and re-ranking a **third** time for the sources panel.
5. Any exception (API error, bad JSON, wrong model name) returns **the same fallback sentence**.

**AI MCQs** (`backend/app/main.py::generate_ai_quiz`)
- `hybrid_search(limit=6)` finds the context.
- The last 30 same-book MCQ stems are added to the prompt.
- DeepSeek is called **once per batch of 5, one batch after another**.
- After generation, `_is_near_duplicate` filters stems with difflib against those 30 stems.
- Everything is saved in one commit.

**Network path on the NAS:** Browser → Next.js (:3000, `rewrites()` generated in `docker/frontend.Dockerfile`) → FastAPI (:8000) → DeepSeek.

---

## 2. Root causes

### A. Refusals ("not covered")
| # | Cause | Where |
|---|---|---|
| A1 | `calculate_confidence` returns `max_vector_score` from every branch, so **keyword matches never count**. | `retrieval.py` |
| A2 | `websearch_to_tsquery` **ANDs every word** ("fluid & choice & hypertrophic & pyloric & stenosis"). Textbooks never say "fluid of choice", so keyword search returns 0 rows. | `retrieval.py::keyword_search` |
| A3 | The fixed 0.55 cut-off is applied to child embeddings that carry a `"Textbook \| Chapter \| Page"` prefix, which lowers similarity. Short exam-style questions score low. | `ingestion.py`, `ChatQueryRequest` |
| A4 | **British spelling** in Bailey & Love and Davidson ("hypochloraemic", "paediatric", "oesophagus", "haemorrhage") doesn't match American-spelled queries in Postgres FTS. | `retrieval.py` |
| A5 | The prompt only allows **"exact answer or refuse"**. The book says "correct the hypochloraemic alkalosis with 0.45% saline + 5% dextrose + KCl", not "the fluid of choice is…", so the model refuses. | `generation.py` prompt |
| A6 | Earlier refusals are replayed in `history`, which pushes the model toward refusing again. | `main.py::chat_query_endpoint` |
| A7 | Errors (API failure, bad JSON, wrong model name) look like "not covered". | `generation.py` `except` |
| A8 | The re-ranker is general web-search (`ms-marco-MiniLM`). The synonym map has only 10 entries (no HPS/IHPS, DKA, NS/RL…). | `retrieval.py` |
| A9 | Sources aren't returned on a refusal, so the user can't see what nearly matched. | `generation.py` |

### B. "Failed to fetch" / 500 errors
| # | Cause | Evidence |
|---|---|---|
| B1 | **The Next.js rewrite proxy has a default `proxyTimeout` of 30 s.** A longer request is cut off, and the browser gets a dropped connection ("Failed to fetch") or a plain-text 500. **The backend keeps running and saves the result.** | Confirmed: pyloric stenosis MCQs were saved while the screen showed an error. |
| B2 | **MCQ batches run one after another.** 10 MCQs = 2 calls, 20 = 4 calls → 40–120 s or more. | `main.py` `for batch_start in range(...)` |
| B3 | **Chat repeats retrieval three times** and re-ranks on the CPU, then waits for DeepSeek (which may spend time reasoning). | `generation.py` |
| B4 | **`proxySafeFetch` retries on exactly these failures** and assumes the backend never received the request. In fact the backend is still working. The retry **starts a second full run**, which doubles DeepSeek cost, can save **duplicate quiz sets**, and times out again. | `frontend/src/lib/proxyFetch.ts` |
| B5 | **Real backend 500s in MCQs.** One batch with bad JSON or an API error raises `HTTPException(500)` and throws away the batches that already succeeded. | `main.py::generate_ai_quiz` |
| B6 | The DeepSeek client has no timeout. The SDK default is 600 s with 2 retries, so a slow upstream can hold a request for minutes. | all three `OpenAI(...)` calls |

The backend's `--timeout-keep-alive 70` already covers the idle-socket keep-alive case. What remains is caused by **request length**, not keep-alive.

### C. Books-only design versus CPSP reality
The books were added for **trust, MCQ content and level setting** (undergraduate, FCPS-I, FCPS-II/resident). They were not meant as a hard limit on what the AI may know. CPSP tests current terms and guidelines that the books may not state, so refusing whenever the books are silent fails the target users.

### D. MCQ repetition (not database-aware)
- Only the **last 30 MCQs from the same book** are shown to the LLM. When no book is chosen, it's the last 30 of any subject. Older questions on the same topic are invisible to it.
- The duplicate check is **text-only difflib > 0.8**. A reworded question testing the same fact ("HPS → hypochloraemic hypokalaemic metabolic alkalosis") passes as new.
- The **same query always retrieves the same top-6 chunks**, so the same facts get tested each time.
- Nothing tracks **which facts or chunks have already been tested**, or **which questions a user has already seen**.
- The B4 retry can also save a **full duplicate set**.

---

## 3. The target approach: books first, AI fills gaps, clearly labelled

1. **Chat answer in two labelled parts**
   - **From your textbooks**: book and page citations, checked on the server with `validate_generation` (existing).
   - **Additional clinical knowledge (AI, not from textbooks)**: current terms, guidelines and exam pearls. No citations are allowed here.
   - Refuse only for non-medical questions, or when the model is actually unsure.
   - JSON: `textbook_answer_markdown`, `supplementary_markdown`, `grounding` (`textbook` | `partial` | `ai_only`).
2. **Grounding badge:** "Textbook-backed", "Partly backed" or "AI knowledge only".
3. **Level setting** (`undergraduate` | `fcps1` | `fcps2`), stored on the user and passed to chat and MCQs. It controls depth and style. The books set the baseline.
4. **MCQs**
   - Facts and level come from the retrieved passages, and current CPSP concepts are allowed.
   - Each question is tagged `book_sourced` (with a validated book and page) or `ai_supplemented`, and never gets a made-up page.
   - If nothing is retrieved, generate the set as `ai_supplemented` with a notice, instead of the silent `Topic: …` fallback.
   - Add an **FCPS profile**: single best answer, 5 options (A–E), CPSP-style clinical scenarios, and subject/specialty tags.
5. **Safety:** server-side citation validation stays, citations in the supplementary part are stripped, and a "Report wrong answer" button feeds an admin review queue.

---

## 4. Implementation plan (phased)

### Phase 1: Stop the errors (small, low risk; do first)
1. **Proxy timeout:** in `docker/frontend.Dockerfile` **and** `NAS/frontend.Dockerfile`, add `experimental: { proxyTimeout: 180_000 }` to the generated `next.config.ts`, then rebuild the frontend.
2. **Safe retry:** `proxySafeFetch` retries only if the failure happened within about 2 s of sending (the real stale-socket case). It never retries after a long wait.
3. **Idempotency key:** the frontend sends an `Idempotency-Key` (UUID) with each chat or quiz request. The backend stores `request_id` on the quiz set or message. A repeated key returns the saved result instead of generating again. This removes duplicate sets.
4. **Recover a result after a timeout:** if the quiz request still fails on the client, re-fetch `/api/chat/ai-quizzes` (by idempotency key) and show the set if it was saved. The user then never sees an error for work that succeeded.
5. **DeepSeek client:** `OpenAI(timeout=60, max_retries=1)` in all three places, `max_tokens` set, and thinking/reasoning turned off or lowered for chat and MCQs if the model supports it.
6. **Partial-success MCQs:** retry a failed batch once, keep the batches that succeeded, return `{created, failed_batches}`, and return 504 with a JSON `detail` for a provider timeout.
7. **Quiz UI:** give it its own `AbortController` (about 180 s) and a clear timeout message, matching `useChat.ts`.

### Phase 2: Make it fast
1. Run the MCQ batches **in parallel** (`ThreadPoolExecutor` or `AsyncOpenAI` + `gather`), then merge and deduplicate.
2. Chat: **one** retrieval pass. Compute confidence from `hybrid_search`'s re-ranked results, and build `sources` from the same list (drop the extra `candidate_search` and duplicate gate searches).
3. **Later:** SSE streaming for chat, and MCQ generation as a background job (`POST` returns `job_id`, then poll `GET /api/chat/ai-quizzes/jobs/{id}`), following the ingestion job pattern. After this, request length doesn't matter.

### Phase 3: Retrieval quality (fix the refusals)
1. `calculate_confidence`: use the **cross-encoder score of the top re-ranked parent**, or a combined vector and keyword score. Pass borderline context through labelled "low confidence" instead of dropping it. Set the default threshold to about 0.45.
2. Keyword search: remove question stop-phrases ("of choice", "drug of", "management of", "treatment of"), and **fall back to an OR query** when the AND query returns 0 rows.
3. **US↔UK spelling expansion** (`-emia/-aemia`, `pedi/paedi`, `esoph/oesoph`, `hem/haem`, `edema/oedema`, `anemia/anaemia`).
4. Extend `MEDICAL_SYNONYMS` (HPS/IHPS, DKA, AKI, ARDS, NS/RL, PPH, MI, etc.).
5. **Query rewrite** for exam phrasing. A small LLM or rule-based step turns "fluid of choice in HPS" into "hypertrophic pyloric stenosis fluid resuscitation hypochloraemic metabolic alkalosis saline potassium". Retrieve with both queries and merge with RRF.
6. **Optional:** a medical-capable re-ranker (`BAAI/bge-reranker-v2-m3`), and re-embedding children without the metadata prefix.

### Phase 4: Books-first + labelled AI supplement (section 3)
1. `generation.py`:
   - Replace the "exact fallback" rule with the two-part answer.
   - Return a `grounding` level and a distinct `status` (`ok` | `low_confidence` | `llm_error`).
   - Always return `sources`.
   - Log the confidence, the top chunk IDs and the model error.
2. Don't replay canned fallback text in `history`.
3. User `level` field and selector. It's passed into both prompts.
4. Frontend: two-part answer rendering, grounding badge, and a "Report wrong answer" button.

### Phase 5: Database-aware MCQ generation (no repeats)
1. **MCQ embeddings:** add `mcqs.stem_embedding vector(1024)` (same bge-large model), filled when a question is created, plus a one-off backfill script for existing rows.
2. **Topic-aware "already asked" context:**
   - Before generating, embed the prompt and fetch the **top ~40 existing MCQs by vector similarity** (all books, not only the last 30 of one book).
   - Send each as a one-line summary of **what it tests** (stem + correct answer).
   - Instruct the model to test *different facts or angles*.
3. **Semantic duplicate check** after generation:
   - Reject a new question if cosine similarity to any existing stem is > 0.90.
   - Or if it has the same correct-answer text with similarity > 0.80.
   - Keep difflib as a quick first filter.
4. **Rotate the source passages:**
   - Record the source chunk IDs used on each MCQ (`mcqs.source_chunk_ids`).
   - When building context, **prefer passages not yet used** for this topic. Retrieve the top ~20, drop or down-weight chunks already used, and pick 6.
   - Coverage then spreads across the chapter instead of repeating the top result.
5. **Per-user freshness:**
   - Prefer questions the user hasn't attempted when building drills. `quiz_attempts` already exists, so it can drive a "seen" filter.
   - Offer "reuse existing bank questions first, generate only the shortfall". This saves DeepSeek cost and gives variety.
6. **Fact tags:** the LLM also returns `tested_concept` (for example "IHPS – metabolic derangement"). Store it on `mcqs`, and add a `(topic, tested_concept)` uniqueness check per book to block exact concept repeats.
7. The idempotency key from Phase 1 prevents whole-set duplicates caused by retries.

### Phase 6: Content and FCPS features
- **Books to add, by priority:**
  1. Paediatrics (Nelson Essentials or Ghai): the largest gap.
  2. Gynaecology/Obstetrics (Ten Teachers or Dutta).
  3. Biochemistry (Lippincott or Harper): the only missing FCPS-I basic science.
  4. A high-yield FCPS review or short-notes book (it uses "drug/fluid of choice" wording).
  5. Optional: Ophthalmology (Kanski or Khurana), Forensic and Community medicine.
- **Later:** ingest guideline summaries and past-paper topic lists, so "latest terms" become cited content instead of AI memory.
- **Features:** timed mock papers weighted by the FCPS syllabus, high-yield topic lists per chapter, wrong answers turned into flashcards, and MCQ explanations reusing `generate_mcq_explanation` (with citation validation).
- **Validate MCQ `source_book`/`source_page`** against the retrieved chunks (reuse `validate_generation`).

---

## 5. Files to change
| File | Phases |
|---|---|
| `docker/frontend.Dockerfile`, `NAS/frontend.Dockerfile` | 1 |
| `frontend/src/lib/proxyFetch.ts`, `frontend/src/hooks/useChat.ts`, `frontend/src/components/views/QuizView.tsx` | 1, 4 |
| `backend/app/main.py` (`generate_ai_quiz`, `_is_near_duplicate`, `chat_query_endpoint`, request models) | 1, 2, 4, 5 |
| `backend/app/generation.py` | 1, 2, 4 |
| `backend/app/retrieval.py` | 2, 3, 5 |
| `backend/app/models.py` + new alembic migration (`mcqs.stem_embedding`, `source_chunk_ids`, `tested_concept`, `grounding`, `request_id`; `users.level`; `answer_reports`) | 1, 4, 5 |
| `backend/scripts/` (MCQ embedding backfill, evaluation set) | 3, 5 |
| `backend/app/ingestion.py` (only if re-embedding) | 3 (optional) |

## 6. Verification
- **Errors:**
  - On the NAS, time `POST /api/chat/generate-ai-quiz` with count 20. Call `backend:8000` from inside the frontend container (the backend isn't exposed to the host), then call through `:3000`.
  - Before the fix, the call through `:3000` should fail at about 30 s. After it, it should succeed.
  - The backend log should show one run per request (no duplicate DeepSeek calls), and repeating an idempotency key should return the saved set.
- **Speed:** a 20-MCQ set takes about as long as one batch after Phase 2, and chat runs one retrieval pass per question.
- **Refusals:**
  - Build a set of about 30 exam-style questions ("X of choice", management, current terms) with the expected book and page, and run it with `backend/scripts/evaluate_rag.py` before and after.
  - Track hit@5, refusal rate and citation validity.
  - The HPS question should cite Bailey & Love (0.45% NaCl + 5% dextrose + KCl, correct the alkalosis before pyloromyotomy).
  - "Paradoxical aciduria" should give a textbook-cited part if present and a labelled AI part otherwise.
- **Repetition:**
  - Generate 3 sets of 10 on "pyloric stenosis".
  - Expect 0 pairs with stem cosine > 0.90, and more distinct `tested_concept` values and source chunk IDs across the sets than today.
