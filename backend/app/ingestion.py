"""Book ingestion pipeline: PDF -> parse -> figures -> chunks -> embeddings -> DB.

Supports parallelized page-sliced conversion, dynamic INT8 quantization, and
optimized batch database transaction flushes (Proposals 1, 2 & 3).
"""

import gc
import io
import logging
import re
import tempfile
from pathlib import Path
from typing import Any

from app.config import settings
from app.database import SessionLocal
from app.models import Book, Chunk, Figure

logger = logging.getLogger(__name__)

PDF_MAGIC = b"%PDF"
PAGE_CHUNK_SIZE = 50  # Slice size to avoid memory bloat
_embedding_model = None
_document_converter = None


def get_embedding_model():
    """Lazy load, cache and dynamically quantize embedding model (Proposal 2)."""
    global _embedding_model
    if _embedding_model is None:
        import torch
        from sentence_transformers import SentenceTransformer

        logger.info("Loading embedding model (bge-large-en-v1.5) with dynamic INT8 CPU quantization...")
        model = SentenceTransformer("BAAI/bge-large-en-v1.5")
        
        # Quantize CPU linear operations to INT8 to accelerate inference by 2x-3x
        _embedding_model = torch.quantization.quantize_dynamic(
            model, {torch.nn.Linear}, dtype=torch.qint8
        )
    return _embedding_model


def get_document_converter():
    """Lazy load and cache DocumentConverter singleton to avoid reinitialization overhead."""
    global _document_converter
    if _document_converter is None:
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.pipeline_options import PdfPipelineOptions
        from docling.document_converter import DocumentConverter, PdfFormatOption

        logger.info("Initializing DocumentConverter singleton (OCR = False)...")
        pipeline_options = PdfPipelineOptions()
        pipeline_options.do_ocr = False
        pipeline_options.generate_picture_images = True
        pipeline_options.images_scale = 2.0

        _document_converter = DocumentConverter(
            format_options={
                InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
            }
        )
    return _document_converter


def validate_pdf(path: Path) -> None:
    """Check magic bytes and file size. Raises ValueError on failure."""
    if not path.exists():
        raise FileNotFoundError(f"File not found: {path}")
    size = path.stat().st_size
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if size > max_bytes:
        raise ValueError(f"File too large: {size / 1e6:.0f}MB (limit: {settings.max_upload_size_mb}MB)")
    with open(path, "rb") as f:
        magic = f.read(4)
    if magic != PDF_MAGIC:
        raise ValueError(f"Not a valid PDF (magic bytes: {magic!r})")


def _parse_pdf(pdf_path: Path):
    """Parse PDF with cached DocumentConverter singleton."""
    converter = get_document_converter()
    return converter.convert(str(pdf_path))


def split_into_children(text: str, max_words: int = 150) -> list[str]:
    """Split a larger text chunk into smaller sentences-grouped child segments."""
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    chunks = []
    current_chunk = []
    current_words = 0

    for sentence in sentences:
        if not sentence.strip():
            continue
        sentence_words = len(sentence.split())
        if current_words + sentence_words > max_words and current_chunk:
            chunks.append(" ".join(current_chunk))
            current_chunk = [sentence]
            current_words = sentence_words
        else:
            current_chunk.append(sentence)
            current_words += sentence_words

    if current_chunk:
        chunks.append(" ".join(current_chunk))
    return chunks


