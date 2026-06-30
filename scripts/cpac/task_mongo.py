import os
import pandas as pd
from pathlib import Path
from datetime import datetime, timedelta, timezone
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).parent
MONGODB_URI = os.getenv("MONGODB_URI", "")
PIPELINE = "cpac"


def save_run_to_mongo(df_ldt: pd.DataFrame, run_date: str, filename: str) -> None:
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
            "new_ship_to_rows": [],
            "ldt_count": len(df_ldt),
            "new_ship_to_count": 0,
            "created_at": datetime.now(timezone.utc),
        }

        col.replace_one(
            {"pipeline": PIPELINE, "run_date": run_date},
            doc,
            upsert=True,
        )
        print(f"MongoDB updated: {PIPELINE} / {run_date} ({len(df_ldt)} LDT rows)")
    finally:
        client.close()


if __name__ == "__main__":
    yesterday = (datetime.today() - timedelta(days=1))
    run_date = yesterday.strftime("%Y-%m-%d")
    yesterday_str = yesterday.strftime("%d-%m-%y")
    filename = f"LDTCPAC_{yesterday_str}.xlsx"

    ldt_path = str(BASE_DIR / "output" / filename)
    if not os.path.exists(ldt_path):
        print(f"LDT file not found: {ldt_path}")
        exit(1)

    df_ldt = pd.read_excel(ldt_path)
    save_run_to_mongo(df_ldt, run_date, filename)
