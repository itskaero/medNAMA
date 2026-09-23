"""Hybrid retrieval pipeline (vector + keyword search) with parent-child mapping,
Reciprocal Rank Fusion (RRF), Cross-Encoder reranking, and synonym query expansion.
"""

import io
import logging
import re
from pathlib import Path
from PIL import Image

from sqlalchemy import text
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.models import Chunk, Figure

logger = logging.getLogger(__name__)

# BGE v1.5 models require this prefix for query embeddings
BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: "

# Medical synonym mapping for query expansion (Proposal 9)
MEDICAL_SYNONYMS = {
    r"\bmi\b": "Myocardial Infarction heart attack",
    r"\bgis\b": "Gastrointestinal system",
    r"\bgi\b": "Gastrointestinal",
    r"\bgerd\b": "Gastroesophageal reflux disease acid reflux",
    r"\bcopd\b": "Chronic obstructive pulmonary disease",
    r"\buti\b": "Urinary tract infection",
    r"\bsle\b": "Systemic lupus erythematosus",
    r"\btb\b": "Tuberculosis",
    r"\bcvs\b": "Cardiovascular system",
    r"\bcns\b": "Central nervous system",
}

_reranker_model = None


def get_reranker_model():
    """Lazy load and cache Cross-Encoder reranking model (Proposal 1 & 7)."""
    global _reranker_model
    if _reranker_model is None:
        from sentence_transformers import CrossEncoder

        logger.info("Loading Cross-Encoder reranker (ms-marco-MiniLM-L-6-v2)...")
        _reranker_model = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
    return _reranker_model


def expand_medical_query(query: str) -> str:
    """Enrich search query with medical synonyms and expansions (Proposal 9)."""
    extra_terms = []
    for pattern, expansion in MEDICAL_SYNONYMS.items():
        if re.search(pattern, query, flags=re.IGNORECASE):
            extra_terms.append(expansion)
    if extra_terms:
        expanded = f"{query} {' '.join(extra_terms)}"
        logger.info(f"Expanded medical query: '{query}' -> '{expanded}'")
        return expanded
    return query


