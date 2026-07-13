"""CLI wrapper for book ingestion. Calls the same ingest_book() used by the API.

Usage:
    python scripts/ingest_cli.py path/to/book.pdf [--title "Custom Title"]
    python scripts/ingest_cli.py path/to/pdfs/  # ingest all PDFs in a directory
"""

import argparse
import logging
import sys
from pathlib import Path

# Allow running from backend/ directory
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ingestion import ingest_book

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest PDF books into the medRAG database.")
    parser.add_argument("path", help="Path to a PDF file or directory of PDFs")
    parser.add_argument("--title", help="Book title (only for single file; ignored for directories)")
    args = parser.parse_args()

    target = Path(args.path)

    if target.is_file():
        pdf_files = [target]
    elif target.is_dir():
        pdf_files = sorted(target.glob("*.pdf"))
        if not pdf_files:
            logger.error(f"No PDF files found in {target}")
            sys.exit(1)
        logger.info(f"Found {len(pdf_files)} PDFs in {target}")
    else:
        logger.error(f"Path not found: {target}")
        sys.exit(1)

    results = {"ok": [], "failed": []}

    for pdf in pdf_files:
        title = args.title if len(pdf_files) == 1 else None
        try:
            book_id = ingest_book(pdf, title=title)
            results["ok"].append((pdf.name, book_id))
        except Exception as e:
            logger.error(f"FAILED: {pdf.name} - {e}")
            results["failed"].append((pdf.name, str(e)))

    # Summary
    print(f"\n{'='*60}")
    print(f"Ingestion summary: {len(results['ok'])} succeeded, {len(results['failed'])} failed")
    for name, book_id in results["ok"]:
        print(f"  OK: {name} (book_id={book_id})")
    for name, err in results["failed"]:
        print(f"  FAILED: {name} - {err}")


if __name__ == "__main__":
    main()
