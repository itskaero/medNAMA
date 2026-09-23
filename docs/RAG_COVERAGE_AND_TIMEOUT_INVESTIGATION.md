# Why medNAMA says "not covered" and what to do about it (investigation and proposal)

## Context
A user asked "fluid of choice in hypertrophic pyloric stenosis". The answer was the canned fallback: *"I am sorry, but the answer to your question is not covered in the provided textbooks."* The platform is meant for undergraduate students, residents and FCPS candidates, so refusals like this make it much less useful. This document traces why the refusal happens and proposes fixes. No code has been changed yet.

## How a chat question flows (`backend/app/generation.py::generate_answer`)
1. **Confidence gate.** `vector_search(limit=10)` and `keyword_search(limit=10)` run, then `calculate_confidence()` (`retrieval.py`) runs. **If the confidence is below 0.55, all chunks are deleted** and the LLM receives "NO MEDICAL CONTEXT FOUND".
2. `hybrid_search()`: vector and keyword search over child chunks (150 words each), then RRF over the parent chunks, then the ms-marco cross-encoder reranks the top 15, then the top 5 parents go to the LLM.
3. System prompt rule 1: if the answer "cannot be found in the context", the model **must** return the exact fallback sentence.
4. Any exception (API error, bad JSON, wrong model name) → `except` → **the same fallback sentence.**

The refusal can come from any of four separate places, and the user can't tell which one it was.

## Root causes, most likely first

| # | Cause | Where | Effect on the HPS question |
|---|---|---|---|
| 1 | **The confidence check ignores keyword hits.** Every branch of `calculate_confidence` returns `max_vector_score`. A strong keyword match can never pass the gate on its own. | `retrieval.py` `calculate_confidence` | A cosine score of 0.52 with a perfect "pyloric stenosis" keyword hit is still rejected. |
| 2 | **The keyword search ANDs every word.** `websearch_to_tsquery` requires *fluid & choice & hypertrophic & pyloric & stenosis* all in one 150-word child chunk. Textbooks don't write "fluid of choice". | `retrieval.py` `keyword_search` | The keyword search returns 0 rows, so only the vector score remains. |
| 3 | **The threshold is fixed at 0.55 and the embedded text is diluted.** Each child is embedded with a prefix (`"Textbook: … \| Chapter: … \| Page: …"`), which lowers cosine scores. Short exam-style questions ("X of choice in Y") score lower than full sentences. | `ingestion.py` child enrichment; `ChatQueryRequest.confidence_threshold=0.55` | Relevant passages can land around 0.50–0.54 and get thrown away. |
| 4 | **The prompt only allows "exact answer or refuse".** Textbooks say *"correct dehydration and hypochloraemic alkalosis with 0.45% saline + 5% dextrose with added KCl before pyloromyotomy"*. They never say "fluid of choice is…". A model at temperature 0 told to "return EXACT fallback if not found" often refuses instead of reasoning over the passage. There is no partial-answer option. | `generation.py` system prompt | The model refuses even when the right chunk was retrieved. |
| 5 | **Earlier refusals are replayed as chat history.** Earlier "not covered" answers go back into `history` as assistant turns, which pushes the model toward refusing again in the same conversation. | `main.py` `chat_query_endpoint` | Refusals snowball once one happens. |
| 6 | **Errors look like "not covered".** An API or model-name error (see commit `87e5c54`, "deepseek-v4-flah") gives the same sentence. | `generation.py` `except` | You can't tell a missing book from a crash. |
| 7 | **The reranker is general-purpose.** `ms-marco-MiniLM-L-6-v2` is trained on web search, not medical text. The synonym map has only 10 entries (no HPS, IHPS, NG, RL, NS, DKA…). | `retrieval.py` | Weaker ranking for medical abbreviations and exam phrasing. |
| 8 | **No sources shown on refusal.** `candidate_search` only runs on the success path. | `generation.py` | The user can't see that a relevant page existed. |

## Do you need more books?
Ingested books: Bailey & Love, Davidson, Dhingra ENT, Levinson Microbiology, Snell Anatomy, Katzung, Guyton & Hall Physiology, Robbins Pathology, Ramadas Pathology.

**For this question, no.** Bailey & Love covers infantile hypertrophic pyloric stenosis in its paediatric surgery chapter and its stomach and duodenum chapter. Both say the same thing: correct dehydration and hypochloraemic metabolic alkalosis with IV 0.45% saline + 5% dextrose with KCl before Ramstedt pyloromyotomy. So the answer is in the database, and this is a **retrieval and prompt failure**, not missing content.

Another cause specific to this book: Bailey & Love uses **British spelling** ("hypochloraemic", "paediatric", "oesophagus", "haemorrhage"). Postgres `english` stemming does not map "hypochloremic" to "hypochloraemic", so American-spelled queries miss keyword hits. Add US↔UK spelling normalisation (or expansion) to the query.

