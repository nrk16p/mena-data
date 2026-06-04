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
url = "https://www.mena-atms.com/report/print.out/print.excel/type/vehicle.daily.transaction"
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
    for fleet_group_id in ["1", "2"]:
        payload = {
            "fleet_group_id": fleet_group_id,
            "fleet_id": "",
            "t_date": yesterday,
            "num_of_day": "1",
            "submit": "พิมพ์",
            "display_type": "multiple-day",
            "report_type": "vehicle.daily.transaction",
        }
        r = s.post(url, data=payload, headers=headers, verify=False, timeout=60)
        r.raise_for_status()
        with io.BytesIO(r.content) as f:
            df = pd.read_excel(f, sheet_name=0, dtype=str, skiprows=1)
            df["fleet_group_id"] = fleet_group_id
            all_results.append(df)

final_df = pd.concat(all_results, ignore_index=True)
final_df = final_df[["วันที่", "ฟลีท", "แพลนท์", "หัว", "Unnamed: 7", "Unnamed: 8", "Unnamed: 13", "Unnamed: 14", "Unnamed: 15", "สเตตัส", "คนขับรถ"]]
rename_map = {
    "หัว": "ยี่ห้อ",
    "Unnamed: 7": "เบอร์รถ",
    "Unnamed: 8": "ทะเบียน",
    "Unnamed: 13": "รหัส",
    "Unnamed: 14": "ชื่อ",
    "Unnamed: 15": "เบอร์โทร",
}
final_df = final_df.rename(columns=rename_map)
final_df = final_df.dropna(subset=["วันที่"])
final_df["ทะเบียน"] = final_df["ทะเบียน"].str.replace("สบ.", "", regex=False)
os.makedirs("raw_data", exist_ok=True)
final_df.to_excel("raw_data/vehicledaily.xlsx", index=False)
