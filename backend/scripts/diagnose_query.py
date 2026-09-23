"""Explain why a chat query was answered or refused, without calling DeepSeek.

Runs the same retrieval steps as generation.generate_answer and prints the
confidence gate inputs, the keyword hit count, and the top reranked chunks.
Read-only: nothing is written to the database.

Usage (inside the backend container, from /app/backend):
    python scripts/diagnose_query.py "paradoxical aciduria"
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
    parser.add_argument("query")
    parser.add_argument("--threshold", type=float, default=0.55)
    parser.add_argument("--book-id", type=int, default=None)
    args = parser.parse_args()

    session = SessionLocal()
    try:
        query = args.query
        print(f"Query:          {query!r}")
        print(f"Expanded query: {expand_medical_query(query)!r}\n")

        emb = retrieval_service._embed_query(query)
        vector_results = retrieval_service.vector_search(session, emb, limit=10, book_id=args.book_id)
        keyword_results = retrieval_service.keyword_search(session, query, limit=10, book_id=args.book_id)
        confidence = retrieval_service.calculate_confidence(vector_results, keyword_results)

        print("== Confidence gate ==")
        print(f"Top vector score:  {vector_results[0][1]:.4f}" if vector_results else "Top vector score:  (none)")
        print(f"Keyword hits:      {len(keyword_results)}")
        print(f"Confidence:        {confidence:.4f}  (threshold {args.threshold})")
        verdict = "PASS - chunks sent to DeepSeek" if confidence >= args.threshold else "FAIL - chunks dropped, chat will refuse"
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
        for cand in retrieval_service.candidate_search(session, query, limit=5, book_id=args.book_id):
            print(f"  #{cand['rank']} rerank={cand['relevance_score']:.3f}  {cand['book_title']} p.{cand['page_number']}")
            print(f"      {cand['snippet'][:200]}")
    finally:
        session.close()


if __name__ == "__main__":
    main()
