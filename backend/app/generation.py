"""Answer generation pipeline: queries DeepSeek, grounds in hybrid search context,
and performs strict server-side citation/figure validation.
"""

import json
import logging
import re
from typing import Any

from openai import OpenAI
from sqlalchemy.orm import Session

from app.config import settings
from app.retrieval import retrieval_service

logger = logging.getLogger(__name__)

# Fallback response when retrieval confidence is low
NOT_COVERED_RESPONSE = {
    "answer_markdown": "I am sorry, but the answer to your question is not covered in the provided textbooks.",
    "citations": [],
    "figures": [],
}


def clean_text_references(text: str, stripped_citations: list[dict], stripped_figures: list[dict]) -> str:
    """Scan response text and strip references to deleted citations or figures."""
    cleaned = text

    # Remove stripped figure references, e.g. [Figure 9] or (Figure 9) or [Figure ID: 9]
    for fig in stripped_figures:
        fig_id = fig.get("id")
        label = fig.get("figure_label", f"Figure {fig_id}")

        # Patterns matching: [Figure 9], (Figure 9), [Figure ID: 9], etc.
        patterns = [
            re.compile(rf"\[{label}\]", re.IGNORECASE),
            re.compile(rf"\({label}\)", re.IGNORECASE),
            re.compile(rf"\[Figure ID:\s*{fig_id}\]", re.IGNORECASE),
            re.compile(rf"\bFigure\s*{fig_id}\b", re.IGNORECASE),
        ]
        for pattern in patterns:
            cleaned = pattern.sub("", cleaned)

    # Remove stripped citations, e.g. [Microbiology, Page 8] or (Microbiology, Page 8)
    for cit in stripped_citations:
        title = re.escape(cit.get("book_title", ""))
        page = cit.get("page_number")

        # Patterns matching: [Book Title, Page 8], (Book Title, Page 8), [Book Title, p. 8], etc.
        patterns = [
            re.compile(rf"\[{title},\s*(?:Page|p\.)\s*{page}\]", re.IGNORECASE),
            re.compile(rf"\({title},\s*(?:Page|p\.)\s*{page}\)", re.IGNORECASE),
        ]
        for pattern in patterns:
            cleaned = pattern.sub("", cleaned)

    # Clean up double spaces or brackets left over from replacements
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = re.sub(r"\[\s*\]", "", cleaned)
    cleaned = re.sub(r"\(\s*\)", "", cleaned)
    return cleaned.strip()


def validate_generation(
    response_json: dict[str, Any], retrieved_chunks: list, retrieved_figures: list[dict]
) -> dict[str, Any]:
    """Strictly validates returned citations and figures against retrieved context.

    Strips any citations or figures that were not in the retrieved lists.
    """
    validated = {
        "answer_markdown": response_json.get("answer_markdown", ""),
        "citations": [],
        "figures": [],
    }

    # Map retrieved chunks to easily matching structures
    valid_citations = set()
    for chunk in retrieved_chunks:
        # Match by normalized title + page number safely
        book_title = chunk.book.title if chunk.book else "Unknown Textbook"
        title_norm = book_title.strip().lower()
        valid_citations.add((title_norm, chunk.page_number))

    # Map retrieved figures
    valid_figure_ids = {fig["id"] for fig in retrieved_figures}

    stripped_citations = []
    stripped_figures = []

    # 1. Validate Citations
    raw_citations = response_json.get("citations", [])
    if isinstance(raw_citations, list):
        for cit in raw_citations:
            title = cit.get("book_title", "")
            page = cit.get("page_number")

            if (title.strip().lower(), page) in valid_citations:
                validated["citations"].append(cit)
            else:
                logger.warning(f"Stripping fabricated/invalid citation: {title}, Page {page}")
                stripped_citations.append(cit)

    # 2. Validate Figures
    raw_figures = response_json.get("figures", [])
    if isinstance(raw_figures, list):
        for fig in raw_figures:
            fig_id = fig.get("id")

            if fig_id in valid_figure_ids:
                validated["figures"].append(fig)
            else:
                logger.warning(f"Stripping fabricated/invalid figure citation: Figure ID {fig_id}")
                stripped_figures.append(fig)

    # 3. Clean up references in markdown text
    if stripped_citations or stripped_figures:
        validated["answer_markdown"] = clean_text_references(
            validated["answer_markdown"], stripped_citations, stripped_figures
        )

    return validated


