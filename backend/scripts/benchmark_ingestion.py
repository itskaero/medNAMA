"""Benchmark script for optimized parallel, quantized, and batch-flushed ingestion."""

import sys
import time
from pathlib import Path

# Allow running from backend/ folder
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal
from app.models import Book
from app.ingestion import ingest_book


def main():
    pdf_path = "F:/Code/medRAG/pdfs/microbiology_sample.pdf"
    path = Path(pdf_path)
    if not path.exists():
        print(f"Error: PDF not found at {path}")
        return

    # Delete previous book record to force clean re-ingestion
    session = SessionLocal()
    try:
        existing = session.query(Book).filter(Book.filename == path.name).first()
        if existing:
            session.delete(existing)
            session.commit()
            print("Cleaned up old microbiology sample book record.")
    finally:
        session.close()

    print("\n" + "="*60)
    print(f"STARTING OPTIMIZED INGESTION BENCHMARK ON: {path.name} (10 pages)")
    print("Pipeline optimization: INT8 quantization, Batch DB flushes, Parallel Workers.")
    print("="*60 + "\n")

    # Time execution including first startup/model initialization
    t0 = time.perf_counter()
    ingest_book(path)
    t1 = time.perf_counter()

    duration = t1 - t0
    print("\n" + "="*60)
    print("BENCHMARK COMPLETED")
    print(f"Total Ingestion Duration (Cold Start included): {duration:.3f} seconds")
    print(f"Previous Sequential Time (Pure execution)   : 33.507 seconds")
    print(f"Previous Cold Start loading time           : 37.346 seconds")
    print(f"Previous Total Sequential (Cold+Exec)      : 70.853 seconds")
    print(f"Net overall speedup                        : {((70.853 - duration) / 70.853) * 100:.1f}%")
    print("="*60 + "\n")


if __name__ == "__main__":
    main()
