"""RAG evaluation pipeline benchmarking Recall@k, MRR, reranker quality,
and fallback accuracy (Proposals 7 & 15).
"""

import sys
from pathlib import Path

# Allow running from backend/ folder
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal
from app.models import Book, Chunk
from app.retrieval import retrieval_service

# Ground truth dataset for evaluation
EVALUATION_DATASET = [
    {
        "query": "Who drew the artwork for the fifth edition of the microbiology textbook?",
        "expected_page": 8,
        "expected_book": "Microbiology Sample",
        "out_of_context": False,
    },
    {
        "query": "What did Louis Pasteur say about microbes having the last word?",
        "expected_page": 7,
        "expected_book": "Microbiology Sample",
        "out_of_context": False,
    },
    {
        "query": "What manual was used for the new classification of bacteria?",
        "expected_page": 8,
        "expected_book": "Microbiology Sample",
        "out_of_context": False,
    },
    {
        "query": "What supplementary publications are available to accompany the new edition?",
        "expected_page": 8,
        "expected_book": "Microbiology Sample",
        "out_of_context": False,
    },
    {
        "query": "McGraw-Hill Offices New Delhi Auckland Bogota",
        "expected_page": 3,
        "expected_book": "Microbiology Sample",
        "out_of_context": False,
    },
    {
        "query": "What are the common symptoms of Covid-19 and how is it treated?",
        "expected_page": None,
        "expected_book": None,
        "out_of_context": True,
    },
    {
        "query": "How is deep learning used to train a convolutional neural network?",
        "expected_page": None,
        "expected_book": None,
        "out_of_context": True,
    },
]