def generate_answer(
    session: Session, 
    query: str, 
    confidence_threshold: float = 0.55, 
    history: list[dict[str, str]] | None = None
) -> dict[str, Any]:
    """Retrieves relevant textbook chunks and generates a grounded response using DeepSeek.

    Validates citations and figures server-side to guarantee zero hallucinations.
    """
    # 1. Check Retrieval Confidence (Proposal 2)
    query_emb = retrieval_service._embed_query(query)
    vector_results = retrieval_service.vector_search(session, query_emb, limit=10)
    keyword_results = retrieval_service.keyword_search(session, query, limit=10)

    confidence = retrieval_service.calculate_confidence(vector_results, keyword_results)
    if confidence < confidence_threshold:
        logger.info(f"Retrieval confidence too low ({confidence:.4f} < {confidence_threshold}). Returning fallback.")
        return NOT_COVERED_RESPONSE

    # 2. Hybrid Retrieval
    chunks = retrieval_service.hybrid_search(session, query, limit=5)
    if not chunks:
        logger.info(f"No chunks retrieved for query '{query}'. Returning fallback.")
        return NOT_COVERED_RESPONSE

    # 3. Fetch Linked Figures
    figures_map = retrieval_service.retrieve_figures_for_chunks(session, chunks)
    all_figures = []
    seen_figure_ids = set()

    for chunk_figs in figures_map.values():
        for fig in chunk_figs:
            if fig["id"] not in seen_figure_ids:
                all_figures.append(fig)
                seen_figure_ids.add(fig["id"])

    # 4. Formulate Context strings
    context_chunks = []
    for idx, c in enumerate(chunks, 1):
        book_title = c.book.title if c.book else "Unknown Textbook"
        context_chunks.append(
            f"Chunk {idx}:\n"
            f"  Source Book: {book_title}\n"
            f"  Page: {c.page_number}\n"
            f"  Chapter: {c.chapter or 'N/A'}\n"
            f"  Text Content: {c.content}\n"
        )
    formatted_context = "\n---\n".join(context_chunks)

    formatted_figures = []
    for fig in all_figures:
        formatted_figures.append(
            f"Figure ID: {fig['id']}\n"
            f"  Label: {fig['figure_label']}\n"
            f"  Page: {fig['page_number']}\n"
            f"  Description: {fig['caption'] or 'Image extracted (no description available)'}\n"
        )
    formatted_figs_str = "\n---\n".join(formatted_figures) if formatted_figures else "No figures available for these pages."

    # 5. Build DeepSeek System Prompt
    system_prompt = (
        "You are an expert medical AI assistant. Your task is to answer the user's medical question "
        "based ONLY on the provided textbook context and figures. Do not use outside medical knowledge.\n\n"
        "GROUNDING RULES:\n"
        "1. Answer strictly based on the facts provided in the chunks. If the answer cannot be found "
        "in the context, return the standard fallback answer: 'I am sorry, but the answer to your question "
        "is not covered in the provided textbooks.'\n"
        "2. Do not invent any facts, book titles, page numbers, or figure descriptions.\n"
        "3. Every assertion must be cited inline by referencing the exact book title and page number, e.g. "
        "[Microbiology Sample, Page 8].\n"
        "4. If a diagram figure from the provided figures list is directly relevant, describe it briefly and "
        "refer to it using its label (e.g. [Figure 2]) and associate it in the 'figures' JSON key.\n\n"
        "You must respond in valid JSON format only, matching this structure:\n"
        "{\n"
        "  \"answer_markdown\": \"Your answer text...\",\n"
        "  \"citations\": [\n"
        "    {\n"
        "      \"book_title\": \"exact book title matching the context\",\n"
        "      \"page_number\": page_number_as_integer,\n"
        "      \"excerpt\": \"exact sentence or key phrase matching the context\"\n"
        "    }\n"
        "  ],\n"
        "  \"figures\": [\n"
        "    {\n"
        "      \"id\": figure_id_as_integer,\n"
        "      \"figure_label\": \"Figure X\",\n"
        "      \"reason_to_include\": \"Why this figure is relevant to the answer\"\n"
        "    }\n"
        "  ]\n"
        "}"
    )

    user_content = (
        f"USER QUESTION: {query}\n\n"
        f"RETRIEVED TEXT CONTEXT:\n{formatted_context}\n\n"
        f"RETRIEVED DIAGRAMS:\n{formatted_figs_str}"
    )

    # 6. Call DeepSeek API
    has_api_key = bool(settings.deepseek_api_key and settings.deepseek_api_key.strip())
    if not has_api_key:
        logger.error("DEEPSEEK_API_KEY is not configured. Cannot generate answer.")
        return NOT_COVERED_RESPONSE

    try:
        client = OpenAI(api_key=settings.deepseek_api_key, base_url=settings.deepseek_base_url)
        logger.info(f"Calling DeepSeek API ({settings.deepseek_model})...")

        api_messages = [{"role": "system", "content": system_prompt}]
        if history:
            for turn in history:
                api_messages.append(turn)
        api_messages.append({"role": "user", "content": user_content})

        response = client.chat.completions.create(
            model=settings.deepseek_model,
            messages=api_messages,
            response_format={"type": "json_object"},
            temperature=0.0,  # Minimize creativity to enforce grounding
        )

        raw_response = response.choices[0].message.content
        response_json = json.loads(raw_response)

        # 7. Validate Citations & Figures
        validated_json = validate_generation(response_json, chunks, all_figures)
        return validated_json

    except Exception as e:
        logger.error(f"Error during answer generation/validation: {e}")
        return NOT_COVERED_RESPONSE


