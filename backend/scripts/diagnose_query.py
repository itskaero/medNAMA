"""Explain why a chat query was answered or refused, without calling DeepSeek.

Runs the same retrieval steps as generation.generate_answer and prints the
confidence gate inputs, the keyword hit count, and the top reranked chunks.
Read-only: nothing is written to the database.

Usage (inside the backend container, from /app/backend):
    python scripts/diagnose_query.py "paradoxical aciduria"
    python scripts/diagnose_query.py "paradoxical aciduria" "drug of choice for absence seizures"
    python scripts/diagnose_query.py "fluid of choice in hypertrophic pyloric stenosis" --threshold 0.55
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal  # noqa: E402
from app.retrieval import expand_medical_query, retrieval_service  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("queries", nargs="+", help="one or more queries (models load once)")
    parser.add_argument("--threshold", type=float, default=0.55)
    parser.add_argument("--book-id", type=int, default=None)
    args = parser.parse_args()

    for query in args.queries:
        print(f"{QUERY_MARKER}{query}", flush=True)
        diagnose(query, threshold, args.book_id)


QUERY_MARKER = "### QUERY: "


def diagnose(query: str, threshold: float, book_id: int | None) -> None:
    session = SessionLocal()
    try:
        print(f"Query:          {query!r}")
        print(f"Expanded query: {expand_medical_query(query)!r}\n")

        emb = retrieval_service._embed_query(query)
        vector_results = retrieval_service.vector_search(session, emb, limit=10, book_id=book_id)
        keyword_results = retrieval_service.keyword_search(session, query, limit=10, book_id=book_id)
        confidence = retrieval_service.calculate_confidence(vector_results, keyword_results)

        print("== Confidence gate ==")
        print(f"Top vector score:  {vector_results[0][1]:.4f}" if vector_results else "Top vector score:  (none)")
        print(f"Keyword hits:      {len(keyword_results)}")
        print(f"Confidence:        {confidence:.4f}  (threshold {threshold})")
        verdict = "PASS - chunks sent to DeepSeek" if confidence >= threshold else "FAIL - chunks dropped, chat will refuse"
        print(f"Gate result:       {verdict}\n")

        print("== Top vector child chunks ==")
        for chunk, score in vector_results[:5]:
            title = chunk.book.title if chunk.book else "?"
            text = " ".join((chunk.extra_metadata or {}).get("original_text", chunk.content).split())[:160]
            print(f"  {score:.4f}  {title} p.{chunk.page_number}: {text}")

        print("\n== Top keyword child chunks ==")
        if not keyword_results:
            print("  (none - every query word must appear in one chunk)")
        for chunk, rank in keyword_results[:5]:
            title = chunk.book.title if chunk.book else "?"
            text = " ".join((chunk.extra_metadata or {}).get("original_text", chunk.content).split())[:160]
            print(f"  {rank:.4f}  {title} p.{chunk.page_number}: {text}")

        print("\n== Reranked parent chunks (what DeepSeek would see if the gate passed) ==")
        candidates = retrieval_service.candidate_search(session, query, limit=5, book_id=book_id)
        for cand in candidates:
            print(f"  #{cand['rank']} rerank={cand['relevance_score']:.3f}  {cand['book_title']} p.{cand['page_number']}")
            print(f"      {cand['snippet'][:200]}")

        # Machine-readable line consumed by run_diagnosis.py's summary table.
        top = f"{candidates[0]['book_title']} p.{candidates[0]['page_number']}" if candidates else "-"
        top_vec = f"{vector_results[0][1]:.3f}" if vector_results else "-"
        gate = "PASS" if confidence >= threshold else "FAIL"
        print(f"\nSUMMARY|{top_vec}|{len(keyword_results)}|{confidence:.3f}|{gate}|{top}")
    finally:
        session.close()


if __name__ == "__main__":
    main()