class RetrievalService:
    def __init__(self):
        self._model = None

    @property
    def model(self):
        """Re-use the cached, dynamically quantized embedding model singleton."""
        from app.ingestion import get_embedding_model
        return get_embedding_model()

    def _embed_query(self, query: str) -> list[float]:
        """Embed search query with BGE-specific prefix."""
        prefixed_query = BGE_QUERY_PREFIX + query
        embedding = self.model.encode(prefixed_query, normalize_embeddings=True)
        return embedding.tolist()

    def vector_search(self, session: Session, query_embedding: list[float], limit: int = 50, book_id: int | None = None, chapter: str | None = None) -> list[tuple[Chunk, float]]:
        """Run vector similarity search on child chunks. Optional book/chapter filtering."""
        # Query only child chunks (which have parent_id IS NOT NULL and carry embeddings)
        query_stmt = session.query(
            Chunk, (1.0 - Chunk.embedding.cosine_distance(query_embedding)).label("score")
        ).filter(Chunk.parent_id.isnot(None))

        if book_id is not None:
            query_stmt = query_stmt.filter(Chunk.book_id == book_id)
        if chapter:
            query_stmt = query_stmt.filter(Chunk.chapter.ilike(f"%{chapter.strip()}%"))

        stmt = query_stmt.order_by(text("score DESC")).limit(limit)
        results = stmt.all()
        return [(row[0], float(row[1])) for row in results]

    def keyword_search(self, session: Session, query: str, limit: int = 50, book_id: int | None = None, chapter: str | None = None) -> list[tuple[Chunk, float]]:
        """Run full-text search on child chunks. Optional book/chapter filtering."""
        # Run synonym query expansion to increase keyword recall
        expanded_query = expand_medical_query(query)

        # Retrieve matching child chunks
        sql_query = """
            SELECT id, ts_rank_cd(to_tsvector('english', content), websearch_to_tsquery('english', :query)) as rank
            FROM chunks
            WHERE parent_id IS NOT NULL 
              AND to_tsvector('english', content) @@ websearch_to_tsquery('english', :query)
        """
        params = {"query": expanded_query, "limit": limit}
        if book_id is not None:
            sql_query += " AND book_id = :book_id"
            params["book_id"] = book_id
        if chapter:
            sql_query += " AND chapter ILIKE :chapter"
            params["chapter"] = f"%{chapter.strip()}%"

        sql_query += " ORDER BY rank DESC LIMIT :limit"

        raw_results = session.execute(text(sql_query), params).fetchall()
        if not raw_results:
            return []

        chunk_ids = [row[0] for row in raw_results]
        ranks = {row[0]: float(row[1]) for row in raw_results}

        chunks = session.query(Chunk).filter(Chunk.id.in_(chunk_ids)).all()
        sorted_chunks = sorted(chunks, key=lambda c: ranks[c.id], reverse=True)
        return [(chunk, ranks[chunk.id]) for chunk in sorted_chunks]

    def merge_adjacent_parent_chunks(self, chunks: list[Chunk]) -> list[Chunk]:
        """Merge contiguous parent chunks to maintain context boundaries (Proposal 3) while preserving relevance ranking."""
        if not chunks:
            return []

        # Map each chunk ID to its original rank index (0 = best rank)
        original_rank = {c.id: idx for idx, c in enumerate(chunks)}

        # Group by book
        by_book = {}
        for c in chunks:
            by_book.setdefault(c.book_id, []).append(c)

        merged_chunks = []

        for book_id, book_chunks in by_book.items():
            # Sort chronologically by ID to locate contiguous neighbors
            sorted_chunks = sorted(book_chunks, key=lambda x: x.id)

            current = sorted_chunks[0]
            best_rank = original_rank[current.id]

            for next_chunk in sorted_chunks[1:]:
                # If contiguous and on the same page
                if next_chunk.id == current.id + 1 and next_chunk.page_number == current.page_number:
                    merged_content = f"{current.content}\n\n{next_chunk.content}"
                    best_rank = min(best_rank, original_rank[next_chunk.id])
                    current = Chunk(
                        id=current.id,
                        book_id=current.book_id,
                        book=current.book,
                        chapter=current.chapter,
                        page_number=current.page_number,
                        content=merged_content,
                        parent_id=None,
                        extra_metadata=current.extra_metadata
                    )
                else:
                    merged_chunks.append((current, best_rank))
                    current = next_chunk
                    best_rank = original_rank[next_chunk.id]
            merged_chunks.append((current, best_rank))

        # Sort merged chunks back to original relevance rank order
        merged_chunks.sort(key=lambda x: x[1])

        return [chunk for chunk, _ in merged_chunks]

    def rerank_chunks(self, query: str, parent_chunks: list[Chunk], limit: int = 5) -> list[tuple[Chunk, float]]:
        """Rerank parent chunks using Cross-Encoder model (Proposal 1 & 7)."""
        if not parent_chunks:
            return []

        reranker = get_reranker_model()
        # Formulate inference pairs: (query, passage)
        pairs = [(query, c.content) for c in parent_chunks]
        scores = reranker.predict(pairs)

        scored_chunks = sorted(zip(parent_chunks, scores), key=lambda x: x[1], reverse=True)
        logger.info(f"Cross-Encoder reranked {len(parent_chunks)} parent candidates. Top score: {scored_chunks[0][1]:.4f}")
        return scored_chunks[:limit]

    def calculate_confidence(self, vector_results: list[tuple[Chunk, float]], keyword_results: list[tuple[Chunk, float]]) -> float:
        """Calculate multi-signal confidence score across vector and keyword parameters (Proposal 2)."""
        max_vector_score = vector_results[0][1] if vector_results else 0.0
        max_keyword_rank = keyword_results[0][1] if keyword_results else 0.0
        
        # Count high-match children
        supporting_density = sum(1 for _, score in vector_results if score > 0.48)

        # Scoring heuristics
        if max_vector_score >= 0.58:
            return max_vector_score  # High semantic confidence
        elif max_vector_score >= 0.51 and supporting_density >= 2:
            return max_vector_score  # Moderate semantic match with supporting density
        elif max_keyword_rank >= 1.5 and max_vector_score >= 0.47:
            return max_vector_score  # Strong keyword match + decent semantic context
        
        return max_vector_score

    def hybrid_search(
        self, session: Session, query: str, limit: int = 5, rrf_k: int = 60, book_id: int | None = None, chapter: str | None = None
    ) -> list[Chunk]:
        """Perform optimized hybrid search returning parent chunks (Proposal 10).

        1. Vectors & Keyword queries run against child chunks.
        2. Child matches resolve to parent chunks.
        3. RRF merges results.
        4. Cross-Encoder reranks the top RRF parents.
        5. Contiguous parent chunks are merged.
        """
        logger.info(f"Performing optimized parent-child hybrid search for: '{query}'")

        # 1. Run Search
        query_embedding = self._embed_query(query)
        vector_results = self.vector_search(session, query_embedding, limit=30, book_id=book_id, chapter=chapter)
        keyword_results = self.keyword_search(session, query, limit=30, book_id=book_id, chapter=chapter)

        # 2. Reciprocal Rank Fusion on Parent Chunk IDs
        rrf_scores = {}  # parent_id -> rrf_score
        parents_map = {}  # parent_id -> parent Chunk object

        # Process vector matches
        for rank, (child_chunk, _) in enumerate(vector_results, 1):
            parent_id = child_chunk.parent_id
            if not parent_id:
                continue
            rrf_scores[parent_id] = rrf_scores.get(parent_id, 0.0) + (1.0 / (rrf_k + rank))

        # Process keyword matches
        for rank, (child_chunk, _) in enumerate(keyword_results, 1):
            parent_id = child_chunk.parent_id
            if not parent_id:
                continue
            rrf_scores[parent_id] = rrf_scores.get(parent_id, 0.0) + (1.0 / (rrf_k + rank))

        if not rrf_scores:
            return []

        # 3. Retrieve Parent Chunk models with eager loaded Book relationships
        parent_ids = list(rrf_scores.keys())
        parent_chunks = session.query(Chunk).filter(Chunk.id.in_(parent_ids)).options(joinedload(Chunk.book)).all()
        for p in parent_chunks:
            parents_map[p.id] = p

        # Sort RRF candidates
        sorted_parent_ids = sorted(rrf_scores.keys(), key=lambda pid: rrf_scores[pid], reverse=True)
        # Fetch top 15 RRF parents for rerank pass
        top_rrf_parents = [parents_map[pid] for pid in sorted_parent_ids[:15] if pid in parents_map]

        # 4. Cross-Encoder Rerank Top candidates (Proposal 1 & 7)
        reranked_tuples = self.rerank_chunks(query, top_rrf_parents, limit=8)
        reranked_parents = [t[0] for t in reranked_tuples]

        # 5. Merge contiguous paragraphs (Proposal 3)
        merged_parents = self.merge_adjacent_parent_chunks(reranked_parents)

        # Return up to user limit
        return merged_parents[:limit]

    def candidate_search(
        self, session: Session, query: str, limit: int = 8, book_id: int | None = None, chapter: str | None = None
    ) -> list[dict]:
        """Return the pre-merge reranked candidates for the "matched sources" panel.

        Same pipeline as hybrid_search but exposes every reranked parent chunk
        (not just the ones merged into the answer context), so the user can see
        which books/chapters actually matched and pick one to drill into.
        """
        query_embedding = self._embed_query(query)
        vector_results = self.vector_search(session, query_embedding, limit=30, book_id=book_id, chapter=chapter)
        keyword_results = self.keyword_search(session, query, limit=30, book_id=book_id, chapter=chapter)

        rrf_scores: dict[int, float] = {}
        for rank, (child_chunk, _) in enumerate(vector_results, 1):
            pid = child_chunk.parent_id or child_chunk.id
            if pid:
                rrf_scores[pid] = rrf_scores.get(pid, 0.0) + (1.0 / (60 + rank))
        for rank, (child_chunk, _) in enumerate(keyword_results, 1):
            pid = child_chunk.parent_id or child_chunk.id
            if pid:
                rrf_scores[pid] = rrf_scores.get(pid, 0.0) + (1.0 / (60 + rank))

        if not rrf_scores:
            return []

        parents = session.query(Chunk).filter(Chunk.id.in_(list(rrf_scores.keys()))).options(joinedload(Chunk.book)).all()
        parents_map = {p.id: p for p in parents}
        top_rrf = [parents_map[pid] for pid in sorted(rrf_scores, key=lambda pid: rrf_scores[pid], reverse=True)[:15] if pid in parents_map]

        reranked = self.rerank_chunks(query, top_rrf, limit=limit)

        candidates = []
        for rank, (chunk, score) in enumerate(reranked, 1):
            book_title = chunk.book.title if chunk.book else "Unknown Textbook"
            clean_content = " ".join(chunk.content.split())
            if len(clean_content) > 300:
                snippet = clean_content[:300].rsplit(" ", 1)[0] + "…"
            else:
                snippet = clean_content
            candidates.append({
                "chunk_id": chunk.id,
                "book_id": chunk.book_id,
                "book_title": book_title,
                "chapter": chunk.chapter,
                "page_number": chunk.page_number,
                "snippet": snippet,
                "rank": rank,
                "relevance_score": round(float(score), 4),
            })
        return candidates

    def get_or_generate_figure_caption(self, session: Session, figure: Figure) -> str | None:
        """Fetch figure caption. On-demand generation has been removed to reduce API overhead."""
        return figure.caption

    def retrieve_figures_for_chunks(self, session: Session, chunks: list[Chunk]) -> dict[int, list[dict]]:
        """Retrieve relevant figures for parent chunks based on page numbers."""
        results = {}
        for chunk in chunks:
            if chunk.page_number is None:
                continue

            figures = (
                session.query(Figure)
                .filter(Figure.book_id == chunk.book_id)
                .filter(Figure.page_number == chunk.page_number)
                .all()
            )

            chunk_figs = []
            for fig in figures:
                caption = self.get_or_generate_figure_caption(session, fig)
                chunk_figs.append({
                    "id": fig.id,
                    "figure_label": fig.figure_label,
                    "page_number": fig.page_number,
                    "caption": caption,
                    "mime_type": fig.mime_type,
                })

            if chunk_figs:
                results[chunk.id] = chunk_figs

        return results


# Global singleton instance
retrieval_service = RetrievalService()
