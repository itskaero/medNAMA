"""Test script to verify the hybrid retrieval pipeline and on-demand captioning.

Runs 5-10 queries, prints the RRF rank results, and verifies on-demand figure
retrieval and captioning.
"""

import sys
from pathlib import Path

# Allow running as `python scripts/test_retrieval.py` from backend/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal
from app.retrieval import retrieval_service

TEST_QUERIES = [
    "Who drew the artwork for the fifth edition of the microbiology textbook?",
    "What did Louis Pasteur say about microbes having the last word?",
    "What manual was used for the new classification of bacteria?",
    "What supplementary publications are available to accompany the new edition?",
    "Which universities are the authors affiliated with?",
    "McGraw-Hill Offices Auckland Bogota Caracas Kuala Lumpur",  # Query targeting page 3 to trigger Figure 2 (page 3) retrieval
]


def run_tests():
    session = SessionLocal()
    try:
        # Force lazy load of the model first so log outputs are clean
        _ = retrieval_service.model

        print(f"\n{'='*80}")
        print("STARTING HYBRID RETRIEVAL AND ON-DEMAND CAPTIONING TESTS")
        print(f"{'='*80}\n")

        for idx, q in enumerate(TEST_QUERIES, 1):
            print(f"Query {idx}: '{q}'")
            print("-" * 50)

            # Perform RRF hybrid search
            chunks = retrieval_service.hybrid_search(session, q, limit=3)

            # Retrieve figures linked to pages of returned chunks
            figures_map = retrieval_service.retrieve_figures_for_chunks(session, chunks)

            for rank, chunk in enumerate(chunks, 1):
                print(f"  Rank {rank}: [Book ID: {chunk.book_id}] Page {chunk.page_number} | Chapter: {chunk.chapter}")
                # Print clean snippet
                snippet = chunk.content.replace("\n", " ").strip()
                if len(snippet) > 150:
                    snippet = snippet[:150] + "..."
                print(f"    Text: \"{snippet}\"")

                # Print associated figures if any
                figs = figures_map.get(chunk.id, [])
                if figs:
                    print(f"    Figures on this page ({len(figs)}):")
                    for fig in figs:
                        print(f"      - Figure label: {fig['figure_label']} (ID: {fig['id']})")
                        caption = fig["caption"]
                        if caption:
                            clean_caption = caption.replace("\n", " ").strip()
                            if len(clean_caption) > 120:
                                clean_caption = clean_caption[:120] + "..."
                            print(f"        Caption (cached): \"{clean_caption}\"")
                        else:
                            print("        Caption: None (Failed or skipped)")
                print()
            print("=" * 80 + "\n")

    finally:
        session.close()


if __name__ == "__main__":
    run_tests()
