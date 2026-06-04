import os
from pathlib import Path
os.chdir(Path(__file__).parent)

import pandas as pd
import numpy as np
import sys
sys.stdout.reconfigure(encoding="utf-8")
from datetime import datetime, timedelta

cpac = pd.read_excel("raw_data/cpac.xlsx")
zone = pd.read_excel("raw_data/zone.xlsx")
fleetlink = pd.read_json("raw_data/fleetlink.json")
vehicledaily = pd.read_excel("raw_data/vehicledaily.xlsx")
vehiclemaster = pd.read_excel("raw_data/vehiclemaster.xlsx")
shipto = pd.read_excel("raw_data/shipto.xlsx")

cpac = cpac[["plantNo","dpNo","dpDate","dpTime","carNo","driverName","siteCode","siteName","quantity","distanceCode"]]

if "dpDate" in cpac.columns:
    cpac["dpDate"] = pd.to_datetime(cpac["dpDate"], unit="ms", utc=True).dt.tz_convert("Asia/Bangkok")
if "dpTime" in cpac.columns:
    cpac["dpTime"] = pd.to_datetime(cpac["dpTime"], unit="ms", utc=True).dt.tz_convert("Asia/Bangkok")

cpac["แพล้นท์"] = cpac["dpNo"].astype(str).str[:4]
cpac["LDT"] = cpac["dpNo"]
cpac["Ship To"] = cpac["dpNo"].astype(str).str[:4] + cpac["siteCode"]
cpac["นน ต้นทาง"] = cpac["quantity"]

fleetlink = fleetlink[["หมายเลข DP","เวลาถึงไซต์งาน","เวลาออกจากไซต์งาน",
                        "ระยะทางจากแพลนต์ถึงไซต์งาน (กิโลเมตร) (คำนวณสิ้นวัน)",
                        "ระยะทางขากลับแพลนต์ (กิโลเมตร) (คำนวณสิ้นวัน)"]]

for col in ["เวลาถึงไซต์งาน","เวลาออกจากไซต์งาน"]:
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
merged["ทะเบียนหัว"] = "สบ." + merged["ทะเบียน"]

merged = merged.merge(vehiclemaster, how="inner", left_on="carNo", right_on="เลขรถ")
merged["เส้นทาง"] = merged["ประเภทยานพาหนะ"].apply(lambda x: "CPAC L" if x == "Mixer 10 ล้อ" else "6 ล้อ")
merged["บริการ"] = merged["เส้นทาง"].apply(lambda x: "M026" if x == "6 ล้อ" else "M025 ")

merged["Ship To"] = merged["Ship To"].astype(str)
shipto["รหัส"] = shipto["รหัส"].astype(str)
merged = merged.merge(shipto, how="left", left_on="Ship To", right_on="รหัส")

merged["นน ปลายทาง"] = merged["นน ต้นทาง"]
merged["นน ปลายทาง"] = merged.apply(
    lambda row: 3 if (row.get("โซนการจัดส่ง") == "West" and isinstance(row["นน ปลายทาง"], (int, float)) and row["นน ปลายทาง"] <= 3)
    else row["นน ปลายทาง"], axis=1,
)

datetime_cols = merged.select_dtypes(include=["datetime64[ns]","datetime64[ns, UTC]"]).columns
for col in datetime_cols:
    merged[col] = merged[col].dt.strftime("%d/%m/%Y %H:%M")

merged = merged[["dpNo","Ship To","เส้นทาง","siteName","แพล้นท์","siteCode","distanceCode",
                  "ระยะทางจากแพลนต์ถึงไซต์งาน (กิโลเมตร) (คำนวณสิ้นวัน)",
                  "ระยะทางขากลับแพลนต์ (กิโลเมตร) (คำนวณสิ้นวัน)"]]

merged["แพล้นท์"] = merged["แพล้นท์"].astype(str).str.strip()
zone["รหัสแพล้นท์"] = zone["รหัสแพล้นท์"].astype(str).str.strip()
merged = merged.merge(zone[["รหัสแพล้นท์","โซน","จราจร"]], how="left", left_on="แพล้นท์", right_on="รหัสแพล้นท์")
merged = merged.drop_duplicates(subset=["dpNo"], keep="first").reset_index(drop=True)

