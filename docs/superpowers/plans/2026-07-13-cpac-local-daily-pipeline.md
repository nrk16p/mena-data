# CPAC Local Daily Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CPAC LDT tickets are generated correctly (no silently dropped or cancelled tickets) and the pipeline runs automatically on this Mac every morning, with catch-up for missed days and the Jun 30 – Jul 12 gap backfilled into MongoDB.

**Architecture:** `scripts/cpac/pipeline_cpac.py` fetches CPAC API + fleetlink + ATMS (vehicle daily / vehicle master / ship.to) for one `--date`, builds LDT + new-ship_to rows, and upserts one doc per `(pipeline='cpac', run_date)` into `atms.ldt_runs` (idempotent — safe to re-run any day). `run_cpac_daily.py` is a catch-up runner driven by `state.json` (`last_success_date`), invoked daily at 08:30 by launchd `com.mena.mena-data-cpac`. The Next.js app regenerates downloadable Excel from the Mongo doc on every click.

**Tech Stack:** Python 3 (`/opt/homebrew/bin/python3`, no venv), pandas, pymongo, requests, macOS launchd. Repo: `~/Documents/project/mena-data` (GitHub `nrk16p/mena-data`, branch `main`).

## Global Constraints

- CPAC pipeline **must run locally on this Mac** (user requirement 2026-07-13); credentials in `scripts/.env` (never commit).
- Mongo writes are `replace_one(..., upsert=True)` per `(pipeline, run_date)` — re-running a day is safe; **never** bulk-modify other pipelines' docs.
- Do NOT change existing ASIA/SCCO Mongo documents (user chose no historical repair).
- `บริการ` value `"M025 "` keeps its trailing space until the user confirms otherwise (legacy value; changing it may break downstream matching).
- Schedule: daily **08:30**, before `com.cpac.rmc-daily` at 09:00.
- Catch-up cap: 14 days per run; logs retained 90 days in `scripts/cpac/logs/`.
- User workflow: `git pull` before commit; commit messages end with the Claude co-author line.

---

### Task 1: Fix ticket logic in pipeline_cpac.py ✅ DONE (commit 83bc7e3)

**Files:**
- Modify: `scripts/cpac/pipeline_cpac.py`

**Interfaces:**
- Produces: `_drop_cancelled(cpac, fleetlink) -> pd.DataFrame`; `build_ldt(...)` / `build_new_shippo(...)` now tolerate tickets missing from fleetlink / vehicle daily / vehicle master.

- [x] **Step 1: Add `_drop_cancelled` helper** — drops tickets whose fleetlink `สถานะตั๋ว == "ยกเลิก"` (keyed by `หมายเลข DP` vs `dpNo`); called at the top of both `build_ldt` and `build_new_shippo`.
- [x] **Step 2: inner → left joins** in both builders for fleetlink (`dpNo ↔ หมายเลข DP`), vehicle daily (`carNo ↔ เบอร์รถ`), vehicle master (`carNo ↔ เลขรถ`), with `drop_duplicates` on each right-hand key before merging and `log.info` of match counts.
- [x] **Step 3: NaN guards** — `ทะเบียนหัว = np.where(ทะเบียน.notna(), "สบ."+ทะเบียน, "")`; `เส้นทาง`/`บริการ` become `""` (not `"6 ล้อ"`/`"M026"`) when vehicle master has no match.
- [x] **Step 4: final dedup** — `merged = merged[~merged["LDT"].astype(str).duplicated(keep="last")]` before column selection in `build_ldt`.
- [x] **Step 5: offline synthetic test** — 4 tickets (1 cancelled, 1 unknown truck): cancelled dropped, no ticket lost, unknown truck kept with blanks, `M026`/`M025 ` mapping correct. PASSED.
- [x] **Step 6: commit** — included in `83bc7e3`.

### Task 2: `--date` argument ✅ DONE (commit 83bc7e3)

- [x] `pipeline_cpac.py` main accepts `--date YYYY-MM-DD` (default: yesterday); drives CPAC API (`dd-mm-YYYY`), ATMS forms (`dd/mm/YYYY`), fleetlink (`YYYY-MM-DD`), `run_date`, and `filename` `LDTCPAC_dd-mm-yy.xlsx`.

### Task 3: Catch-up runner ✅ DONE (commit 83bc7e3)

**Files:**
- Create: `scripts/cpac/run_cpac_daily.py`
- State: `scripts/cpac/state.json` (gitignored) — `{"last_success_date": "YYYY-MM-DD"}`
- Logs: `scripts/cpac/logs/cpac_YYYY-MM-DD.log` (gitignored)

- [x] Runner loops `last_success_date + 1 … yesterday` (cap 14), runs `pipeline_cpac.py --date D` via subprocess, advances state only on exit 0, stops on first failure (retried next invocation), prunes logs older than 90 days.
- [x] `.gitignore` gained `scripts/cpac/state.json`, `scripts/cpac/logs/`, `__pycache__/`.