def _process_slice_worker(args: dict) -> dict:
    """Independent worker processing a single page-slice of a book (Proposal 3).

    Handles Docling layout conversion, figure extraction, parent-child split,
    quantized embedding calculation, and batch database flushes (Proposal 1).
    """
    pdf_path = Path(args["pdf_path"])
    book_id = args["book_id"]
    title = args["title"]
    start_idx = args["start_idx"]
    end_idx = args["end_idx"]

    # Open isolated database session for this worker process
    session = SessionLocal()
    try:
        from pypdf import PdfReader, PdfWriter
        import tempfile
        import gc

        # 1. Slice PDF
        reader = PdfReader(pdf_path)
        writer = PdfWriter()
        for i in range(start_idx, end_idx):
            writer.add_page(reader.pages[i])

        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as temp_pdf:
            temp_pdf_path = Path(temp_pdf.name)

        try:
            with open(temp_pdf_path, "wb") as f:
                writer.write(f)

            # 2. Parse slice with Docling
            result = _parse_pdf(temp_pdf_path)

            # 3. Extract Figures (Labels use page-specific names to prevent sync conflicts)
            figures_data = []
            from docling_core.types.doc import PictureItem
            doc = result.document
            fig_idx = 0
            
            for element, _level in doc.iterate_items():
                if not isinstance(element, PictureItem):
                    continue
                pil_image = element.get_image(doc)
                if pil_image is None:
                    continue
                fig_idx += 1

                buf = io.BytesIO()
                pil_image.save(buf, format="PNG")
                image_bytes = buf.getvalue()

                page_num = None
                if hasattr(element, "prov") and element.prov:
                    page_num = element.prov[0].page_no + start_idx

                figures_data.append({
                    "book_id": book_id,
                    "figure_label": f"Figure {page_num or 'N/A'}-{fig_idx}",
                    "caption": None,
                    "page_number": page_num,
                    "image_data": image_bytes,
                    "mime_type": "image/png",
                })

            for fig in figures_data:
                session.add(Figure(**fig))

            # 4. Chunk & Map Parents (Proposals 1 & 10)
            from docling.chunking import HierarchicalChunker
            chunker = HierarchicalChunker(max_tokens=512)
            doc_chunks = list(chunker.chunk(result.document))

            parents_to_add = []
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

                is_table = bool(re.search(r"\|.*\|.*?\n\|[-:| ]+\|", dc.text) or "table" in (chapter or "").lower())

                parent_chunk = Chunk(
                    book_id=book_id,
                    chapter=chapter,
                    page_number=page_num,
                    content=dc.text,
                    parent_id=None,
                    embedding=None,
                    extra_metadata={
                        "type": "parent",
                        "is_table": is_table,
                        "headings": headings_list
                    }
                )
                session.add(parent_chunk)
                parents_to_add.append(parent_chunk)

            # Single Database Flush to assign primary keys in one transaction (Proposal 1)
            session.flush()

            # 5. Map Children
            chunks_to_embed = []
            for parent_chunk, dc in zip(parents_to_add, doc_chunks):
                child_texts = split_into_children(dc.text, max_words=150)
                for child_text in child_texts:
                    context_prefix = f"Textbook: {title} | Chapter: {parent_chunk.chapter or 'N/A'} | Page: {parent_chunk.page_number or 'N/A'}"
                    enriched_content = f"{context_prefix}\n{child_text}"

                    child_chunk = Chunk(
                        book_id=book_id,
                        chapter=parent_chunk.chapter,
                        page_number=parent_chunk.page_number,
                        content=enriched_content,
                        parent_id=parent_chunk.id,
                        embedding=None,
                        extra_metadata={
                            "type": "child",
                            "original_text": child_text,
                            "is_table": parent_chunk.extra_metadata["is_table"]
                        }
                    )
                    session.add(child_chunk)
                    chunks_to_embed.append(child_chunk)

            # 6. Embed Child Chunks (Proposal 2)
            if chunks_to_embed:
                texts_to_embed = [c.content for c in chunks_to_embed]
                model = get_embedding_model()
                embeddings = model.encode(texts_to_embed, batch_size=64, show_progress_bar=False, normalize_embeddings=True)
                for c_obj, emb in zip(chunks_to_embed, embeddings):
                    c_obj.embedding = emb.tolist()

            # 7. Commit transaction
            session.commit()
            
            return {
                "success": True,
                "parent_count": len(parents_to_add),
                "child_count": len(chunks_to_embed),
                "fig_count": len(figures_data)
            }

        finally:
            if temp_pdf_path.exists():
                temp_pdf_path.unlink()
            gc.collect()

    except Exception as e:
        session.rollback()
        logger.error(f"Error in slice worker {start_idx}-{end_idx}: {e}")
        return {"success": False, "error": str(e)}
    finally:
        session.close()


def ingest_book(pdf_path: str | Path, title: str | None = None) -> int:
    """Ingest a PDF book.

    Splits the conversion work into parallel page slices using a ProcessPoolExecutor
    to protect resources and double total throughput (Proposal 3).
    """
    path = Path(pdf_path)
    validate_pdf(path)

    if title is None:
        title = path.stem.replace("-", " ").replace("_", " ").title()

    session = SessionLocal()
    try:
        # Check if book already exists
        existing = session.query(Book).filter(Book.filename == path.name).first()
        if existing:
            if existing.status == "ready":
                logger.info(f"Book '{path.name}' already ingested successfully (id={existing.id}). Skipping.")
                return existing.id
            else:
                logger.info(f"Book '{path.name}' is in status '{existing.status}'. Re-ingesting (deleting old record first).")
                session.delete(existing)
                session.commit()

        # Create book record with status=processing
        book = Book(title=title, filename=path.name, status="processing")
        session.add(book)
        session.commit()
        book_id = book.id
        logger.info(f"Book record created: id={book_id}, title='{title}'")

        try:
            from pypdf import PdfReader
            from concurrent.futures import ProcessPoolExecutor

            reader = PdfReader(path)
            num_pages = len(reader.pages)
            logger.info(f"Book '{path.name}' has {num_pages} pages. Processing in parallel slices of {PAGE_CHUNK_SIZE}...")

            # Prepare slice tasks
            tasks = []
            for start_idx in range(0, num_pages, PAGE_CHUNK_SIZE):
                end_idx = min(start_idx + PAGE_CHUNK_SIZE, num_pages)
                tasks.append({
                    "pdf_path": str(path),
                    "book_id": book_id,
                    "title": title,
                    "start_idx": start_idx,
                    "end_idx": end_idx
                })

            total_parent_chunks = 0
            total_child_chunks = 0
            total_figures = 0

            # Execute slices in parallel (2 workers fits CPU resource boundaries perfectly)
            with ProcessPoolExecutor(max_workers=2) as executor:
                results = list(executor.map(_process_slice_worker, tasks))

            # Verify and gather results
            for idx, res in enumerate(results):
                start = tasks[idx]["start_idx"]
                end = tasks[idx]["end_idx"]
                
                if not res.get("success", False):
                    raise RuntimeError(f"Parallel slice ingestion {start}-{end} failed: {res.get('error')}")
                
                total_parent_chunks += res.get("parent_count", 0)
                total_child_chunks += res.get("child_count", 0)
                total_figures += res.get("fig_count", 0)
                logger.info(f"✓ Slice {start}-{end} complete.")

            # Mark book ready
            book = session.get(Book, book_id)
            if book:
                book.status = "ready"
                book.total_pages = num_pages
                session.commit()

            logger.info(
                f"Ingestion complete: book_id={book_id}. "
                f"Total {total_parent_chunks} parent chunks, {total_child_chunks} child chunks, {total_figures} figures."
            )
            return book_id

        except Exception as e:
            session.rollback()
            book = session.get(Book, book_id)
            if book:
                book.status = "failed"
                book.error_message = str(e)[:500]
                session.commit()
            logger.error(f"Ingestion failed for '{path.name}': {e}")
            raise

    finally:
        session.close()
