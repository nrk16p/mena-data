import os
from pathlib import Path
os.chdir(Path(__file__).parent)

import pandas as pd
import sys
sys.stdout.reconfigure(encoding="utf-8")

cpac = pd.read_excel("raw_data/cpac.xlsx")
fleetlink = pd.read_json("raw_data/fleetlink.json")
vehicledaily = pd.read_excel("raw_data/vehicledaily.xlsx")
vehiclemaster = pd.read_excel("raw_data/vehiclemaster.xlsx")
shipto = pd.read_excel("raw_data/shipto.xlsx")

cpac = cpac[["plantNo", "dpNo", "dpDate", "dpTime", "carNo", "driverName",
             "siteCode", "siteName", "quantity", "distanceCode"]]

if "dpDate" in cpac.columns:
    cpac["dpDate"] = pd.to_datetime(cpac["dpDate"], unit="ms", utc=True).dt.tz_convert("Asia/Bangkok")
if "dpTime" in cpac.columns:
    cpac["dpTime"] = pd.to_datetime(cpac["dpTime"], unit="ms", utc=True).dt.tz_convert("Asia/Bangkok")

cpac["แพล้นท์"] = cpac["dpNo"].astype(str).str[:4]
cpac["วันที่"] = cpac["dpTime"]
cpac["วันที่ครบกำหนด"] = cpac["dpTime"]
cpac["เลขที่ตั๋วเพิ่ม 1"] = cpac["plantNo"]
cpac["เลขที่ตั๋วเพิ่ม 2"] = cpac["distanceCode"]
cpac["เวลาออกเดินทาง"] = cpac["dpTime"]
for col in ["วันเวลาอ้างอิง 1", "วันเวลาอ้างอิง 2", "วันเวลาอ้างอิง 3", "วันเวลาอ้างอิง 4"]:
    cpac[col] = cpac["dpTime"]
cpac["วันเวลาลงสินค้า"] = cpac["dpTime"]
cpac["วันเวลาปิด LDT"] = cpac["dpTime"]
cpac["นน ต้นทาง"] = cpac["quantity"]
cpac["LDT"] = cpac["dpNo"]
cpac["Ship To"] = cpac["dpNo"].astype(str).str[:4] + cpac["siteCode"]

for col, val in [("Type","single drop"),("ผลิตภัณฑ์","คอนกรีตผสมเสร็จ"),("dropoffs",""),
                 ("ประเภทวิ่ง","legacy"),("ประเภทการขนส่งขากลับ",""),("ประเภทการขนส่ง","heavy"),
                 ("Service Parameter A",""),("Service Parameter B",""),("แพล้นท์โอเนย้าย",""),
                 ("ผู้จัดส่งร่วม",""),("ทะเบียนหาง",""),("หมายเหตุ",""),("วิ่งแทนรถทะเบียน",""),("สาขา","LB")]:
    cpac[col] = val

fleetlink = fleetlink[["หมายเลข DP", "เวลาถึงไซต์งาน", "เวลาออกจากไซต์งาน"]]
for col in ["เวลาถึงไซต์งาน", "เวลาออกจากไซต์งาน"]:
    fleetlink[col] = pd.to_datetime(fleetlink[col], errors="coerce", infer_datetime_format=True).dt.tz_localize("Asia/Bangkok", ambiguous="NaT", nonexistent="NaT")

cpac["dpNo"] = cpac["dpNo"].astype(str)
fleetlink["หมายเลข DP"] = fleetlink["หมายเลข DP"].astype(str)
cpac["carNo"] = cpac["carNo"].astype(str)
vehicledaily["เบอร์รถ"] = vehicledaily["เบอร์รถ"].astype(str)

merged = cpac.merge(fleetlink, how="inner", left_on="dpNo", right_on="หมายเลข DP")
merged = merged.merge(vehicledaily, how="inner", left_on="carNo", right_on="เบอร์รถ")

