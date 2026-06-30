import logging
import io
import warnings
import urllib3
import requests
import pandas as pd
import os
from datetime import datetime, timedelta
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).parent
USERNAME = os.getenv("ATMS_USERNAME", "")
PASSWORD = os.getenv("ATMS_PASSWORD", "")
BASE_URL = "https://www.mena-atms.com"

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


def download_vehicle_report(session: requests.Session, target_date: str) -> bytes:
    url = f"{BASE_URL}/report/print.out/print.excel/type/vehicle.daily.transaction"
    payload = {
        "t_date": target_date,
        "fleet_id": "1",
        "fleet_group_id": "",
        "num_of_day": "1",
        "submit": "พิมพ์",
        "display_type": "multiple-day",
        "report_type": "vehicle.daily.transaction",
    }
    r = session.post(url, data=payload, verify=False, timeout=120)
    r.raise_for_status()
    logging.info(f"Vehicle report downloaded for {target_date}.")
    return r.content


def process_data(content: bytes) -> pd.DataFrame:
    df = pd.read_excel(io.BytesIO(content), header=2, engine="openpyxl")
    return df[["เบอร์รถ", "ทะเบียน", "สถานะ", "คนขับ", "รหัส.1", "ชื่อ.1"]]


if __name__ == "__main__":
    logging.info("task_2 started.")
    target_date = (datetime.today() - timedelta(days=1)).strftime("%d/%m/%Y")
    with requests.Session() as session:
        login(session)
        content = download_vehicle_report(session, target_date)
    df = process_data(content)
    df.to_excel(str(BASE_DIR / "data" / "driver" / "driver.xlsx"), index=False)
    logging.info("Data saved to driver.xlsx.")
    logging.info("task_2 completed.")
