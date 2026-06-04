import os
from pathlib import Path
os.chdir(Path(__file__).parent)

import requests
import warnings
import urllib3
import pandas as pd
import logging
from io import StringIO
from typing import Optional
import sys
sys.stdout.reconfigure(encoding="utf-8")
from dotenv import load_dotenv

load_dotenv()

warnings.simplefilter("ignore", urllib3.exceptions.InsecureRequestWarning)

BASE_URL = (
    "https://www.mena-atms.com/veh/vehicle/index.export/"
    "?page=1&order_by=v.code%20asc&search-toggle-status=&order_by=v.code%20asc"
)

logging.basicConfig(
    filename="app.log",
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)


def run_vehiclemaster(phpsessid: str) -> Optional[pd.DataFrame]:
    headers = {
        "Referer": BASE_URL,
        "Cookie": f"PHPSESSID={phpsessid}",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
    }
    try:
        resp = requests.get(BASE_URL, headers=headers, verify=False, timeout=60)
        resp.raise_for_status()
    except requests.RequestException as e:
        logging.error(f"Failed to fetch vehicle master: {e}")
        return None

    if not resp.encoding:
        resp.encoding = resp.apparent_encoding

    try:
        tables = pd.read_html(StringIO(resp.text), displayed_only=False)
    except Exception as e:
        logging.error(f"HTML parsing error: {e}")
        return None

    if not tables:
        return None

    df = max(tables, key=lambda t: t.shape[0] * t.shape[1])
    df.columns = df.columns.map(lambda c: str(c).strip())
    df = df.loc[:, ~df.columns.astype(str).str.contains(r"^Unnamed", case=False)]
    df = df.astype(str)

    keep_cols = ["ทะเบียน", "เลขรถ", "ประเภทรถร่วม", "ประเภทยานพาหนะ", "ประเภทยานพาหนะเพิ่มเติม"]
    existing_cols = [col for col in keep_cols if col in df.columns]
    df = df[existing_cols]

    os.makedirs("raw_data", exist_ok=True)
    output_path = Path("raw_data") / "vehiclemaster.xlsx"
    df.to_excel(output_path, index=False)
    logging.info(f"Saved vehicle master to {output_path}")
    return df


if __name__ == "__main__":
    phpsessid = "nn0jiufk4njcd956rovb0isk8u"
    result = run_vehiclemaster(phpsessid)
    if result is not None:
        print(f"Vehicle master fetched successfully ({len(result)} rows).")
    else:
        print("Failed to fetch vehicle master.")
