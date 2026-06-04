import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime, timedelta

BASE_DIR = Path(__file__).parent

df_ldf = pd.read_excel(str(BASE_DIR / "data" / "ldt" / "df_ldt.xlsx"))
df_zone = pd.read_excel(str(BASE_DIR / "data" / "zone" / "df_zone.xlsx"))
df_ldf_process = pd.read_excel(str(BASE_DIR / "data" / "processed_ldf" / "processed_ldf.xlsx"))
df_ship_to_atms = pd.read_excel(str(BASE_DIR / "data" / "ship_to" / "ship_to.xlsx"))
raw_ldt = pd.read_excel(str(BASE_DIR / "data" / "raw_ldt" / "raw_ldt.xlsx"))

yesterday = (datetime.today() - timedelta(days=1)).strftime("%d%m%Y")
filename_all = f"LDTSCCO_{yesterday}(มี+ไม่มีshipto).xlsx"
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


date_only_cols = ["วันที่","วันที่ครบกำหนด"]
datetime_cols_text = ["เวลาออกเดินทาง","วันเวลาอ้างอิง 1","วันเวลาอ้างอิง 2",
                      "วันเวลาอ้างอิง 3","วันเวลาอ้างอิง 4","วันเวลาลงสินค้า","วันเวลาปิด LDT"]

for col in date_only_cols:
    if col in df_ldf_process.columns:
        df_ldf_process[col] = df_ldf_process[col].apply(fmt_date_text)
for col in datetime_cols_text:
    if col in df_ldf_process.columns:
        df_ldf_process[col] = df_ldf_process[col].apply(fmt_datetime_text)

df_ldf_process.to_excel(output_file, index=False)
print(f"File saved: {filename_all}")

check_ship_to = df_ldf_process[["LDT","Ship To"]].merge(df_ship_to_atms, left_on="Ship To", right_on="รหัส", how="left")
check_ship_to = check_ship_to.drop_duplicates(subset=["LDT"], keep="first")
check_ship_to["is_NaN_ใช้งานตั้งแต่"] = check_ship_to["ใช้งานตั้งแต่"].isna().map({True: "Yes", False: "No"})

create_ship_to = check_ship_to[check_ship_to["is_NaN_ใช้งานตั้งแต่"] == "Yes"][["LDT","Ship To"]]
create_ship_to = create_ship_to.merge(df_ldf_process[["LDT","เส้นทาง","แพล้นท์","บริการ"]], on="LDT", how="left")
create_ship_to = create_ship_to.merge(
    df_zone[["Plant","โซน","สภาพการจราจร_ML","สภาพการจราจร_MS","จังหวัด","อำเภอ"]],
    left_on="แพล้นท์", right_on="Plant", how="left",
)
create_ship_to = create_ship_to.merge(
    raw_ldt[["LDT","SiteName","PlantToSiteDistance","SiteToPlantDistance"]], on="LDT", how="left"
)
create_ship_to["ประเทศ"] = "ไทย"
create_ship_to = create_ship_to.rename(columns={
    "PlantToSiteDistance": "ทางเรียบหนัก", "SiteToPlantDistance": "ทางเรียบเบา", "SiteName": "ชื่อไซร้งาน",
})
create_ship_to["สภาพการจราจร"] = np.where(
    create_ship_to["บริการ"] == "M002", create_ship_to["สภาพการจราจร_MS"],
    np.where(create_ship_to["บริการ"] == "M001", create_ship_to["สภาพการจราจร_ML"], None),
)
create_ship_to["เส้นทาง"] = None
create_ship_to.loc[create_ship_to["บริการ"] == "M001", "เส้นทาง"] = "10 ล้อ"
create_ship_to.loc[create_ship_to["บริการ"] == "M002", "เส้นทาง"] = "6 ล้อ"
s = create_ship_to["Ship To"].astype("string").fillna("").str.strip()
create_ship_to["เดินทางจาก"] = s.str[:4]
create_ship_to["เดินทางไป"] = s.str[4:].str.strip()

desired_columns = ["LDT","Ship To","เส้นทาง","ชื่อไซร้งาน","ลูกค้า","โซน","สภาพการจราจร","ประเทศ",
                   "จังหวัด","อำเภอ","ที่อยู่","ระยะทาง","ตีเปล่า","ทางเรียบหนัก","ขึ้นเขาหนัก",
                   "ขึ้นเขาสูงหนัก","ทางเรียบเบา","ขึ้นเขาเบา","ขึ้นเขาสูงเบา","สำรอง","เดินทางจาก","เดินทางไป"]
for col in desired_columns:
    if col not in create_ship_to.columns:
        create_ship_to[col] = None
create_ship_to = create_ship_to[desired_columns]
create_ship_to["ลูกค้า"] = "1000"
for col in ["ระยะทาง","ตีเปล่า","ขึ้นเขาหนัก","ขึ้นเขาสูงหนัก","ขึ้นเขาเบา","ขึ้นเขาสูงเบา"]:
    create_ship_to[col] = 0
create_ship_to["ที่อยู่"] = "-"
create_ship_to["สำรอง"] = 0

first_day = datetime.today().replace(day=1).strftime("1/%m/%Y")
first_day_next = datetime.today().replace(day=1, year=datetime.today().year + 1).strftime("1/%m/%Y")
create_ship_to["เริ่มใช้งานตั้งแต่"] = first_day
create_ship_to["ใช้งานถึงวันที่"] = first_day_next

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
for col in ["เริ่มใช้งานตั้งแต่","ใช้งานถึงวันที่"]:
    if col in df.columns:
        df[col] = df[col].apply(fmt_date_text)

df = df.rename(columns={"เส้นทาง": "รหัสย่อย"})
df["แพล้นท์"] = df["เดินทางจาก"]
df = df[["Ship To","รหัสย่อย","รหัสอ้างอิงลูกค้า","ชื่อไซร้งาน","ลูกค้า","แพล้นท์","โซน","สภาพการจราจร",
         "เดินทางจาก","เดินทางไป","ที่อยู่","ระยะทาง","ตีเปล่า","ทางเรียบหนัก","ขึ้นเขาหนัก",
         "ขึ้นเขาสูงหนัก","ทางเรียบเบา","ขึ้นเขาเบา","ขึ้นเขาสูงเบา","สำรอง",
         "ใช้งานถึงวันที่","เริ่มใช้งานตั้งแต่","ดึงระยะทางจาก Map API"]]
df.to_excel(str(BASE_DIR / "output" / f"NEWSHIPTOSCCO_{yesterday}.xlsx"), index=False)
print(f"File saved as: NEWSHIPTOSCCO_{yesterday}.xlsx")
