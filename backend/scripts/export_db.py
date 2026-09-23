"""Export / restore the medNAMA PostgreSQL database as a portable pg_dump file.

Why this exists
---------------
PowerShell's `>` redirect re-encodes native command output as text, which
corrupts the binary custom-format dump. Running pg_dump through Python's
subprocess captures raw stdout bytes, so the .dump file stays byte-clean on
Windows and Linux alike.

Export (run on the machine with the source database - usually this PC):

    python scripts/export_db.py                       # writes ../medrag.dump
    python scripts/export_db.py --out /tmp/medrag.dump

Restore (run on the NAS, from the directory that contains docker-compose.yml):

    python scripts/export_db.py --restore --dump medrag.dump --db medrag_new
    python scripts/export_db.py --restore --dump medrag.dump --db medrag_new \
        --compose-file /path/to/docker-compose.yml   # if auto-discovery misses it

The restore creates a brand-new database so the currently-running NAS app is
never touched. Point the app's .env DATABASE_URL at the new DB afterwards.

The compose file is auto-discovered by walking up from the current directory
(handles layouts where this script lives elsewhere than next to the compose
file). Override it with --compose-file if needed.
"""

import argparse
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent

# Mirrors docker-compose.yml on the dev machine
DEFAULT_USER = "medrag"
DEFAULT_DB = "medrag"
DEFAULT_SERVICE = "db"

COMPOSE_NAMES = ("docker-compose.yml", "docker-compose.yaml",
                 "compose.yml", "compose.yaml")


def find_compose_file(explicit: str | None) -> Path | None:
    """Locate the docker-compose file to use for the db service.

    Priority: 1) --compose-file (must exist), 2) walk up from the current
    working directory, 3) walk up from this repo's root. Returns None only if
    no compose file can be found.
    """
    if explicit:
        p = Path(explicit).resolve()
        if not p.exists():
            raise SystemExit(f"--compose-file not found: {explicit}")
        return p

    for start in (Path.cwd(), REPO_ROOT):
        d = start
        for _ in range(6):
            for name in COMPOSE_NAMES:
                cand = d / name
                if cand.exists():
                    return cand
            if d.parent == d:
                break
            d = d.parent
    return None


def compose(compose_file: Path | None, args: list[str]) -> list[str]:
    cmd = ["docker", "compose"]
    if compose_file:
        cmd += ["-f", str(compose_file)]
    return cmd + args


def run(command: list[str], input_bytes: bytes | None = None) -> bytes:
    """Run a command capturing raw output bytes (binary-safe)."""
    proc = subprocess.run(command, input=input_bytes,
                          capture_output=True, check=False)
    if proc.returncode != 0:
        sys.stderr.write(proc.stderr.decode(errors="replace"))
        raise SystemExit(f"command failed ({proc.returncode}): {' '.join(command)}")
    return proc.stdout


def ensure_database(compose_file: Path | None, service: str, user: str, db: str) -> None:
    """Create the target database if missing; fail loudly when it truly can't."""
    proc = subprocess.run(
        compose(compose_file, ["exec", "-T", service, "createdb", "-U", user, db]),
        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=False,
    )
    if proc.returncode == 0:
        print(f"Database '{db}' ready (newly created).")
        return
    # createdb fails when the DB already exists - confirm that is the case
    check = subprocess.run(
        compose(compose_file, ["exec", "-T", service, "psql", "-U", user, "-tAc",
                               f"SELECT 1 FROM pg_database WHERE datname='{db}'"]),
        capture_output=True, check=False,
    )
    if check.returncode == 0 and b"1" in check.stdout:
        print(f"Database '{db}' already exists - restoring into it.")
        return
    sys.stderr.write(proc.stderr.decode(errors="replace"))
    raise SystemExit(
        f"Could not create database '{db}' and it does not exist.\n"
        f"  Is the compose file correct and is the '{service}' service running?\n"
        f"  docker compose ps  (from the directory with your compose file)"
    )


def export(args) -> None:
    compose_file = find_compose_file(args.compose_file)
    out = args.out
    if not out.is_absolute():
        out = REPO_ROOT / out
    print(f"Exporting '{args.db}' -> {out} ...")
    if compose_file:
        print(f"  (using compose file: {compose_file})")

    data = run(compose(
        compose_file,
        ["exec", "-T", args.service, "pg_dump",
         "-U", args.user, "-Fc", "-Z", "9", "-d", args.db, "--no-owner"],
    ))

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(data)
    size_mb = len(data) / 1024 / 1024
    print(f"OK - wrote {size_mb:.1f} MB to {out}\n"
          f"Next: copy this file to the NAS, then there run:\n"
          f"  python scripts/export_db.py --restore --dump {out.name} --db medrag_new")


def restore(args) -> None:
    dump = Path(args.dump)
    if not dump.is_absolute():
        dump = Path.cwd() / dump
    if not dump.exists():
        raise SystemExit(f"dump file not found: {dump}")
    compose_file = find_compose_file(args.compose_file)
    if compose_file is None:
        raise SystemExit(
            "Could not find a docker-compose file. Run this from the directory "
            "that contains docker-compose.yml, or pass --compose-file <path>. "
            "Also check --service matches the name of your database service "
            "in the compose file (default 'db')."
        )
    print(f"Using compose file: {compose_file}")

    ensure_database(compose_file, args.service, args.user, args.db)

    print(f"Restoring {dump.name} -> {args.db} ...")
    run(compose(compose_file, [
        "exec", "-T", "-i", args.service,
        "pg_restore", "-U", args.user, "-d", args.db, "--no-owner",
    ]), input_bytes=dump.read_bytes())
    print(f"OK - restored. Point the backend's DATABASE_URL at database '{args.db}' and restart.\n"
          f"Verify:  docker compose exec -T {args.service} psql -U {args.user} -d {args.db} -c "
          f"\"SELECT (SELECT count(*) FROM chunks) chunks, (SELECT count(*) FROM figures) figures, "
          f"(SELECT count(*) FROM books) books;\"")


def main() -> None:
    parser = argparse.ArgumentParser(description="Export / restore the medNAMA database as pg_dump file.")
    parser.add_argument("--restore", action="store_true", help="Restore a dump instead of exporting")
    parser.add_argument("--out", type=Path, default=Path("medrag.dump"), help="Export output path (default ../medrag.dump)")
    parser.add_argument("--dump", type=Path, help="Dump file to restore (required with --restore)")
    parser.add_argument("--db", default=DEFAULT_DB, help=f"DB to export from, or new DB name to restore into (default {DEFAULT_DB})")
    parser.add_argument("--user", default=DEFAULT_USER, help=f"Postgres user (default {DEFAULT_USER})")
    parser.add_argument("--service", default=DEFAULT_SERVICE, help=f"docker compose service name (default '{DEFAULT_SERVICE}')")
    parser.add_argument("--compose-file", default=None, help="Path to docker-compose.yml if auto-discovery fails")
    args = parser.parse_args()

    if args.restore:
        if not args.dump:
            raise SystemExit("--restore requires --dump path/to/file.dump")
        restore(args)
    else:
        export(args)


if __name__ == "__main__":
    main()