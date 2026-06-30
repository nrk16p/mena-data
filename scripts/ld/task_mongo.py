import os
import pandas as pd
from pathlib import Path
from datetime import datetime, timezone
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).parent
MONGODB_URI = os.getenv("MONGODB_URI", "")
PIPELINE = "asia"


def save_run_to_mongo(df_ldt: pd.DataFrame, df_new_ship_to: pd.DataFrame, run_date: str, filename: str) -> None:
    if not MONGODB_URI:
        print("MONGODB_URI not set — skipping MongoDB write.")
        return

    client = MongoClient(MONGODB_URI)
    try:
        db = client["atms"]
        col = db["ldt_runs"]

        def to_records(df):
            return df.where(pd.notnull(df), None).to_dict("records")

        doc = {
            "pipeline": PIPELINE,
            "run_date": run_date,
            "filename": filename,
            "ldt_rows": to_records(df_ldt),
            "new_ship_to_rows": to_records(df_new_ship_to),
            "ldt_count": len(df_ldt),
            "new_ship_to_count": len(df_new_ship_to),
            "created_at": datetime.now(timezone.utc),
        }

        col.replace_one(
            {"pipeline": PIPELINE, "run_date": run_date},
            doc,
            upsert=True,
        )
        print(f"MongoDB updated: {PIPELINE} / {run_date} ({len(df_ldt)} LDT rows, {len(df_new_ship_to)} new ship_to rows)")
    finally:
        client.close()


if __name__ == "__main__":
    from datetime import timedelta
    yesterday = (datetime.today() - timedelta(days=1)).strftime("%d%m%Y")
    run_date = (datetime.today() - timedelta(days=1)).strftime("%Y-%m-%d")
    filename_all = f"LDTASIA_{yesterday}(มี+ไม่มีshipto).xlsx"
    new_ship_to_file = f"NEWSHIPTO_{yesterday}.xlsx"

    ldt_path = str(BASE_DIR / "output" / filename_all)
    ship_to_path = str(BASE_DIR / "output" / new_ship_to_file)

    if not os.path.exists(ldt_path):
        print(f"LDT file not found: {ldt_path}")
        exit(1)

    df_ldt = pd.read_excel(ldt_path)
    df_new_ship_to = pd.read_excel(ship_to_path) if os.path.exists(ship_to_path) else pd.DataFrame()

    save_run_to_mongo(df_ldt, df_new_ship_to, run_date, filename_all)
