"""Profiling script for the medRAG ingestion pipeline.

Measures precise elapsed times spent in model initialization, PDF slicing,
Docling layout parsing, chunking, embedding generation, and DB insertion.
"""

import sys
import time
from pathlib import Path

# Allow running from backend/ folder
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal
from app.models import Book


def profile_pipeline(pdf_path: str):
    path = Path(pdf_path)
    if not path.exists():
        print(f"[ERROR] PDF not found: {path}")
        return

    print("\n" + "="*80)
    print(f"PROFILING INGESTION PIPELINE ON: {path.name}")
    print("="*80 + "\n")

    # Clean out old book run if exists to ensure clean DB commits
    session = SessionLocal()
    try:
        existing = session.query(Book).filter(Book.filename == path.name).first()
        if existing:
            session.delete(existing)
            session.commit()
    finally:
        session.close()

    metrics = {}

    # 1. Model Initialization Time (Cold Start)
    t0 = time.perf_counter()
    import gc
    from app.ingestion import get_document_converter, get_embedding_model
    
    print("[1/6] Loading models (Cold Start initialization)...")
    t_conv_init_start = time.perf_counter()
    converter = get_document_converter()
    t_conv_init_end = time.perf_counter()
    
    t_emb_init_start = time.perf_counter()
    emb_model = get_embedding_model()
    t_emb_init_end = time.perf_counter()
    
    metrics["conv_init_cold"] = t_conv_init_end - t_conv_init_start
    metrics["emb_init_cold"] = t_emb_init_end - t_emb_init_start
    metrics["total_init_cold"] = time.perf_counter() - t0

    # Verify Warm Start
    t_warm_start = time.perf_counter()
    _ = get_document_converter()
    _ = get_embedding_model()
    metrics["warm_start_overhead"] = time.perf_counter() - t_warm_start

    # 2. Main Ingestion Steps
    from pypdf import PdfReader, PdfWriter
    import tempfile
    from app.ingestion import _parse_pdf, _extract_figures, split_into_children, Figure, Chunk

    reader = PdfReader(path)
    num_pages = len(reader.pages)
    
    t_slicing_total = 0.0
    t_docling_total = 0.0
    t_figs_total = 0.0
    t_chunking_total = 0.0
    t_embedding_total = 0.0
    t_db_total = 0.0

    session = SessionLocal()
    try:
        book = Book(title="Profiling Run", filename=path.name, status="processing")
        session.add(book)
        session.commit()
        book_id = book.id

        total_parents = 0
        total_children = 0
        total_figs = 0

        # Run page batch loops
        PAGE_CHUNK_SIZE = 50
        fig_count = 0

        for start_idx in range(0, num_pages, PAGE_CHUNK_SIZE):
            end_idx = min(start_idx + PAGE_CHUNK_SIZE, num_pages)

            # A. Slicing
            t_slice_start = time.perf_counter()
            writer = PdfWriter()
            for i in range(start_idx, end_idx):
                writer.add_page(reader.pages[i])

            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as temp_pdf:
                temp_pdf_path = Path(temp_pdf.name)

            with open(temp_pdf_path, "wb") as f:
                writer.write(f)
            t_slicing_total += time.perf_counter() - t_slice_start

            # B. Docling Layout Analysis & Conversion
            t_docling_start = time.perf_counter()
            result = _parse_pdf(temp_pdf_path)
            t_docling_total += time.perf_counter() - t_docling_start

            # C. Figure Extraction
            t_figs_start = time.perf_counter()
            figures_data = _extract_figures(result, book_id, start_idx, fig_count)
            fig_count += len(figures_data)
            for fig in figures_data:
                session.add(Figure(**fig))
            t_figs_total += time.perf_counter() - t_figs_start

            # D. Chunking (Parent-Child)
            t_chunk_start = time.perf_counter()
            chunks_to_embed = []
            from docling.chunking import HierarchicalChunker
            chunker = HierarchicalChunker(max_tokens=512)
            doc_chunks = list(chunker.chunk(result.document))

            for dc in doc_chunks:
                page_num = None
                if hasattr(dc, "meta") and dc.meta:
                    prov = getattr(dc.meta, "doc_items", None)
                    if prov:
                        for item in prov:
                            if hasattr(item, "prov") and item.prov:
                                page_num = item.prov[0].page_no + start_idx
                                break

                chapter = None
                headings_list = []
                if hasattr(dc, "meta") and dc.meta:
                    headings = getattr(dc.meta, "headings", None)
                    if headings:
                        headings_list = list(headings)
                        chapter = " > ".join(headings_list)

                # Store Parent
                parent_chunk = Chunk(
                    book_id=book_id,
                    chapter=chapter,
                    page_number=page_num,
                    content=dc.text,
                    parent_id=None,
                    embedding=None,
                    extra_metadata={"type": "parent", "headings": headings_list}
                )
                session.add(parent_chunk)
                
                # DB flush to get parent ID
                t_db_flush_start = time.perf_counter()
                session.flush()
                t_db_total += time.perf_counter() - t_db_flush_start
                total_parents += 1

                child_texts = split_into_children(dc.text, max_words=150)
                for child_text in child_texts:
                    context_prefix = f"Textbook: Profiling | Chapter: {chapter or 'N/A'} | Page: {page_num or 'N/A'}"
                    enriched_content = f"{context_prefix}\n{child_text}"

                    child_chunk = Chunk(
                        book_id=book_id,
                        chapter=chapter,
                        page_number=page_num,
                        content=enriched_content,
                        parent_id=parent_chunk.id,
                        embedding=None,
                        extra_metadata={"type": "child", "original_text": child_text}
                    )
                    session.add(child_chunk)
                    chunks_to_embed.append(child_chunk)
            t_chunking_total += time.perf_counter() - t_chunk_start

            # E. Embedding Generation
            t_embed_start = time.perf_counter()
            if chunks_to_embed:
                texts_to_embed = [c.content for c in chunks_to_embed]
                embeddings = emb_model.encode(texts_to_embed, batch_size=64, show_progress_bar=False, normalize_embeddings=True)
                for c_obj, emb in zip(chunks_to_embed, embeddings):
                    c_obj.embedding = emb.tolist()
                    total_children += 1
            t_embedding_total += time.perf_counter() - t_embed_start

            # F. Database Insertion Commit
            t_db_commit_start = time.perf_counter()
            session.commit()
            t_db_total += time.perf_counter() - t_db_commit_start

            if temp_pdf_path.exists():
                temp_pdf_path.unlink()
            gc.collect()

        book.status = "ready"
        book.total_pages = num_pages
        session.commit()

        # Print detailed profiling breakdown
        total_pipeline_time = (
            t_slicing_total + t_docling_total + t_figs_total + t_chunking_total + t_embedding_total + t_db_total
        )

        print("="*80)
        print("PROFILING RESULTS BREAKDOWN")
        print("="*80)
        print(f"Cold Start Initialization Time: {metrics['total_init_cold']:.3f} s")
        print(f"  - DocumentConverter Loading : {metrics['conv_init_cold']:.3f} s")
        print(f"  - SentenceTransformer Loading: {metrics['emb_init_cold']:.3f} s")
        print(f"Warm Start Singleton Overhead : {metrics['warm_start_overhead']:.6f} s")
        print("-" * 50)
        print(f"Total Pipeline Execution Time : {total_pipeline_time:.3f} s")
        print(f"  - PDF Slicing / Temporary IO: {t_slicing_total:.3f} s  ({(t_slicing_total/total_pipeline_time)*100:.1f}%)")
        print(f"  - Docling Layout Conversion  : {t_docling_total:.3f} s  ({(t_docling_total/total_pipeline_time)*100:.1f}%)")
        print(f"  - Figure Extraction         : {t_figs_total:.3f} s  ({(t_figs_total/total_pipeline_time)*100:.1f}%)")
        print(f"  - Chunking (Parent-Child)   : {t_chunking_total:.3f} s  ({(t_chunking_total/total_pipeline_time)*100:.1f}%)")
        print(f"  - Embedding Generation      : {t_embedding_total:.3f} s  ({(t_embedding_total/total_pipeline_time)*100:.1f}%)")
        print(f"  - Database Flush & Commits  : {t_db_total:.3f} s  ({(t_db_total/total_pipeline_time)*100:.1f}%)")
        print("-" * 50)
        print(f"Processed: {num_pages} pages")
        print(f"Extracted: {total_parents} parent chunks, {total_children} child chunks, {fig_count} figures.")
        print(f"Throughput: {num_pages / total_pipeline_time:.2f} pages/second")
        print("="*80 + "\n")

    except Exception as e:
        session.rollback()
        print(f"[ERROR] Profiling run failed: {e}")
        raise
    finally:
        # Delete profiling book to prevent database clutter
        try:
            p_book = session.query(Book).filter(Book.title == "Profiling Run").first()
            if p_book:
                session.delete(p_book)
                session.commit()
        except:
            pass
        session.close()


if __name__ == "__main__":
    profile_pipeline("F:/Code/medRAG/pdfs/microbiology_sample.pdf")