merged = merged.rename(columns={
    "siteName": "Site Name", "โซน": "โซน", "จราจร": "สภาพการจราจร",
    "แพล้นท์": "เดินทางจาก", "siteCode": "เดินทางไป", "distanceCode": "Distance Code",
    "ระยะทางจากแพลนต์ถึงไซต์งาน (กิโลเมตร) (คำนวณสิ้นวัน)": "ทางเรียบหนัก",
    "ระยะทางขากลับแพลนต์ (กิโลเมตร) (คำนวณสิ้นวัน)": "ทางเรียบเบา",
})
merged["LDT"] = merged["dpNo"]
merged["เลขที่"] = merged["Ship To"]
merged["ลูกค้า"] = "CUS-00073"
merged["รหัสอ้างอิงลูกค้า"] = ""
merged["ที่อยู่"] = "-"
for col in ["ตีเปล่า","ขึ้นเขาสูงหนัก","ขึ้นเขาเบา","ขึ้นเขาสูงเบา","สำรอง"]:
    merged[col] = 0

distance_map = {1:5,2:10,3:15,4:20,5:25,6:30,7:35,8:40}
merged["Distance Code"] = merged["Distance Code"].astype(str).str.extract(r"(\d+)").astype(float)
merged["Cpac"] = merged["Distance Code"].map(distance_map).fillna(0)
merged["ระยะทาง"] = merged["Cpac"]

os.makedirs("output", exist_ok=True)
yesterday_str = (datetime.now() - timedelta(days=1)).strftime("%d-%m-%y")

final_ldt_cols = ["LDT","เลขที่","เส้นทาง","รหัสอ้างอิงลูกค้า","Site Name","ลูกค้า","โซน",
                  "สภาพการจราจร","เดินทางจาก","เดินทางไป","ที่อยู่","ระยะทาง","ตีเปล่า",
                  "ทางเรียบหนัก","ขึ้นเขาสูงหนัก","ทางเรียบเบา","ขึ้นเขาเบา","ขึ้นเขาสูงเบา","สำรอง"]
merged[final_ldt_cols].to_excel(f"output/LDTSHIPTOCPAC_{yesterday_str}.xlsx", index=False)

df_final = merged[["เลขที่","เส้นทาง","รหัสอ้างอิงลูกค้า","Site Name","ลูกค้า","โซน",
                    "สภาพการจราจร","เดินทางจาก","เดินทางไป","ที่อยู่","ระยะทาง","ตีเปล่า",
                    "ทางเรียบหนัก","ขึ้นเขาสูงหนัก","ทางเรียบเบา","ขึ้นเขาเบา","ขึ้นเขาสูงเบา","สำรอง"]].copy()
df_final["ทางเรียบหนัก"] = pd.to_numeric(df_final["ทางเรียบหนัก"], errors="coerce")
df_final["ทางเรียบเบา"] = pd.to_numeric(df_final["ทางเรียบเบา"], errors="coerce")
df_final["ทางเรียบหนัก"] = df_final.groupby("เลขที่")["ทางเรียบหนัก"].transform("mean").round(2)
df_final["ทางเรียบเบา"] = df_final.groupby("เลขที่")["ทางเรียบเบา"].transform("mean").round(2)
df_final["เลขที่"] = df_final["เลขที่"].astype(str)
shipto["รหัส"] = shipto["รหัส"].astype(str)
df_final = df_final[~df_final["เลขที่"].isin(shipto["รหัส"])]
df_final["แพล้นท์"] = df_final["เดินทางจาก"]

first_day = datetime.today().replace(day=1).strftime("1/%m/%Y")
first_day_next = datetime.today().replace(day=1, year=datetime.today().year + 1).strftime("1/%m/%Y")
df_final["เริ่มใช้งานตั้งแต่"] = first_day
df_final["ใช้งานถึงวันที่"] = first_day_next

yesterday_ddmmyyyy = (datetime.now() - timedelta(days=1)).strftime("%d%m%Y")
df_final.to_excel(f"output/NEWSHIPTOCPAC_{yesterday_ddmmyyyy}.xlsx", index=False)
print("done")