**Gaps to fill for FCPS/MBBS coverage**, in priority order:
1. Paediatrics (Nelson essentials or Ghai): the biggest gap. Pediatric medicine is currently missing entirely.
2. Gynaecology/Obstetrics (Ten Teachers or Dutta)
3. Biochemistry (Lippincott or Harper): the only FCPS-I basic science still missing. Anatomy, physiology, pathology, pharmacology and microbiology are already covered.
4. A review or short-notes book (for example, a high-yield FCPS/MCQ review). These use "drug/fluid of choice" wording directly, which helps retrieval a lot.
5. Optional: Ophthalmology (Kanski or Khurana), Forensic/Community medicine for MBBS finals.

## Proposed fixes (in order)

**Step 0: Diagnose (read-only).** Run `backend/scripts/test_retrieval.py` or `evaluate_rag.py` with this query. Log the top vector score, the keyword hit count, the top 5 parent chunks with book and page, and the confidence. That shows whether the book is missing (retrieval problem) or the chunk was retrieved (prompt problem).

**Step 1: Fix the retrieval gate** (`retrieval.py`)
- `calculate_confidence`: use the cross-encoder score of the top reranked parent, or a combined score such as `max(vector, keyword-normalized)`. Stop returning the raw vector score from every branch.
- Keyword search: fall back to an OR query (`plainto_tsquery` terms joined with `|`) when the AND query returns 0 rows. Drop question stop-words ("choice", "drug of", "treatment of", "management of").
- Lower the default threshold to about 0.45 and pass borderline context through, labelled as "low confidence", instead of deleting it.
- Remove the duplicated vector and keyword calls (the gate and `hybrid_search` both run them).

**Step 2: Rewrite the query for exam phrasing** (`retrieval.py`)
- Add a small LLM (or rule-based) rewrite: "fluid of choice in HPS" → "hypertrophic pyloric stenosis fluid resuscitation management hypochloremic metabolic alkalosis saline potassium". Run retrieval on both the original and the rewritten query and merge them with RRF.
- Extend `MEDICAL_SYNONYMS` with common abbreviations (HPS/IHPS, DKA, AKI, ARDS, NS/RL, PPH, etc.).
- Add US→UK spelling expansion (`-emia`→`-aemia`, `pedi`→`paedi`, `esoph`→`oesoph`, `hemo`→`haemo`, `edema`→`oedema`, `anemia`→`anaemia`) to the keyword query, because Bailey & Love and Davidson are British texts.

**Step 3: Answer in tiers instead of all-or-nothing** (`generation.py` prompt)
- Replace rule 1 with: answer from context when you can, including reasonable inference from what the context states (for example, rehydration → name the fluid). Say which part is sourced and cite it. Refuse only when the context is unrelated.
- Optional, behind a flag: "Beyond the textbooks" general-knowledge section, clearly labelled and uncited. Exam users often prefer an answer marked "not from the textbooks" over a refusal.
- Don't replay the canned fallback text in `history`.

**Step 4: Observability**
- Return distinct reasons (`no_context`, `low_confidence`, `llm_error`) and always return `sources`, so the UI can show "closest matches" even on a refusal.
- Log the confidence, top chunk IDs and the model error.

**Step 5 (optional): Better models.** Use a medical cross-encoder reranker (for example `BAAI/bge-reranker-v2-m3`). Re-embed children without the metadata prefix, or keep the prefix only for keyword search.

## FCPS preparation: what exists and what's missing
It already exists: `/api/chat/generate-ai-quiz` (`main.py:572`) generates grounded MCQs with difficulty levels, deduplication, explanations and a Source line, plus the drill and wrong-answer quiz and flashcards. Gaps:
- If retrieval finds nothing, `context_str = "Topic: …"`, so **ungrounded MCQs are produced silently**. It should refuse or flag them.
- `source_book` and `source_page` from the LLM are **not validated** against the retrieved chunks. `validate_generation` could be reused here.
- The prompt says "USMLE/board-style". Add an **FCPS-I / FCPS-II / MBBS profile**: single-best-answer, 5 options (A–E), CPSP-style vignettes, and subject/specialty tags.
- Explanations should cite the book and page and explain why each distractor is wrong. The MCQ explain endpoint already does this with `validate_generation`, so reuse it.
- Future ideas: timed mock papers by FCPS syllabus weighting, high-yield topic lists per chapter, and a spaced-repetition link between wrong answers and flashcards.

## Part B: "Failed to fetch" / "Failed to generate MCQs" (slow DeepSeek responses)

