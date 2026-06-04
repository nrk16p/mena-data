import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime, timedelta

BASE_DIR = Path(__file__).parent

ldf_path = str(BASE_DIR / "data" / "ldt" / "df_ldt.xlsx")
zone_path = str(BASE_DIR / "data" / "zone" / "df_zone.xlsx")
ldf_process_path = str(BASE_DIR / "data" / "processed_ldf" / "processed_ldf.xlsx")
raw_ldt_path = str(BASE_DIR / "data" / "raw_ldt" / "raw_ldt.xlsx")
ship_to_path = str(BASE_DIR / "data" / "ship_to" / "ship_to.xlsx")
vehicle_path = str(BASE_DIR / "raw_data" / "vehiclemaster.xlsx")

df_ldf = pd.read_excel(ldf_path)
df_zone = pd.read_excel(zone_path)
df_ldf_process = pd.read_excel(ldf_process_path)
df_ship_to_atms = pd.read_excel(ship_to_path)
raw_ldt = pd.read_excel(raw_ldt_path)
vehicle = pd.read_excel(vehicle_path)

yesterday = (datetime.today() - timedelta(days=1)).strftime("%d%m%Y")
filename_all = f"LDTASIA_{yesterday}(มี+ไม่มีshipto).xlsx"
output_file = str(BASE_DIR / "output" / filename_all)


def fmt_date_text(val):
    if pd.isna(val):
        return ""
    dt = pd.to_datetime(val, dayfirst=True, errors="coerce")
    if pd.isna(dt):
        return str(val)
    return dt.strftime("%d/%m/%Y")


def fmt_datetime_text(val):
    if pd.isna(val):
        return ""
    dt = pd.to_datetime(val, dayfirst=True, errors="coerce")
    if pd.isna(dt):
        return str(val)
    return dt.strftime("%d/%m/%Y") if (dt.hour == 0 and dt.minute == 0) else dt.strftime("%d/%m/%Y %H:%M")


date_only_cols = ["วันที่", "วันที่ครบกำหนด"]
datetime_cols_text = [
    "เวลาออกเดินทาง", "วันเวลาอ้างอิง 1", "วันเวลาอ้างอิง 2",
    "วันเวลาอ้างอิง 3", "วันเวลาอ้างอิง 4", "วันเวลาลงสินค้า", "วันเวลาปิด LDT",
]

for col in date_only_cols:
    if col in df_ldf_process.columns:
        df_ldf_process[col] = df_ldf_process[col].apply(fmt_date_text)

for col in datetime_cols_text:
    if col in df_ldf_process.columns:
        df_ldf_process[col] = df_ldf_process[col].apply(fmt_datetime_text)

df_ldf_process["ทะเบียนหัว"] = df_ldf_process["ทะเบียนหัว"].astype(str).str.strip()
vehicle["ทะเบียน"] = vehicle["ทะเบียน"].astype(str).str.strip()

df_merged = df_ldf_process.merge(
    vehicle[["ทะเบียน", "เลขรถ", "ประเภทยานพาหนะ"]],
    how="left",
    left_on="ทะเบียนหัว",
    right_on="ทะเบียน",
)
df_merged["ประเภทยานพาหนะ"] = df_merged["ประเภทยานพาหนะ"].astype(str).str.strip()
df_merged["บริการ"] = df_merged["ประเภทยานพาหนะ"].map({
    "Mixer 10 ล้อ": "M005",
    "Mixer 6 ล้อ": "M031",
}).fillna(df_merged["บริการ"])
df_merged.loc[df_merged["ประเภทยานพาหนะ"] == "Mixer 6 ล้อ", "นน ปลายทาง"] = 1
df_merged = df_merged.drop(columns=["ทะเบียน", "เลขรถ", "ประเภทยานพาหนะ"], errors="ignore")
df_ldf_process = df_merged

df_ldf_process.to_excel(output_file, index=False)
print(f"File saved as: {filename_all}")

# Build NEWSHIPTO
check_ship_to = df_ldf_process[["LDT", "Ship To"]].merge(df_ship_to_atms, left_on="Ship To", right_on="รหัส", how="left")
check_ship_to = check_ship_to.drop_duplicates(subset=["LDT"], keep="first")
check_ship_to["is_NaN_ใช้งานตั้งแต่"] = check_ship_to["ใช้งานตั้งแต่"].isna().map({True: "Yes", False: "No"})