merged["ประเภทรถร่วม"] = ""
merged.loc[merged["คนขับรถ"] == "พจส", "ประเภทรถร่วม"] = "OT-MT01"
merged.loc[merged["คนขับรถ"] == "พจร", "ประเภทรถร่วม"] = "OT-MT02"
merged["รหัส พจส 1"] = merged["รหัส"]
merged["รหัส พจส 2"] = ""
merged["ทะเบียนหัว"] = "สบ." + merged["ทะเบียน"]

merged = merged.merge(vehiclemaster, how="inner", left_on="carNo", right_on="เลขรถ")
merged["เส้นทาง"] = merged["ประเภทยานพาหนะ"].apply(lambda x: "CPAC L" if x == "Mixer 10 ล้อ" else "6 ล้อ")
merged["บริการ"] = merged["เส้นทาง"].apply(lambda x: "M026" if x == "6 ล้อ" else "M025 ")

merged["Ship To"] = merged["Ship To"].astype(str)
shipto["รหัส"] = shipto["รหัส"].astype(str)
merged = merged.merge(shipto, how="left", left_on="Ship To", right_on="รหัส")

merged["นน ปลายทาง"] = merged["นน ต้นทาง"]
merged["นน ปลายทาง"] = merged.apply(
    lambda row: 3 if (row["โซนการจัดส่ง"] == "West" and isinstance(row["นน ปลายทาง"], (int, float)) and row["นน ปลายทาง"] <= 3)
    else row["นน ปลายทาง"], axis=1,
)

datetime_cols = merged.select_dtypes(include=["datetime64[ns]", "datetime64[ns, UTC]"]).columns
for col in datetime_cols:
    merged[col] = merged[col].dt.strftime("%d/%m/%Y %H:%M")

merged = merged.rename(columns={"วันที่_x": "วันที่", "เวลาถึงไซต์งาน": "เลขที่ตั๋วเพิ่ม 3",
                                 "เวลาออกจากไซต์งาน": "เลขที่ตั๋วเพิ่ม 4", "ประเภทรถร่วม_x": "ประเภทรถร่วม"})

selected_cols = [
    "สาขา","บริการ","LDT","Type","ผลิตภัณฑ์","Ship To","เส้นทาง","dropoffs",
    "ประเภทวิ่ง","ประเภทการขนส่งขากลับ","ประเภทการขนส่ง","Service Parameter A","Service Parameter B",
    "แพล้นท์","แพล้นท์โอเนย้าย","วันที่","วันที่ครบกำหนด","เลขที่ตั๋วเพิ่ม 1","เลขที่ตั๋วเพิ่ม 2",
    "เลขที่ตั๋วเพิ่ม 3","เลขที่ตั๋วเพิ่ม 4","หมายเหตุ","ประเภทรถร่วม","ผู้จัดส่งร่วม",
    "รหัส พจส 1","รหัส พจส 2","ทะเบียนหัว","ทะเบียนหาง","เวลาออกเดินทาง",
    "นน ต้นทาง","นน ปลายทาง","วันเวลาอ้างอิง 1","วันเวลาอ้างอิง 2","วันเวลาอ้างอิง 3",
    "วันเวลาอ้างอิง 4","วันเวลาลงสินค้า","วันเวลาปิด LDT","วิ่งแทนรถทะเบียน",
]
merged_selected = merged[selected_cols]

merged_selected["วันที่"] = pd.to_datetime(merged_selected["วันที่"], dayfirst=True, errors="coerce").dt.strftime("%d/%m/%Y")
merged_selected["วันที่"] = merged_selected["วันที่"].astype(str)
merged_selected["วันที่ครบกำหนด"] = pd.to_datetime(merged_selected["วันที่ครบกำหนด"], dayfirst=True, errors="coerce").dt.strftime("%d/%m/%Y")
merged_selected["วันที่ครบกำหนด"] = merged_selected["วันที่ครบกำหนด"].astype(str)

from datetime import datetime, timedelta
os.makedirs("output", exist_ok=True)
yesterday_str = (datetime.now() - timedelta(days=1)).strftime("%d-%m-%y")
filename = f"output/LDTCPAC_{yesterday_str}.xlsx"
merged_selected.to_excel(filename, index=False)
print(f"Saved: {filename}")
