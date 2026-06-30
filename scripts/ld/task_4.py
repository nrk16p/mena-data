import logging
import io
import warnings
import urllib3
import requests
import pandas as pd
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).parent
USERNAME = os.getenv("ATMS_USERNAME", "")
PASSWORD = os.getenv("ATMS_PASSWORD", "")
BASE_URL = "https://www.mena-atms.com"
CUSTOMER_IDS = [19, 20]

logging.basicConfig(
    filename="automation_log.log",
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

warnings.simplefilter("ignore", urllib3.exceptions.InsecureRequestWarning)


def login(session: requests.Session) -> None:
    r = session.post(
        f"{BASE_URL}/account/user/login",
        data={"username": USERNAME, "password": PASSWORD, "submit": "login", "next": ""},
        verify=False,
        timeout=30,
    )
    r.raise_for_status()
    logging.info("Logged in successfully.")


def download_ship_to(session: requests.Session, customer_id: int) -> pd.DataFrame:
    url = f"{BASE_URL}/report/excel/index.excel/type/ship.to"
    payload = {
        "customer_id": str(customer_id),
        "status": "A",
        "from_valid_date": "01/01/2025",
        "submit": "พิมพ์",
        "display_type": "multiple-day",
        "report_type": "ship.to",
    }
    r = session.post(url, data=payload, verify=False, timeout=600)
    r.raise_for_status()
    df = pd.read_excel(io.BytesIO(r.content), header=1)
    logging.info(f"Ship.to downloaded for customer_id={customer_id} ({len(df)} rows).")
    return df


if __name__ == "__main__":
    logging.info("task_4 started.")
    with requests.Session() as session:
        login(session)
        frames = [download_ship_to(session, cid) for cid in CUSTOMER_IDS]
    df = pd.concat(frames, ignore_index=True)
    df.to_excel(str(BASE_DIR / "data" / "ship_to" / "ship_to.xlsx"), index=False)
    logging.info(f"Data saved to ship_to.xlsx ({len(df)} total rows).")
    logging.info("task_4 completed.")