create_ship_to = check_ship_to[check_ship_to["is_NaN_ใช้งานตั้งแต่"] == "Yes"][["LDT", "Ship To"]]
create_ship_to = create_ship_to.merge(df_ldf_process[["LDT", "เส้นทาง", "แพล้นท์"]], on="LDT", how="left")
create_ship_to = create_ship_to.merge(df_zone[["Plant", "โซน", "สภาพจราจร", "จังหวัด", "อำเภอ"]], left_on="แพล้นท์", right_on="Plant", how="left")
create_ship_to = create_ship_to.merge(raw_ldt[["LDT", "SiteName", "PlantToSiteDistance", "SiteToPlantDistance"]], on="LDT", how="left")
create_ship_to["ประเทศ"] = "ไทย"
create_ship_to = create_ship_to.rename(columns={
    "PlantToSiteDistance": "ทางเรียบหนัก",
    "SiteToPlantDistance": "ทางเรียบเบา",
    "สภาพจราจร": "สภาพการจราจร",
    "SiteName": "ชื่อไซร้งาน",
})
s = create_ship_to["Ship To"].astype("string").fillna("").str.strip()
create_ship_to["เดินทางจาก"] = s.str[:4]
create_ship_to["เดินทางไป"] = s.str[4:].str.strip()

desired_columns = [
    "LDT", "Ship To", "เส้นทาง", "ชื่อไซร้งาน", "ลูกค้า", "โซน", "สภาพการจราจร", "ประเทศ",
    "จังหวัด", "อำเภอ", "ที่อยู่", "ระยะทาง", "ตีเปล่า", "ทางเรียบหนัก", "ขึ้นเขาหนัก",
    "ขึ้นเขาสูงหนัก", "ทางเรียบเบา", "ขึ้นเขาเบา", "ขึ้นเขาสูงเบา", "สำรอง", "เดินทางจาก", "เดินทางไป",
]
for col in desired_columns:
    if col not in create_ship_to.columns:
        create_ship_to[col] = None
create_ship_to = create_ship_to[desired_columns]

create_ship_to["ลูกค้า"] = create_ship_to.apply(
    lambda row: 1019 if str(row["Ship To"]).startswith("SU") else 1018 if str(row["Ship To"]).startswith("SX") else row["ลูกค้า"],
    axis=1,
)
for col in ["ระยะทาง", "ตีเปล่า", "ขึ้นเขาหนัก", "ขึ้นเขาสูงหนัก", "ขึ้นเขาเบา", "ขึ้นเขาสูงเบา"]:
    create_ship_to[col] = 0
create_ship_to["ที่อยู่"] = "-"
create_ship_to["สำรอง"] = 0

first_day_of_month = datetime.today().replace(day=1).strftime("1/%m/%Y")
first_day_next_year = datetime.today().replace(day=1, year=datetime.today().year + 1).strftime("1/%m/%Y")
create_ship_to["เริ่มใช้งานตั้งแต่"] = first_day_of_month
create_ship_to["ใช้งานถึงวันที่"] = first_day_next_year

df = create_ship_to.drop(columns=["LDT"], errors="ignore")
df_grouped = df.groupby("Ship To").agg({
    "ทางเรียบหนัก": lambda x: x[x != 0].mean(),
    "ทางเรียบเบา": lambda x: x[x != 0].mean(),
}).reset_index()
df_grouped.iloc[:, 1:] = np.ceil(df_grouped.iloc[:, 1:])
df_grouped = df_grouped.fillna(0)
df.set_index("Ship To", inplace=True)
df_grouped.set_index("Ship To", inplace=True)
df.update(df_grouped)
df.reset_index(inplace=True)
df = df.drop_duplicates(subset=["Ship To"])

df["รหัสอ้างอิงลูกค้า"] = ""
df["ดึงระยะทางจาก Map API"] = "N"

for col in ["เริ่มใช้งานตั้งแต่", "ใช้งานถึงวันที่"]:
    if col in df.columns:
        df[col] = df[col].apply(fmt_date_text)

df = df.rename(columns={"เส้นทาง": "รหัสย่อย"})
df["แพล้นท์"] = df["เดินทางจาก"]
df = df[[
    "Ship To", "รหัสย่อย", "รหัสอ้างอิงลูกค้า", "ชื่อไซร้งาน", "ลูกค้า", "แพล้นท์",
    "โซน", "สภาพการจราจร", "เดินทางจาก", "เดินทางไป", "ที่อยู่", "ระยะทาง", "ตีเปล่า",
    "ทางเรียบหนัก", "ขึ้นเขาหนัก", "ขึ้นเขาสูงหนัก", "ทางเรียบเบา", "ขึ้นเขาเบา",
    "ขึ้นเขาสูงเบา", "สำรอง", "ใช้งานถึงวันที่", "เริ่มใช้งานตั้งแต่", "ดึงระยะทางจาก Map API",
]]

new_ship_to_file = str(BASE_DIR / "output" / f"NEWSHIPTO_{yesterday}.xlsx")
df.to_excel(new_ship_to_file, index=False)
print(f"File saved as: NEWSHIPTO_{yesterday}.xlsx")
