import os
from pathlib import Path
os.chdir(Path(__file__).parent)

import requests
import io
import pandas as pd
import warnings
import urllib3
import sys
sys.stdout.reconfigure(encoding="utf-8")

PHPSESSID = "nn0jiufk4njcd956rovb0isk8u"
url = "https://www.mena-atms.com/report/excel/index.excel/type/ship.to"
headers = {
    "Referer": url,
    "Content-Type": "application/x-www-form-urlencoded",
    "Cookie": f"PHPSESSID={PHPSESSID}",
}

from datetime import datetime, timedelta
yesterday = (datetime.today() - timedelta(days=1)).strftime("%d/%m/%Y")

warnings.simplefilter("ignore", urllib3.exceptions.InsecureRequestWarning)

all_results = []
with requests.Session() as s:
    for customer_id in ["139"]:
        payload = {
            "customer_id": customer_id,
            "status": "A",
            "from_valid_date": "01/01/2025",
            "submit": "พิมพ์",
            "display_type": "multiple-day",
            "report_type": "ship.to",
        }
        r = s.post(url, data=payload, headers=headers, verify=False, timeout=60000)
        r.raise_for_status()
        with io.BytesIO(r.content) as f:
            df = pd.read_excel(f, sheet_name=0, dtype=str, skiprows=1)
            df["customer_id"] = customer_id
            all_results.append(df)

shipto = pd.concat(all_results, ignore_index=True)
os.makedirs("raw_data", exist_ok=True)
shipto.to_excel("raw_data/shipto.xlsx", index=False)
