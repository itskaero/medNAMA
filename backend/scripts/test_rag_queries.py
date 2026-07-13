"""Script to run test queries against the running RAG endpoint and verify correctness."""

import sys
import requests
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

API_URL = "http://127.0.0.1:8000"


def test_queries():
    session = requests.Session()

    # 1. Login
    print("Logging in...")
    login_res = session.post(
        f"{API_URL}/api/auth/login",
        data={"username": "admin", "password": "admin123"},
    )
    if login_res.status_code != 200:
        print(f"Failed to log in: {login_res.text}")
        return
    print("OK: Successfully logged in.\n")

    # Queries to test
    queries = [
        "Who drew the artwork for Pelczar's fifth edition?",
        "What did Louis Pasteur say about microbes?",
        "What manual is used for bacterial classification?",
        "What is the difference between gram-positive and gram-negative bacteria?",
    ]

    for idx, q in enumerate(queries, 1):
        print("=" * 70)
        print(f"TEST QUERY {idx}: '{q}'")
        print("=" * 70)

        # Call query endpoint
        res = session.post(
            f"{API_URL}/api/query",
            json={"query": q, "confidence_threshold": 0.35},
        )

        if res.status_code != 200:
            print(f"Error querying backend: {res.status_code} - {res.text}")
            continue

        data = res.json()

        # Print Synthesis
        print("\n[RAG ANSWER]:")
        print(data.get("answer_markdown", "").strip())

        # Print Citations
        citations = data.get("citations", [])
        print(f"\n[CITATIONS] ({len(citations)}):")
        for c_idx, cit in enumerate(citations, 1):
            print(f"  {c_idx}. Book: {cit.get('book_title')} | Page: {cit.get('page_number')}")
            # print excerpt snippet
            excerpt = cit.get("excerpt", "")
            excerpt_snippet = excerpt[:120].strip().replace("\n", " ") + "..."
            print(f"     Excerpt: {excerpt_snippet}")

        # Print Figures
        figures = data.get("figures", [])
        print(f"\n[EXTRACTED FIGURES] ({len(figures)}):")
        for fig in figures:
            print(f"  - ID: {fig.get('id')} | Label: {fig.get('figure_label')}")
            if fig.get("reason_to_include"):
                print(f"    Reason: {fig.get('reason_to_include')}")
        print("\n")


if __name__ == "__main__":
    test_queries()
