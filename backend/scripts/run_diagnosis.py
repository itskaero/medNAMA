"""One-command retrieval diagnosis against a running medNAMA backend container.

Works the same on the Windows PC and on the NAS: it finds the backend
container, copies diagnose_query.py into it, runs it for each query, and saves
the combined output to a report file you can paste back for review.

Read-only: it never writes to the database, never restarts or rebuilds a
container, and does not call DeepSeek. The only change is one file copied into
the container's /tmp (gone when the container is recreated).

Usage (from the repo root or backend/, on the PC or the NAS):

    python backend/scripts/run_diagnosis.py                       # default HPS queries
    python backend/scripts/run_diagnosis.py "paradoxical aciduria" "drug of choice for absence seizures"
    python backend/scripts/run_diagnosis.py --container mednama-backend --threshold 0.55
    python backend/scripts/run_diagnosis.py --local               # no Docker: run in this Python env

--local needs the backend's Python dependencies installed and DATABASE_URL (or
backend/.env) pointing at a reachable database, e.g. the PC's localhost:5433.
"""

import argparse
import subprocess
import sys
from datetime import datetime
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
DIAGNOSE_SCRIPT = SCRIPTS_DIR / "diagnose_query.py"
REPO_ROOT = SCRIPTS_DIR.parent.parent

DEFAULT_QUERIES = [
    "fluid of choice in hypertrophic pyloric stenosis",
    "paradoxical aciduria",
    "paradoxical aciduria in pyloric stenosis",
]
CONTAINER_PATH = "/tmp/diagnose_query.py"


def run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")


def find_backend_container(explicit: str | None) -> str:
    """Return the running backend container name (explicit, mednama-backend, or any '*backend*')."""
    try:
        result = run(["docker", "ps", "--format", "{{.Names}}\t{{.Image}}"])
    except FileNotFoundError:
        raise SystemExit("docker was not found on PATH. Start Docker Desktop, or use --local.")
    if result.returncode != 0:
        raise SystemExit(f"'docker ps' failed (is Docker running?):\n{result.stderr.strip()}")

    rows = [line.split("\t", 1) for line in result.stdout.splitlines() if line.strip()]
    names = [r[0] for r in rows]

    if explicit:
        if explicit not in names:
            raise SystemExit(f"Container '{explicit}' is not running. Running: {', '.join(names) or '(none)'}")
        return explicit
    if "mednama-backend" in names:
        return "mednama-backend"
    candidates = [r[0] for r in rows if "backend" in r[0].lower() or (len(r) > 1 and "backend" in r[1].lower())]
    if len(candidates) == 1:
        return candidates[0]
    if not candidates:
        raise SystemExit(
            "No running backend container found. Start the stack (docker compose up -d), "
            f"or pass --container NAME. Running: {', '.join(names) or '(none)'}"
        )
    raise SystemExit(f"Several backend-like containers are running ({', '.join(candidates)}). Pass --container NAME.")


def container_backend_dir(container: str) -> str:
    """Find the directory in the container that holds the `app` package (the image's WORKDIR, normally /app/backend)."""
    probe = run([
        "docker", "exec", container, "python", "-c",
        "import app, os; print(os.path.dirname(os.path.dirname(os.path.abspath(app.__file__))))",
    ])
    if probe.returncode == 0 and probe.stdout.strip():
        return probe.stdout.strip().splitlines()[-1]
    return "/app/backend"


def diagnose_in_container(container: str, queries: list[str], extra: list[str]) -> list[tuple[str, str]]:
    copied = run(["docker", "cp", str(DIAGNOSE_SCRIPT), f"{container}:{CONTAINER_PATH}"])
    if copied.returncode != 0:
        raise SystemExit(f"docker cp failed:\n{copied.stderr.strip()}")
    workdir = container_backend_dir(container)
    print(f"Using container '{container}' (backend dir {workdir}). Model loading takes ~1 min on first query.\n")

    outputs = []
    for q in queries:
        print(f">>> {q}")
        # PYTHONPATH makes `import app` resolve even though the script runs from /tmp.
        result = run([
            "docker", "exec", "-w", workdir, "-e", f"PYTHONPATH={workdir}", container,
            "python", CONTAINER_PATH, q, *extra,
        ])
        text = result.stdout + (f"\n[stderr]\n{result.stderr}" if result.returncode != 0 else "")
        print(text)
        outputs.append((q, text))
    return outputs


def diagnose_locally(queries: list[str], extra: list[str]) -> list[tuple[str, str]]:
    outputs = []
    for q in queries:
        print(f">>> {q}")
        result = run([sys.executable, str(DIAGNOSE_SCRIPT), q, *extra])
        text = result.stdout + (f"\n[stderr]\n{result.stderr}" if result.returncode != 0 else "")
        print(text)
        outputs.append((q, text))
    return outputs


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("queries", nargs="*", help="queries to diagnose (default: HPS examples)")
    parser.add_argument("--container", help="backend container name (default: auto-detect)")
    parser.add_argument("--local", action="store_true", help="run in this Python env instead of Docker")
    parser.add_argument("--threshold", type=float, default=0.55)
    parser.add_argument("--book-id", type=int, default=None)
    parser.add_argument("--out", help="report file (default: diagnosis_<timestamp>.txt in the repo root)")
    args = parser.parse_args()

    queries = args.queries or DEFAULT_QUERIES
    extra = ["--threshold", str(args.threshold)]
    if args.book_id is not None:
        extra += ["--book-id", str(args.book_id)]

    if args.local:
        outputs = diagnose_locally(queries, extra)
        where = "local Python environment"
    else:
        container = find_backend_container(args.container)
        outputs = diagnose_in_container(container, queries, extra)
        where = f"container {container}"

    out_path = Path(args.out) if args.out else REPO_ROOT / f"diagnosis_{datetime.now():%Y%m%d_%H%M%S}.txt"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(f"medNAMA retrieval diagnosis - {datetime.now():%Y-%m-%d %H:%M} - {where}\n\n")
        for q, text in outputs:
            f.write(f"{'=' * 70}\n>>> {q}\n{'=' * 70}\n{text}\n")
    print(f"Report saved to {out_path}")


if __name__ == "__main__":
    main()