### Task 4: launchd schedule ✅ DONE

**Files:**
- Create: `~/Library/LaunchAgents/com.mena.mena-data-cpac.plist` (outside repo)

- [x] Plist runs `/opt/homebrew/bin/python3 …/scripts/cpac/run_cpac_daily.py` daily 08:30, WorkingDirectory `scripts/cpac`, stdout/err → `logs/launchd.log`.
- [x] Loaded: `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.mena.mena-data-cpac.plist`; verified in `launchctl list` (status 0).

### Task 5: Backfill Jun 30 – Jul 12 ✅ DONE

- [x] **Step 1:** `state.json` initialized to `{"last_success_date": "2026-06-29"}` (Mongo had only the 2026-06-29 run).
- [x] **Step 2:** Started via `launchctl kickstart gui/$(id -u)/com.mena.mena-data-cpac` (survives session; no Bash timeout). Monitor task `bg3dauoge` reports per-day progress.
- [x] **Step 3: Wait until `state.json` reaches `2026-07-12`.** Done 2026-07-13 ~08:5x. Two mid-run fixes were needed and are committed: ship.to 12h cache (`9c23bc2` — ship.to is ~8 min/fetch and identical across days) and ship.to retry ×3 / 900s timeout (`4753290` — 2026-07-02 failed once on a 600s ReadTimeout; runner resumed from state as designed).

### Task 6: Verify backfilled data in Mongo ✅ DONE

Result 2026-07-13: 13/13 docs present, 3,842 LDT rows total (166–358/day), `bad_date=0`, `dup_LDT=0`, `blank_บริการ=0` every day; only 2026-07-12 has 2 rows with blank ทะเบียน/รหัสพจส (trucks absent from that day's vehicle daily — kept by design). 2026-07-11/12 show 147/102 new ship_to (recent sites not yet registered in ATMS master — expected).

- [x] **Step 1: Run verification script** (read-only, bounded — 13 filtered docs with projection):

```bash
cd /Users/menatransport_02/Documents/project/mena-data/scripts && python3 - <<'EOF'
import os
from dotenv import load_dotenv
load_dotenv('.env')
from pymongo import MongoClient
import pandas as pd
c = MongoClient(os.getenv('MONGODB_URI'))
docs = list(c['atms']['ldt_runs'].find(
    {'pipeline': 'cpac', 'run_date': {'$gte': '2026-06-30', '$lte': '2026-07-12'}}
).sort('run_date', 1))
c.close()
assert len(docs) == 13, f'expected 13 docs, got {len(docs)}'
for d in docs:
    df = pd.DataFrame(d['ldt_rows'])
    rd = d['run_date']
    exp = f"{rd[8:10]}/{rd[5:7]}/{rd[:4]}"          # dd/mm/yyyy of run_date
    bad_date = (~df['วันที่'].astype(str).str.startswith(exp)).sum() if len(df) else 0
    blank_svc = (df['บริการ'].fillna('') == '').sum() if len(df) else 0
    blank_plate = (df['ทะเบียนหัว'].fillna('') == '').sum() if len(df) else 0
    dup = df['LDT'].duplicated().sum() if len(df) else 0
    print(f"{rd}: rows={d['ldt_count']} shipto={d['new_ship_to_count']} "
          f"bad_date={bad_date} dup_LDT={dup} blank_บริการ={blank_svc} blank_ทะเบียน={blank_plate}")
EOF
```

Expected: 13 lines, `rows>0` (typically 200-400), `bad_date=0`, `dup_LDT=0`; small `blank_บริการ`/`blank_ทะเบียน` counts are acceptable (trucks genuinely absent from ATMS references — these rows previously vanished entirely).

- [x] **Step 2: Spot-check one day's download path** — `GET /api/pipeline/cpac` lists the runs from Mongo; no code change needed (route already maps `cpac`).
- [x] **Step 3: Commit this plan doc** (`git pull` first):

```bash
cd /Users/menatransport_02/Documents/project/mena-data && git pull && \
git add docs/superpowers/plans/2026-07-13-cpac-local-daily-pipeline.md && \
git commit -m "docs: CPAC local daily pipeline plan

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" && git push
```

### Task 7: Report + open decisions (user input required)

- [ ] Summarize to user: backfill result table, schedule status, log locations.
- [ ] **Decision 1:** `"M025 "` trailing space — intentional? If not: change to `"M025"` in `build_ldt`/`build_new_shippo` (2 sites), re-run affected dates via `--date`.
- [ ] **Decision 2:** ASIA/SCCO remain manual (user chose "เอาแค่ cpac") — extend the same runner pattern later if wanted.

## Self-Review

- Spec coverage: ticket-logic fixes (Task 1), local scheduling (Tasks 3-4), migration/backfill (Task 5), verification (Task 6) — all covered; no gaps.
- Placeholder scan: verification step contains the full runnable script; no TBDs.
- Type consistency: state file key `last_success_date` used identically in Tasks 3/5; Mongo filter keys match `write_to_mongo` fields.