def generate_mcq_explanation(session: Session, mcq) -> dict:
    """Generates a grounded explanation for a specific MCQ using RAG and DeepSeek."""
    # 1. Retrieve context using hybrid search on the question text
    query = mcq.question_text
    chunks = retrieval_service.hybrid_search(session, query, limit=5)
    
    # 2. Fetch linked figures
    figures_map = retrieval_service.retrieve_figures_for_chunks(session, chunks)
    all_figures = []
    seen_figure_ids = set()
    for chunk_figs in figures_map.values():
        for fig in chunk_figs:
            if fig["id"] not in seen_figure_ids:
                all_figures.append(fig)
                seen_figure_ids.add(fig["id"])

    # 3. Formulate Context strings
    context_chunks = []
    for idx, c in enumerate(chunks, 1):
        book_title = c.book.title if c.book else "Unknown Textbook"
        context_chunks.append(
            f"Chunk {idx}:\n"
            f"  Source Book: {book_title}\n"
            f"  Page: {c.page_number}\n"
            f"  Chapter: {c.chapter or 'N/A'}\n"
            f"  Text Content: {c.content}\n"
        )
    formatted_context = "\n---\n".join(context_chunks)

    formatted_figures = []
    for fig in all_figures:
        formatted_figures.append(
            f"Figure ID: {fig['id']}\n"
            f"  Label: {fig['figure_label']}\n"
            f"  Page: {fig['page_number']}\n"
            f"  Description: {fig['caption'] or 'Image extracted (no description available)'}\n"
        )
    formatted_figs_str = "\n---\n".join(formatted_figures) if formatted_figures else "No figures available."

    # 4. Formulate System Prompt for MCQ explanation
    options_str = "\n".join([f"- Option {k}: {v}" for k, v in mcq.options.items()])
    
    system_prompt = (
        "You are an expert medical AI assistant. Your task is to write a detailed, professional explanation for a multiple-choice question (MCQ) "
        "based ONLY on the provided textbook context and figures. Do not use outside medical knowledge.\n\n"
        "EXPLANATION RULES:\n"
        "1. Confirm why the correct option is indeed correct, quoting facts from the text.\n"
        "2. Address the other options and explain why they are incorrect or less appropriate based on the context.\n"
        "3. Every assertion must be cited inline by referencing the exact book title and page number, e.g. [Microbiology Sample, Page 8].\n"
        "4. If a diagram figure from the provided figures list is directly relevant, refer to it using its label (e.g. [Figure 2]) and associate it in the 'figures' JSON key.\n\n"
        "You must respond in valid JSON format only, matching this structure:\n"
        "{\n"
        "  \"answer_markdown\": \"Your structured explanation here...\",\n"
        "  \"citations\": [\n"
        "    {\n"
        "      \"book_title\": \"exact book title matching the context\",\n"
        "      \"page_number\": page_number_as_integer,\n"
        "      \"excerpt\": \"exact sentence or key phrase matching the context\"\n"
        "    }\n"
        "  ],\n"
        "  \"figures\": [\n"
        "    {\n"
        "      \"id\": figure_id_as_integer,\n"
        "      \"figure_label\": \"Figure X\",\n"
        "      \"reason_to_include\": \"Why this figure is relevant to the explanation\"\n"
        "    }\n"
        "  ]\n"
        "}"
    )

    user_content = (
        f"QUESTION: {mcq.question_text}\n"
        f"OPTIONS:\n{options_str}\n"
        f"CORRECT OPTION: {mcq.correct_option}\n\n"
        f"RETRIEVED TEXTBOOK CONTEXT:\n{formatted_context}\n\n"
        f"RETRIEVED DIAGRAMS:\n{formatted_figs_str}"
    )

    # 5. Call DeepSeek API
    has_api_key = bool(settings.deepseek_api_key and settings.deepseek_api_key.strip())
    if not has_api_key:
        return {
            "answer_markdown": f"Explanation cannot be generated: DEEPSEEK_API_KEY is not configured.\n\nCorrect Option was: **{mcq.correct_option}**",
            "citations": [],
            "figures": []
        }

    try:
        client = OpenAI(api_key=settings.deepseek_api_key, base_url=settings.deepseek_base_url)
        logger.info(f"Calling DeepSeek API for MCQ {mcq.id} explanation...")
        response = client.chat.completions.create(
            model=settings.deepseek_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            response_format={"type": "json_object"},
            temperature=0.0,
        )
        response_json = json.loads(response.choices[0].message.content)
        
        # Validate citations
        validated = validate_generation(response_json, chunks, all_figures)
        return validated
    except Exception as e:
        logger.error(f"Error generating MCQ explanation: {e}")
        return {
            "answer_markdown": f"Failed to generate explanation due to an internal error.\n\nCorrect Option was: **{mcq.correct_option}**",
            "citations": [],
            "figures": []
        }