**Root cause: the Next.js rewrite proxy stops waiting after 30 s. The keep-alive setting is not the problem.**
- On the NAS, the browser calls `/api/*`. Next.js forwards those calls to `http://backend:8000` through `rewrites()`, which `docker/frontend.Dockerfile` generates. Next's rewrite proxy has a default `proxyTimeout` of **30 000 ms**. When a request takes longer, the proxy drops it, and the browser sees "socket hang up", a plain-text 500, or "Failed to fetch".
- The backend already uses `--timeout-keep-alive 70`, which covers the idle-socket case. The remaining failures happen because each request takes too long:
  - **Chat:** embeds the query, runs vector and keyword search twice (the confidence gate, then `hybrid_search`), reranks with the CPU cross-encoder, makes one DeepSeek call (`deepseek-v4-flash`, which may spend time on reasoning before answering), then runs `candidate_search` (retrieval and reranking a third time). This often totals more than 30 s.
  - **AI MCQs:** `generate_ai_quiz` makes **one DeepSeek call per batch of 5, one after another** (`main.py:707`). 20 MCQs means 4 sequential calls, taking 60–120 s or more, so it fails every time.
- **`proxySafeFetch` makes it worse.** It retries once on a network error or a plain-text 500, assuming "the backend never processed the request". That is not true for a proxy timeout. The backend is still running the first request when the retry fires. You pay for DeepSeek twice, can end up with duplicate MCQ sets, and the second attempt times out too.
- The DeepSeek `OpenAI(...)` client has no `timeout` set (the SDK default is 600 s with 2 retries), so a slow upstream response can hold a worker for minutes.
- The endpoints are synchronous `def` handlers on one uvicorn process. FastAPI runs them in its thread pool (about 40 threads), so this is not a hard block, but the CPU work (reranking, embedding) competes for resources.

**Fixes, in order:**
1. **Quick fix (config only):** in both `docker/frontend.Dockerfile` and `NAS/frontend.Dockerfile`, add `experimental: { proxyTimeout: 180_000 }` to the generated `next.config.ts`. Rebuild the frontend image. This alone should stop most "Failed to fetch" errors.
2. **Retry safety:** in `proxySafeFetch`, retry only on errors that occur quickly (for example, under 2 s after sending, which is the real dead-socket case). Never retry once the request has run long. Put the quiz call on the same path with its own `AbortController`, set to about 180 s.
3. **Backend latency:**
   - Run the MCQ batches **in parallel** (`ThreadPoolExecutor`, or `AsyncOpenAI` + `asyncio.gather`), then merge and deduplicate. 20 MCQs should take about as long as one batch.
   - In chat, remove the duplicate retrieval passes: compute the confidence from `hybrid_search`'s results and build `sources` from the same reranked list instead of calling `candidate_search` again.
   - Set `OpenAI(timeout=60, max_retries=1)` on all 3 clients. Set `max_tokens` on the responses. If `deepseek-v4-flash` has a thinking mode, turn it off or lower it for chat and MCQs.
   - Return a clear JSON error (504 "AI provider timed out") instead of a hang.
4. **Streaming or background jobs (better user experience):** stream chat answers over SSE, so the proxy sees bytes right away and the user sees text appear. Run MCQ generation as a background job (`POST` returns a job id, then the client polls `GET /api/chat/ai-quizzes/jobs/{id}`), the same pattern as ingestion. After this, request length stops mattering.

Files: `docker/frontend.Dockerfile`, `NAS/frontend.Dockerfile`, `frontend/src/lib/proxyFetch.ts`, `frontend/src/hooks/useChat.ts`, `frontend/src/components/views/QuizView.tsx`, `backend/app/main.py` (`generate_ai_quiz`), `backend/app/generation.py`.

Verification: on the NAS, time `curl -X POST /api/chat/generate-ai-quiz` with count 20, first directly against backend:8000 and then through :3000. Before the fix, the :3000 call should fail at about 30 s. After the fix, it should succeed. Check the backend logs to confirm each request runs only once (no duplicate DeepSeek calls).

## Critical files
- `backend/app/retrieval.py`: `calculate_confidence`, `keyword_search`, `MEDICAL_SYNONYMS`, reranker
- `backend/app/generation.py`: `generate_answer` gate, system prompt, error path
- `backend/app/main.py`: `ChatQueryRequest` threshold, history replay, `generate_ai_quiz` grounding and validation
- `backend/app/ingestion.py`: child embedding prefix (only if re-embedding is done)

## Verification
- Build a small evaluation set (about 30 exam-style "X of choice" and management questions across subjects, with the expected book and page) and run it with `backend/scripts/evaluate_rag.py` before and after. Track retrieval hit@5, refusal rate and citation validity.
- Manually re-ask the HPS question and confirm it cites the Bailey & Love IHPS page (0.45% NaCl + 5% dextrose + KCl, correct the alkalosis before surgery).
- Confirm the AI quiz refuses or flags requests with no retrieved context, and that invalid sources are stripped.
