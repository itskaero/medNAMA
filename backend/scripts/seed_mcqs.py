"""Script to recursively traverse, parse, and seed thousands of MCQs from JS files into the database.

Uses a robust brace-balanced block tokenizer and regex field extractor to support multiple JS structures.
It is safe, idempotent, and avoids Unicode terminal print errors on Windows.
"""

import sys
import re
import json
from pathlib import Path
from sqlalchemy.orm import Session

# Add backend directory to python path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.database import SessionLocal
from app.models import MCQ, Book


def extract_raw_blocks(filepath: Path) -> list[str]:
    """Extract raw braces-balanced JavaScript object blocks representing MCQs."""
    try:
        content = filepath.read_text(encoding="utf-8")
    except Exception as e:
        print(f"Error reading file {filepath.name}: {e}")
        return []

    # Find the bounds of the outer array
    start_idx = content.find("[")
    end_idx = content.rfind("]")
    if start_idx == -1 or end_idx == -1:
        return []

    array_content = content[start_idx+1:end_idx]

    objects = []
    current_object = []
    brace_depth = 0
    in_string = False
    string_char = None
    escaped = False

    for char in array_content:
        if escaped:
            escaped = False
            if brace_depth > 0:
                current_object.append(char)
            continue

        if char == '\\':
            escaped = True
            if brace_depth > 0:
                current_object.append(char)
            continue

        if in_string:
            if char == string_char:
                in_string = False
            if brace_depth > 0:
                current_object.append(char)
            continue

        if char in ('"', "'", "`"):
            in_string = True
            string_char = char
            if brace_depth > 0:
                current_object.append(char)
            continue

        if char == '{':
            brace_depth += 1
            if brace_depth == 1:
                current_object = []
            else:
                current_object.append(char)
            continue

        if char == '}':
            brace_depth -= 1
            if brace_depth == 0:
                objects.append("".join(current_object))
            else:
                current_object.append(char)
            continue

        if brace_depth > 0:
            current_object.append(char)

    return objects


def parse_mcq_block(block_str: str) -> dict | None:
    """Extract MCQ fields from a raw JS object block using flexible regex patterns."""
    # 1. Question text (q:)
    q_match = re.search(r'(?:\bq\b|["\']q["\'])\s*:\s*(["\'`])(.*?)\1', block_str, re.DOTALL)
    if not q_match:
        return None
    question_text = q_match.group(2).strip()

    options = {}
    correct_option = None

    # 2. Check for options: [...] list format
    options_match = re.search(r'(?:\boptions\b|["\']options["\'])\s*:\s*\[(.*?)\]', block_str, re.DOTALL)
    if options_match:
        raw_opts = re.findall(r'(["\'`])(.*?)\1', options_match.group(1))
        opt_list = [opt[2].strip() for opt in raw_opts]
        
        labels = ["A", "B", "C", "D", "E", "F"]
        for idx, val in enumerate(opt_list):
            if idx < len(labels):
                options[labels[idx]] = val
                
        # Get 0-indexed answer
        ans_idx_match = re.search(r'(?:\banswer\b|["\']answer["\'])\s*:\s*(\d+)', block_str)
        if ans_idx_match:
            ans_idx = int(ans_idx_match.group(1))
            if ans_idx < len(opt_list) and ans_idx < len(labels):
                correct_option = labels[ans_idx]
    else:
        # 3. Handle individual a, b, c, d, e keys
        a_match = re.search(r'(?:\ba\b|["\']a["\'])\s*:\s*(["\'`])(.*?)\1', block_str, re.DOTALL)
        b_match = re.search(r'(?:\bb\b|["\']b["\'])\s*:\s*(["\'`])(.*?)\1', block_str, re.DOTALL)
        c_match = re.search(r'(?:\bc\b|["\']c["\'])\s*:\s*(["\'`])(.*?)\1', block_str, re.DOTALL)
        d_match = re.search(r'(?:\bd\b|["\']d["\'])\s*:\s*(["\'`])(.*?)\1', block_str, re.DOTALL)
        e_match = re.search(r'(?:\be_opt\b|["\']e_opt["\'])\s*:\s*(["\'`])(.*?)\1', block_str, re.DOTALL)

        if a_match: options["A"] = a_match.group(2).strip()
        if b_match: options["B"] = b_match.group(2).strip()
        if c_match: options["C"] = c_match.group(2).strip()
        if d_match: options["D"] = d_match.group(2).strip()
        if e_match: options["E"] = e_match.group(2).strip()

        ans_match = re.search(r'(?:\bans\b|["\']ans["\'])\s*:\s*(["\'`])(.*?)\1', block_str)
        if ans_match:
            correct_option = ans_match.group(2).strip().upper()

    if not correct_option:
        return None

    # 4. Explanation (explanation: or e:)
    exp_match = re.search(r'(?:\b(?:explanation|e)\b|["\'](?:explanation|e)["\'])\s*:\s*(["\'`])(.*?)\1', block_str, re.DOTALL)
    explanation = exp_match.group(2).strip() if exp_match else None

    # Clean HTML breaks if present in explanation
    if explanation:
        explanation = explanation.replace("<br>", "\n").replace("<br />", "\n").replace("<br/>", "\n")

    return {
        "question_text": question_text,
        "options": options,
        "correct_option": correct_option,
        "explanation": explanation
    }


