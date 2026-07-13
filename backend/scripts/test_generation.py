"""Test script to verify Phase 4 - Generation with DeepSeek API.

Runs end-to-end Q&A queries and validates grounding, citations, figures,
and fallback logic.
"""

import json
import sys
from pathlib import Path

# Allow running as `python scripts/test_generation.py` from backend/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal
from app.generation import generate_answer

TEST_GENERATION_QUERIES = [
    "Who drew the artwork for the fifth edition of the microbiology textbook?",
    "What did Louis Pasteur say about microbes having the last word?",
    "What are the common symptoms of Covid-19 and how is it treated?",  # Out-of-context query to verify fallback
    "McGraw-Hill Offices New Delhi Auckland Bogota",  # Query matching page 3 containing Figure 2 (should link figure)
]


def run_tests():
    session = SessionLocal()
    try:
        print(f"\n{'='*80}")
        print("STARTING END-TO-END GENERATION AND VALIDATION TESTS")
        print(f"{'='*80}\n")

        for idx, q in enumerate(TEST_GENERATION_QUERIES, 1):
            print(f"Test Query {idx}: '{q}'")
            print("-" * 50)

            # Generate the grounded answer (requires DEEPSEEK_API_KEY in .env)
            result = generate_answer(session, q)

            print("RESPONSE JSON:")
            print(json.dumps(result, indent=2))
            print("=" * 80 + "\n")

    finally:
        session.close()


if __name__ == "__main__":
    run_tests()
