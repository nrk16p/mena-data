import pandas as pd
from pathlib import Path

BASE_DIR = Path(__file__).parent


def load_data(ldf_path, driver_path, zone_path):
    df_ldf = pd.read_excel(ldf_path)
    df_driver = pd.read_excel(driver_path)
    df_zone = pd.read_excel(zone_path)
    return df_ldf, df_driver, df_zone


def preprocess_driver_data(df_driver):
    df_driver["ทะเบียน"] = df_driver["ทะเบียน"].str.replace("สบ.", "", regex=True)
    return df_driver[["ทะเบียน", "สถานะ", "รหัส.1", "ชื่อ.1"]]


def merge_data(df_ldf, df_driver, df_zone):
    df_ldf = df_ldf.merge(df_driver, left_on="ทะเบียนหัว", right_on="ทะเบียน", how="left")
    df_ldf = df_ldf.rename(columns={"รหัส.1": "รหัส พจส 1"})
    df_ldf["ประเภทรถร่วม"] = df_ldf["สถานะ"].apply(lambda x: "OT-MT02" if x == "พจร" else "OT-MT01")
    df_ldf = df_ldf.assign(
        บริการ="M005",
        **{col: "" for col in ["Base Plant", "เลขที่ตั๋วเพิ่ม 2", "เลขที่ตั๋วเพิ่ม 3", "เลขที่ตั๋วเพิ่ม 4", "หมายเหตุ", "วิ่งแทนรถทะเบียน"]},
    )
    df_ldf["ทะเบียนหัว"] = "สบ." + df_ldf["ทะเบียนหัว"]
    df_ldf["วันที่"] = pd.to_datetime(df_ldf["วันที่"], errors="coerce").dt.strftime("%-d/%-m/%Y")
    df_ldf["วันที่ครบกำหนด"] = df_ldf["วันที่"]

    date_cols = ["วันเวลาอ้างอิง 1", "วันเวลาอ้างอิง 2", "วันเวลาอ้างอิง 3",
                 "วันเวลาอ้างอิง 4", "วันเวลาลงสินค้า", "วันเวลาปิด LDT", "เวลาออกเดินทาง"]
    for col in date_cols:
        df_ldf[col] = pd.to_datetime(df_ldf[col], errors="coerce").dt.strftime("%-d/%-m/%Y %H:%M")

    df_ldf = df_ldf.merge(df_zone, left_on="แพล้นท์", right_on="Plant", how="left")
    df_ldf = df_ldf.drop(columns=["Plant", "รายละเอียด"], errors="ignore")
    return df_ldf


def reorder_columns(df_ldf):
    required_columns = [
        "สาขา", "บริการ", "LDT", "Type", "ผลิตภัณฑ์", "Ship To", "เส้นทาง",
        "dropoffs", "ประเภทการวิ่ง", "ประเภทการขนส่งขากลับ", "ประเภทการขนส่ง",
        "Service Parameter A", "Service Parameter B", "แพล้นท์", "Base Plant",
        "วันที่", "วันที่ครบกำหนด", "เลขที่ตั๋วเพิ่ม 1", "เลขที่ตั๋วเพิ่ม 2",
        "เลขที่ตั๋วเพิ่ม 3", "เลขที่ตั๋วเพิ่ม 4", "หมายเหตุ", "ประเภทรถร่วม", "ผู้จัดส่งร่วม",
        "รหัส พจส 1", "รหัส พจส 2", "ทะเบียนหัว", "ทะเบียนหาง", "เวลาออกเดินทาง",
        "นน ต้นทาง", "นน ปลายทาง", "วันเวลาอ้างอิง 1", "วันเวลาอ้างอิง 2",
        "วันเวลาอ้างอิง 3", "วันเวลาอ้างอิง 4", "วันเวลาลงสินค้า", "วันเวลาปิด LDT",
        "วิ่งแทนรถทะเบียน",
    ]
    for col in required_columns:
        if col not in df_ldf.columns:
            df_ldf[col] = ""
    return df_ldf[required_columns]


def main():
    df_ldf, df_driver, df_zone = load_data(
        str(BASE_DIR / "data" / "ldt" / "df_ldt.xlsx"),
        str(BASE_DIR / "data" / "driver" / "driver.xlsx"),
        str(BASE_DIR / "data" / "zone" / "df_zone.xlsx"),
    )
    df_driver = preprocess_driver_data(df_driver)
    df_ldf = merge_data(df_ldf, df_driver, df_zone)
    df_ldf = reorder_columns(df_ldf)
    df_ldf = df_ldf[~df_ldf["LDT"].duplicated(keep="last")]
    df_ldf = df_ldf[df_ldf["แพล้นท์"] != "317"]
    df_ldf.to_excel(str(BASE_DIR / "data" / "processed_ldf" / "processed_ldf.xlsx"), index=False)
    print("Processing complete. Data saved to processed_ldf.xlsx.")


if __name__ == "__main__":
    main()