def get_default_topic(relative_path: Path, block_str: str) -> str:
    """Deduce a high-quality topic label based on subfolder structure and item category."""
    parts = relative_path.parts
    topic_parts = []
    
    # Process folder hierarchy
    for p in parts[:-1]:
        topic_parts.append(p.upper())

    # Process file name
    filename = relative_path.stem
    clean_name = re.sub(r"^(?:med_p2_|nts_range_|nts_mock)", "", filename).replace("_", " ").title()
    topic_parts.append(clean_name)
    
    default_base = " - ".join(topic_parts)

    # Look for optional 't' parameter in raw block
    t_match = re.search(r'(?:\bt\b|["\']t["\'])\s*:\s*(["\'`])(.*?)\1', block_str)
    if t_match:
        t_val = t_match.group(2).strip()
        if t_val and not t_val.isdigit():
            return f"{default_base} ({t_val})"
    
    return default_base


def get_categories(relative_path: Path, block_str: str) -> tuple[str, str]:
    """Returns (main_category, sub_category) based on subfolder structure and item data."""
    parts = relative_path.parts
    main_folder = parts[0].lower()
    
    # 1. Determine main category
    if main_folder == "english":
        main_cat = "English"
    elif main_folder == "nts":
        main_cat = "NTS Mock"
    elif main_folder == "nts_range":
        main_cat = "NTS Practice"
    elif main_folder == "p1":
        main_cat = "Part 1 Basic Sciences"
    elif main_folder == "p2":
        main_cat = "Part 2 Clinical Specializations"
    else:
        main_cat = main_folder.title()

    # 2. Determine sub category
    filename = relative_path.stem
    clean_filename = re.sub(r"^(?:med_p2_|nts_range_|nts_mock|oph_p2_|surg_p2_|psych_p2_|radio_p2_|ent_p2_|gynae_p2_|anaes_p2_)", "", filename)
    clean_name = clean_filename.replace("_", " ").title()

    sub_folder = parts[1].lower() if len(parts) > 2 else None
    if main_folder == "p2" and sub_folder:
        folder_mapping = {
            "anaes": "Anesthesia",
            "ent": "ENT",
            "gynae": "Gynecology & Obstetrics",
            "med": "Medicine",
            "oph": "Ophthalmology",
            "psych": "Psychiatry",
            "radio": "Radiology",
            "surg": "Surgery"
        }
        sub_cat_prefix = folder_mapping.get(sub_folder, sub_folder.title())
        sub_cat = f"{sub_cat_prefix} - {clean_name}"
    else:
        sub_cat = clean_name

    # Optional internal 't' tags refinement
    t_match = re.search(r'(?:\bt\b|["\']t["\'])\s*:\s*(["\'`])(.*?)\1', block_str)
    if t_match:
        t_val = t_match.group(2).strip()
        if t_val and not t_val.isdigit():
            sub_cat = f"{sub_cat} ({t_val.title()})"

    return main_cat, sub_cat


