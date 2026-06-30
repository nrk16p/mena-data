import os
import io
import warnings
import urllib3
import requests
import pandas as pd
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

os.chdir(Path(__file__).parent)

warnings.simplefilter("ignore", urllib3.exceptions.InsecureRequestWarning)

BASE_DIR = Path(__file__).parent
BASE_URL = "https://www.mena-atms.com"
USERNAME = os.getenv("ATMS_USERNAME", "")
PASSWORD = os.getenv("ATMS_PASSWORD", "")
CUSTOMER_IDS = ["139"]


def login(session: requests.Session) -> None:
    r = session.post(
        f"{BASE_URL}/account/user/login",
        data={"username": USERNAME, "password": PASSWORD, "submit": "login", "next": ""},
        verify=False,
        timeout=30,
    )
    r.raise_for_status()


def download_ship_to(session: requests.Session, customer_id: str) -> pd.DataFrame:
    url = f"{BASE_URL}/report/excel/index.excel/type/ship.to"
    payload = {
        "customer_id": customer_id,
        "status": "A",
        "from_valid_date": "01/01/2025",
        "submit": "พิมพ์",
        "display_type": "multiple-day",
        "report_type": "ship.to",
    }
    r = session.post(url, data=payload, verify=False, timeout=120)
    r.raise_for_status()
    df = pd.read_excel(io.BytesIO(r.content), sheet_name=0, dtype=str, skiprows=1)
    df["customer_id"] = customer_id
    return df


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")

    with requests.Session() as s:
        login(s)
        frames = [download_ship_to(s, cid) for cid in CUSTOMER_IDS]

    shipto = pd.concat(frames, ignore_index=True)
    os.makedirs("raw_data", exist_ok=True)
    shipto.to_excel("raw_data/shipto.xlsx", index=False)
    print(f"Saved {len(shipto)} ship.to rows to raw_data/shipto.xlsx")