def run_evaluation():
    session = SessionLocal()
    try:
        # Check if the Microbiology Sample exists in DB. If not, alert
        sample_book = session.query(Book).filter(Book.filename == "microbiology_sample.pdf").first()
        if not sample_book or sample_book.status != "ready":
            print("[WARNING] 'microbiology_sample.pdf' is not yet ingested or status is not 'ready'.")
            print("Please ingest 'pdfs/microbiology_sample.pdf' first to run valid benchmarks.")

        print("\n" + "="*80)
        print("RUNNING RAG EVALUATION & RERANKER BENCHMARK (Proposals 7 & 15)")
        print("="*80 + "\n")

        # Stats accumulators
        rrf_mrr = 0.0
        rerank_mrr = 0.0
        
        rrf_recall_at_3 = 0
        rerank_recall_at_3 = 0
        
        rrf_recall_at_5 = 0
        rerank_recall_at_5 = 0

        fallback_success = 0
        fallback_total = 0

        for idx, item in enumerate(EVALUATION_DATASET, 1):
            q = item["query"]
            print(f"Test case {idx}: '{q}'")
            print("-" * 60)

            # 1. Run raw search to evaluate RRF ranking (prior to reranking)
            query_embedding = retrieval_service._embed_query(q)
            vector_results = retrieval_service.vector_search(session, query_embedding, limit=30)
            keyword_results = retrieval_service.keyword_search(session, q, limit=30)

            # Apply RRF to get raw ranking candidates (representing RRF-only approach)
            rrf_k = 60
            rrf_scores = {}
            parents_map = {}
            
            # Map child matches to parents
            for rank, (child, _) in enumerate(vector_results, 1):
                parent_id = child.parent_id
                if parent_id:
                    rrf_scores[parent_id] = rrf_scores.get(parent_id, 0.0) + (1.0 / (rrf_k + rank))
            for rank, (child, _) in enumerate(keyword_results, 1):
                parent_id = child.parent_id
                if parent_id:
                    rrf_scores[parent_id] = rrf_scores.get(parent_id, 0.0) + (1.0 / (rrf_k + rank))

            # Fetch Parent Chunk models
            parent_ids = list(rrf_scores.keys())
            parent_chunks = session.query(Chunk).filter(Chunk.id.in_(parent_ids)).all()
            for p in parent_chunks:
                parents_map[p.id] = p

            sorted_parent_ids = sorted(rrf_scores.keys(), key=lambda pid: rrf_scores[pid], reverse=True)
            rrf_only_parents = [parents_map[pid] for pid in sorted_parent_ids if pid in parents_map]

            # 2. Run multi-signal confidence threshold check
            confidence = retrieval_service.calculate_confidence(vector_results, keyword_results)
            is_fallback = confidence < 0.55

            # 3. Run complete optimized hybrid search (includes Reranker + Merging)
            final_parents = retrieval_service.hybrid_search(session, q, limit=5)

            # --- Score Metrics ---
            if item["out_of_context"]:
                fallback_total += 1
                if is_fallback:
                    fallback_success += 1
                    print("  Result: Correctly triggered low-confidence fallback.")
                else:
                    print(f"  Result: [FAIL] Failed to trigger fallback. Confidence: {confidence:.4f}")
            else:
                expected_p = item["expected_page"]
                print(f"  Target: Page {expected_p}")

                # Score RRF-only Rank
                rrf_rank = None
                for rank_idx, chunk in enumerate(rrf_only_parents, 1):
                    if chunk.page_number == expected_p:
                        rrf_rank = rank_idx
                        break

                if rrf_rank:
                    rrf_mrr += 1.0 / rrf_rank
                    if rrf_rank <= 3:
                        rrf_recall_at_3 += 1
                    if rrf_rank <= 5:
                        rrf_recall_at_5 += 1
                    print(f"  - RRF-only Rank: {rrf_rank}")
                else:
                    print("  - RRF-only Rank: Not found")

                # Score Reranked Rank
                rerank_rank = None
                for rank_idx, chunk in enumerate(final_parents, 1):
                    # Check if the merged chunk contains the expected page number
                    if chunk.page_number == expected_p:
                        rerank_rank = rank_idx
                        break

                if rerank_rank:
                    rerank_mrr += 1.0 / rerank_rank
                    if rerank_rank <= 3:
                        rerank_recall_at_3 += 1
                    if rerank_rank <= 5:
                        rerank_recall_at_5 += 1
                    print(f"  - Reranked Rank: {rerank_rank}")
                else:
                    print("  - Reranked Rank: Not found")

            print()

        # Compute Final Percentages
        in_context_cases = len([x for x in EVALUATION_DATASET if not x["out_of_context"]])
        
        mrr_rrf_final = rrf_mrr / in_context_cases if in_context_cases else 0
        mrr_rerank_final = rerank_mrr / in_context_cases if in_context_cases else 0
        
        recall_at_3_rrf = rrf_recall_at_3 / in_context_cases if in_context_cases else 0
        recall_at_3_rerank = rerank_recall_at_3 / in_context_cases if in_context_cases else 0
        
        recall_at_5_rrf = rrf_recall_at_5 / in_context_cases if in_context_cases else 0
        recall_at_5_rerank = rerank_recall_at_5 / in_context_cases if in_context_cases else 0

        fallback_rate = fallback_success / fallback_total if fallback_total else 0

        print("="*80)
        print("EVALUATION SCOREBOARD SUMMARY")
        print("="*80)
        print(f"Metrics (In-Context Cases: {in_context_cases})")
        print(f"  Recall@3 (RRF-only)  : {recall_at_3_rrf * 100:.1f}%")
        print(f"  Recall@3 (Reranked)  : {recall_at_3_rerank * 100:.1f}%")
        print(f"  Recall@5 (RRF-only)  : {recall_at_5_rrf * 100:.1f}%")
        print(f"  Recall@5 (Reranked)  : {recall_at_5_rerank * 100:.1f}%")
        print(f"  MRR (RRF-only)       : {mrr_rrf_final:.4f}")
        print(f"  MRR (Reranked)       : {mrr_rerank_final:.4f}")
        print("-" * 50)
        print(f"Metrics (Out-of-Context Cases: {fallback_total})")
        print(f"  Fallback Accuracy    : {fallback_rate * 100:.1f}%")
        print("="*80 + "\n")

    finally:
        session.close()


if __name__ == "__main__":
    run_evaluation()