def seed_mcqs():
    db: Session = SessionLocal()
    mcq_dir = Path(__file__).resolve().parent.parent.parent / "mcqs"
    
    if not mcq_dir.exists():
        print(f"MCQ source directory not found at {mcq_dir}")
        return

    print("Clearing existing MCQs in database for fresh categorized seeding...")
    db.query(MCQ).delete()
    db.commit()
    print("Database MCQs cleared.\n")

    print(f"Scanning MCQ source directory: {mcq_dir}...")
    js_files = list(mcq_dir.glob("**/*.js"))
    print(f"Found {len(js_files)} JS MCQ files to parse.\n")

    existing_questions = set()
    all_mcq_objects = []
    skipped_duplicates = 0
    total_parsed = 0

    books = db.query(Book).all()

    for js_file in js_files:
        rel_path = js_file.relative_to(mcq_dir)
        print(f"Parsing: {rel_path}...")
        
        blocks = extract_raw_blocks(js_file)
        if not blocks:
            print(f"   -> No object blocks extracted from {js_file.name}")
            continue

        file_parsed_count = 0
        file_skipped_count = 0

        for block in blocks:
            try:
                item = parse_mcq_block(block)
            except Exception as e:
                # Skip invalid block
                continue

            if not item:
                continue

            question_text = item["question_text"]
            total_parsed += 1
            norm_q = question_text.strip().lower()

            if norm_q in existing_questions:
                skipped_duplicates += 1
                file_skipped_count += 1
                continue

            # Add to local cache to prevent duplicates within the same batch run
            existing_questions.add(norm_q)

            # Determine Topic and Categories
            topic = get_default_topic(rel_path, block)
            main_cat, sub_cat = get_categories(rel_path, block)

            # Link Book if name aligns
            book_id = None
            for b in books:
                if b.title.lower() in topic.lower():
                    book_id = b.id
                    break

            mcq = MCQ(
                book_id=book_id,
                question_text=question_text,
                options=item["options"],
                correct_option=item["correct_option"],
                topic=topic,
                main_category=main_cat,
                sub_category=sub_cat,
                explanation_markdown=item["explanation"],
                status="pending"
            )
            all_mcq_objects.append(mcq)
            file_parsed_count += 1

        if file_parsed_count > 0 or file_skipped_count > 0:
            print(f"   -> Parsed: {file_parsed_count} | Skipped Duplicates: {file_skipped_count}")

    print("\n" + "=" * 50)
    print("PARSING COMPLETE.")
    print(f"Total MCQs parsed across files: {total_parsed}")
    print(f"Total new MCQs ready to insert: {len(all_mcq_objects)}")
    print(f"Total skipped duplicates: {skipped_duplicates}")
    print("=" * 50)

    if not all_mcq_objects:
        print("No new questions to seed. Exiting.")
        db.close()
        return

    # Bulk insert in batches of 1000 to maximize performance
    batch_size = 1000
    print(f"\nSeeding {len(all_mcq_objects)} questions into Postgres in batches of {batch_size}...")
    
    try:
        for idx in range(0, len(all_mcq_objects), batch_size):
            batch = all_mcq_objects[idx:idx + batch_size]
            db.bulk_save_objects(batch)
            db.commit()
            print(f"[OK] Seeded items {idx} to {min(idx + batch_size, len(all_mcq_objects))} successfully.")
        
        print("\nDatabase seeding completed successfully!")
    except Exception as e:
        db.rollback()
        print(f"\n[ERROR] Error during database seeding: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    seed_mcqs()
