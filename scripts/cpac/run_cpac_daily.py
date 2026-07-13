"""Daily CPAC pipeline runner with catch-up.

Run by launchd (com.mena.mena-data-cpac) every morning; safe to run manually.
state.json holds last_success_date — each run processes every missed day
through yesterday (cap MAX_DAYS per run). A failed day stops the run and is
retried on the next invocation; pipeline writes are idempotent (Mongo upsert
per pipeline/run_date).
"""
import json
import subprocess
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

BASE = Path(__file__).parent
STATE_PATH = BASE / "state.json"
LOG_DIR = BASE / "logs"
MAX_DAYS = 14
RETENTION_DAYS = 90


def main() -> int:
    LOG_DIR.mkdir(exist_ok=True)
    logf = open(LOG_DIR / f"cpac_{date.today().isoformat()}.log", "a")

    def log(msg: str) -> None:
        line = f"{datetime.now():%Y-%m-%d %H:%M:%S} {msg}"
        print(line)
        logf.write(line + "\n")
        logf.flush()

    # prune old logs
    cutoff = datetime.now() - timedelta(days=RETENTION_DAYS)
    for f in LOG_DIR.glob("cpac_*.log"):
        try:
            if datetime.strptime(f.stem[5:], "%Y-%m-%d") < cutoff:
                f.unlink()
        except ValueError:
            pass

    yesterday = date.today() - timedelta(days=1)
    state = json.loads(STATE_PATH.read_text()) if STATE_PATH.exists() else {}
    last = (date.fromisoformat(state["last_success_date"])
            if state.get("last_success_date") else yesterday - timedelta(days=1))

    if last >= yesterday:
        log(f"Up to date (last_success_date={last})")
        return 0

    day = last + timedelta(days=1)
    processed = 0
    while day <= yesterday and processed < MAX_DAYS:
        log(f"Running pipeline for {day}")
        r = subprocess.run(
            [sys.executable, str(BASE / "pipeline_cpac.py"), "--date", day.isoformat()],
            capture_output=True, text=True,
        )
        logf.write(r.stdout)
        logf.write(r.stderr)
        logf.flush()
        if r.returncode != 0:
            log(f"FAILED for {day} (exit {r.returncode}) — stopping, will retry next run")
            return 1
        state["last_success_date"] = day.isoformat()
        STATE_PATH.write_text(json.dumps(state))
        log(f"OK {day}")
        processed += 1
        day += timedelta(days=1)

    if day <= yesterday:
        log(f"Reached MAX_DAYS={MAX_DAYS} cap — remaining days continue next run")
    return 0


if __name__ == "__main__":
    sys.exit(main())
