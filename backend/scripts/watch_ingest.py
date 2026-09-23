"""Live progress dashboard for a running book ingestion.

Why this file exists
--------------------
ingest_book() only logs "Slice N-M complete" AFTER every slice of a book
finishes, so a large book looks frozen for a long time. This dashboard reads
two live signals instead, every refresh:

  * the ingestion log  -> Docling slice conversions (updates ~every 1-2 min)
  * the database       -> chunks/figures committed per slice

It is fully dynamic: it re-scans the PDF directory on every refresh, so a new
PDF dropped into pdfs/ appears automatically (with its page count computed on
first sight). It also shows progress bars plus heartbeat indicators so you can
tell the ingestion is still making progress and hasn't hung.

    -- DB is unreachable or empty -> shows "DB OFFLINE" instead of crashing
    -- no slice finished for N minutes -> prints a HUNG? warning
    -- the header spinner + clock pulse every --tick seconds even between the
       heavier --interval refreshes, so a static screen always means the
       watcher itself died (never "just waiting for the next refresh")

Usage:
    python scripts/watch_ingest.py --log path/to/ingest.log
    python scripts/watch_ingest.py --log path/to/ingest.log --once   # single snapshot
    python scripts/watch_ingest.py --log path/to/ingest.log --interval 10
    python scripts/watch_ingest.py --log path/to/ingest.log --tick 1 --interval 20
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.exc import OperationalError, SQLAlchemyError  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.ingestion import PAGE_CHUNK_SIZE  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_PDF_DIR = REPO_ROOT / "pdfs"

START_RE = re.compile(r"Processing document (\S+\.pdf)")
DONE_RE = re.compile(r"Finished converting document (\S+\.pdf) in ([\d.]+) sec")
BOOK_RE = re.compile(r"=== \[(\d+)/(\d+)\] (\S+\.pdf) \((\d+) pages\) ===")
FAIL_RE = re.compile(r"=== FAILED (\S+\.pdf): (.*)")

# ANSI colors
C = {
    "reset": "\033[0m",
    "bold": "\033[1m",
    "dim": "\033[2m",
    "red": "\033[31m",
    "green": "\033[32m",
    "yellow": "\033[33m",
    "cyan": "\033[36m",
    "gray": "\033[90m",
}
SPINNER = "|/-\\"


def fmt_dur(seconds: float | None) -> str:
    """1h 23m / 4m 32s / 34s"""
    if seconds is None:
        return "--"
    seconds = int(seconds)
    if seconds < 0:
        return "--"
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}h {m:02d}m"
    if m:
        return f"{m}m {s:02d}s"
    return f"{s}s"


def scan_pdf_page_counts(cache: Path) -> tuple[dict[str, int], list[str]]:
    """Dynamic page counts: always re-glob the PDF dir, cache only the pypdf step.

    Returns (counts, new_names) where new_names are PDFs not in the previous
    cache -- a freshly added book gets its page count computed and appears.
    """
    cached: dict[str, int] = {}
    if cache.exists():
        try:
            cached = json.loads(cache.read_text())
            if not isinstance(cached, dict):
                cached = {}
        except (json.JSONDecodeError, OSError):
            cached = {}

    names_in_dir = {p.name for p in DEFAULT_PDF_DIR.glob("*.pdf")}

    # Drop cache entries for deleted PDFs
    for stale in set(cached) - names_in_dir:
        cached.pop(stale, None)

    missing = sorted(names_in_dir - set(cached))
    if missing:
        from pypdf import PdfReader

        for name in missing:
            p = DEFAULT_PDF_DIR / name
            try:
                cached[name] = len(PdfReader(p).pages)
            except Exception:
                cached[name] = 0
        cache.write_text(json.dumps(cached, indent=2))

    new_names = [n for n in names_in_dir if n in missing]
    return cached, new_names


def db_state() -> list[dict] | None:
    """filename -> book row stats, or None when the DB is unreachable."""
    try:
        session = SessionLocal()
        try:
            rows = session.execute(text("""
                SELECT b.title, b.filename, b.status,
                       (SELECT count(*) FROM chunks c WHERE c.book_id = b.id) AS chunks,
                       (SELECT count(*) FROM chunks c
                         WHERE c.book_id = b.id AND c.embedding IS NOT NULL) AS embedded,
                       (SELECT count(*) FROM figures f WHERE f.book_id = b.id) AS figs
                FROM books b ORDER BY b.id
            """)).fetchall()
            return [dict(r._mapping) for r in rows]
        finally:
            session.close()
    except (OperationalError, SQLAlchemyError) as e:
        return None


def parse_log(log_path: Path) -> dict:
    """Pull slice conversion state and current book out of the ingestion log."""
    started: dict[str, float] = {}   # temp pdf name -> line index
    finished: dict[str, float] = {}  # temp pdf name -> seconds taken
    current_book = None
    book_idx = (0, 0)
    failures = []

    try:
        lines = log_path.read_text(errors="ignore").splitlines()
    except FileNotFoundError:
        return {"started": {}, "finished": {}, "book": None, "idx": (0, 0),
                "failures": [], "line_time": None}

    last_line_time = None
    idx = 0
    for idx, line in enumerate(lines):
        if m := BOOK_RE.search(line):
            book_idx = (int(m.group(1)), int(m.group(2)))
            current_book = m.group(3)
            started, finished = {}, {}   # slices are per-book; reset counts
        elif m := START_RE.search(line):
            started[m.group(1)] = idx
        elif m := DONE_RE.search(line):
            finished[m.group(1)] = float(m.group(2))
        elif m := FAIL_RE.search(line):
            failures.append((m.group(1), m.group(2)))
        if idx % 40 == 0:
            last_line_time = idx  # rough freshness anchor (unused fallback)

    return {
        "started": started,
        "finished": finished,
        "book": current_book,
        "idx": book_idx,
        "failures": failures,
        "line_count": len(lines),
    }


def bar(done: int, total: int, width: int = 20) -> str:
    """A readable progress bar, ASCII-safe for any console: [######......]"""
    if total <= 0:
        filled = 0
    else:
        filled = int(width * min(done, total) / total)
    return "#" * filled + "." * (width - filled)


def pulse_title(text: str, spin_ch: str, now: float, t0: float, db_ok: bool,
                color: bool = True) -> str:
    """Cheaply rebuild just the header line (spinner + clock) between heavy
    refreshes, so the dashboard visibly pulses every tick without re-querying
    the DB or re-parsing the whole log."""

    def col(s: str, code: str, on: bool | None = None) -> str:
        if not color or on is False:
            return s
        return f"{code}{s}{C['reset']}"

    lines = text.split("\n")
    db_tag = "DB ONLINE" if db_ok else col("DB OFFLINE", C["red"])
    title = (f" medNAMA ingestion {col(spin_ch, C['cyan'])} {datetime.now():%H:%M:%S}"
             f"   watching {fmt_dur(now - t0)}   {db_tag}")
    bar_line = col("=" * (len(title) + 2), C["dim"])
    for i, ln in enumerate(lines):
        if "medNAMA ingestion" in ln:
            lines[i] = title
            if i > 0:
                lines[i - 1] = bar_line
            if i + 1 < len(lines):
                lines[i + 1] = bar_line
            break
    return "\n".join(lines)


def render(log_path: Path, t0: float, counts: dict[str, int],
           new_names: list[str] | None, prev_totals: tuple | None,
           idle_warn: int, spin: int, color: bool, width: int = 20) -> tuple[str, tuple | None]:
    """Build one dashboard frame. Returns (text, current DB totals)."""
    def col(text_: str, code: str, on: bool | None = None) -> str:
        if not color:
            return text_
        if on is False:
            return text_
        return f"{code}{text_}{C['reset']}"

    books = db_state()
    lg = parse_log(log_path)
    by_file = {b["filename"]: b for b in books} if books else {}

    total_pages = sum(counts.values()) or 1
    done_pages = sum(counts.get(b["filename"], 0) for b in (books or [])
                     if b["status"] == "ready")

    # Slice-progress inside the book currently in flight
    n_fin = len(lg["finished"])
    n_inflight = len(lg["started"]) - n_fin
    in_book = lg["book"]
    cur_pages = n_fin * PAGE_CHUNK_SIZE
    if in_book and by_file.get(in_book, {}).get("status") != "ready":
        cur_pages = min(cur_pages, counts.get(in_book, 0))
        done_pages += cur_pages

    # Heartbeat metrics
    now = time.time()
    log_age = now - log_path.stat().st_mtime if log_path.exists() else None
    avg = None
    if lg["finished"]:
        avg = sum(lg["finished"].values()) / len(lg["finished"])
    last_fin = None
    if lg["finished"]:
        last_fin = now - (t0 + sum(lg["finished"].values()))  # approx anchor

    out = []
    el = now - t0
    spin_ch = SPINNER[spin % len(SPINNER)] if spin >= 0 else " "

    # Header
    db_tag = "DB ONLINE" if books is not None else col("DB OFFLINE", C["red"])
    title = (f" medNAMA ingestion {col(spin_ch, C['cyan'])} {datetime.now():%H:%M:%S}"
             f"   watching {fmt_dur(el)}   {db_tag}")
    out.append(col("=" * (len(title) + 2), C["dim"]))
    out.append(title)
    out.append(col("=" * (len(title) + 2), C["dim"]))

    if new_names:
        for n in new_names:
            out.append(col(f"  NEW PDF detected: {n} ({counts.get(n, 0)} pages) "
                           f"- run_ingestion.py will pick it up", C["cyan"]))

    if books is None:
        out.append(col("  !! Cannot query the database (Docker/DB down?).", C["red"]))
        out.append(col("     Ingestion itself may still be running - see log lines below.", C["dim"]))

    # Book table
    out.append("")
    out.append(col(f"{'BOOK':24}{'PAGES':>6} {'CHUNKS':>7} {'FIGS':>6}  "
                   f"{'STATUS':9} PROGRESS", C["bold"]))
    out.append(col("-" * 88, C["dim"]))

    new_set = set(new_names or [])
    chunk_total = emb_total = fig_total = 0
    for name in sorted(counts, key=lambda n: counts[n]):
        pages = counts[name]
        row = by_file.get(name)
        if row:
            chunk_total += row["chunks"]
            emb_total += row["embedded"]
            fig_total += row["figs"]
            status = row["status"]
            chunks, figs = row["chunks"], row["figs"]
        else:
            status = "new" if name in new_set else "queued"
            chunks = figs = 0

        if status == "ready":
            p = pages
            stxt = col("OK ready ", C["green"])
        elif status == "failed":
            p = 0
            stxt = col("FAIL     ", C["red"])
        elif name == in_book and status != "ready":
            p = cur_pages
            stxt = col("...ing   ", C["yellow"])
            if name in new_set:
                stxt = col("NEW ...  ", C["cyan"])
        elif status in ("new", "queued"):
            p = 0
            stxt = col("queued   ", C["dim"])
        elif status == "processing":
            p = 0
            stxt = col("...ing   ", C["yellow"])
        else:
            p = 0
            stxt = col(status[:9].ljust(9), C["dim"])

        if pages > 0:
            pct = min(p / pages * 100, 100.0)
            prog = f"{bar(p, pages, width)} {pct:5.1f}%"
        else:
            prog = " " * (width + 7)

        name_part = (name[:23] + " ") if len(name) > 23 else name.ljust(24)
        out.append(f"  {name_part}{pages:>6} {chunks:>7} {figs:>6}  {stxt} {prog}")

    out.append(col("-" * 88, C["dim"]))

    # Overall progress bar
    pct = done_pages / total_pages * 100
    eta = None
    if done_pages > 0 and el > 0:
        eta = (total_pages - done_pages) / (done_pages / el)
    line = (f"  OVERALL  {done_pages:,}/{total_pages:,} pages "
            f"[{bar(done_pages, total_pages, 34)}] {pct:5.1f}%"
            f"   elapsed {fmt_dur(el)}   ETA {fmt_dur(eta)}")
    out.append(col(line, C["bold"]))

    # Heartbeat / activity
    out.append(col("-" * 88, C["dim"]))
    heart = []
    if last_fin is not None:
        heart.append(f"last slice finished {fmt_dur(last_fin)} ago")
    else:
        heart.append("no slice finished yet")
    heart.append(f"in flight {n_inflight}")
    if avg:
        heart.append(f"avg {avg:.0f}s/slice")
    if log_age is not None:
        heart.append(f"log written {fmt_dur(log_age)} ago")
    out.append("  ACTIVITY  " + " | ".join(heart))

    # DB-driven heartbeat (delta vs previous refresh)
    totals = (chunk_total, emb_total, fig_total)
    if prev_totals is not None and books is not None:
        dc, de, df = (totals[i] - prev_totals[i] for i in range(3))
        if dc or df:
            out.append(col(f"  HEARTBEAT +{dc:,} chunks, +{df:,} figures since last refresh "
                           f"(+{de:,} embedded)", C["green"]))
        else:
            out.append(col("  HEARTBEAT no new rows yet (slice still converting in DB)", C["dim"]))

    # HUNG detection
    todo_remaining = any(
        not b["filename"] in counts or b["status"] not in ("ready",)
        for b in (books or [])
    ) if books else True
    idle_ok = (log_age is not None and log_age < idle_warn) or \
              (last_fin is not None and last_fin < idle_warn)
    if todo_remaining and not idle_ok:
        out.append(col(
            f"  HUNG?  no slice finished or log written for {fmt_dur(idle_warn)}+ "
            f"while books remain. Check: Get-Content {log_path} -Tail 20", C["red"]))
    elif todo_remaining:
        out.append(col("  LIVE    ingestion progressing - refresh re-scans pdfs/ + DB each tick", C["dim"]))
    else:
        out.append(col("  DONE    all books in pdfs/ are ingested as 'ready'", C["green"]))

    for fname, err in lg["failures"]:
        out.append(col(f"  FAILED  {fname}: {err[:70]}", C["red"]))

    out.append(col("=" * (len(title) + 2), C["dim"]))
    return "\n".join(out), totals


def main() -> None:
    parser = argparse.ArgumentParser(description="Live ingestion progress dashboard (dynamic + progress bars).")
    parser.add_argument("--log", required=True, help="Path to the ingestion log file")
    parser.add_argument("--interval", type=int, default=15, help="Refresh seconds (default 15)")
    parser.add_argument("--tick", type=float, default=1.0,
                        help="Animation frame seconds between repaints (default 1; the "
                             "spinner/clock pulse even between interval refreshes)")
    parser.add_argument("--idle-warn", type=int, default=300,
                        help="Warn 'HUNG?' after this many seconds with no slice/log activity (default 300)")
    parser.add_argument("--once", action="store_true", help="Print one snapshot and exit")
    parser.add_argument("--no-color", action="store_true", help="Disable ANSI colors")
    parser.add_argument("--width", type=int, default=20, help="Progress bar width (default 20)")
    args = parser.parse_args()

    log_path = Path(args.log)
    cache = log_path.parent / ".page_counts.json"
    os.system("")  # enable ANSI escapes on Windows consoles

    t0 = log_path.stat().st_mtime if log_path.exists() else time.time()
    try:
        t0 = min(t0, log_path.stat().st_ctime)
    except OSError:
        pass

    counts, new_names = scan_pdf_page_counts(cache)
    prev_totals = None
    spin = -1 if args.once else 0

    text, totals = render(log_path, t0, counts, new_names, prev_totals,
                          args.idle_warn, spin, not args.no_color, args.width)
    if args.once:
        print(text)
        return

    try:
        # Heavy refresh (DB query + full log re-parse + pdf re-glob) runs every
        # --interval seconds. Between those we repaint every --tick seconds using
        # the cached frame, pulsing only the spinner + clock, so the screen is
        # visibly alive even while a single ~2-minute slice is converting.
        last_heavy = 0.0
        while True:
            now = time.time()
            if now - last_heavy >= args.interval:
                counts, new_names = scan_pdf_page_counts(cache)
                spin += 1
                text, totals = render(log_path, t0, counts, new_names, prev_totals,
                                      args.idle_warn, spin, not args.no_color, args.width)
                prev_totals = totals
                last_heavy = now
            else:
                spin += 1
                text = pulse_title(text, SPINNER[spin % len(SPINNER)], now, t0,
                                   "DB OFFLINE" not in text, color=not args.no_color)
            print("\033[2J\033[H" + text, flush=True)
            time.sleep(args.tick)
    except KeyboardInterrupt:
        print("\nstopped watching (ingestion keeps running)")


if __name__ == "__main__":
    main()