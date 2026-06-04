import pymysql
import pandas as pd
import logging
from pathlib import Path

logging.basicConfig(
    filename="app.log",
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)

BASE_DIR = Path(__file__).parent


def get_db_connection():
    try:
        conn = pymysql.connect(
            host="157.230.39.131",
            user="plug",
            password="Mena!001",
            database="mn-terminus-api",
            port=3306,
            cursorclass=pymysql.cursors.DictCursor,
        )
        logging.info("Database connection established successfully.")
        return conn
    except pymysql.MySQLError as e:
        logging.error(f"MySQL Error: {e}")
        return None


def fetch_data():
    conn = get_db_connection()
    if conn is None:
        return pd.DataFrame()
    query = """
    SELECT * FROM rmcconcretetrip
    WHERE DATE(TicketCreateAt) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
    """
    try:
        with conn.cursor() as cursor:
            cursor.execute(query)
            results = cursor.fetchall()
        logging.info("Data fetched successfully from database.")
        return pd.DataFrame(results)
    except Exception as e:
        logging.error(f"Error fetching data: {e}")
        return pd.DataFrame()
    finally:
        conn.close()


def process_data(df):
    if df.empty:
        logging.warning("No data to process.")
        return df

    df = df.rename(columns={
        "TicketNo": "LDT",
        "PlantCode": "แพล้นท์",
        "TicketCreateAt": "วันที่",
        "TruckPlateNo": "ทะเบียนหัว",
    })
    df = df[df["ReasonCode"] == ""]
    df.to_excel(str(BASE_DIR / "data" / "raw_ldt" / "raw_ldt.xlsx"))
    df["Ship To"] = df["แพล้นท์"] + df["SiteName"].str[:8]
    df["เลขที่ตั๋วเพิ่ม 2"] = "2100050"
    df["เลขที่ตั๋วเพิ่ม 4"] = ""
    df["สาขา"] = "LB"
    df["ผลิตภัณฑ์"] = "คอนกรีตผสมเสร็จ"
    df["นน ต้นทาง"] = df["Quantity"]
    df["นน ปลายทาง"] = df["Quantity"].apply(lambda x: 4 if x < 4 else x)
    df["วันที่ครบกำหนด"] = df["วันที่"]
    df["วันเวลาอ้างอิง 1"] = df.apply(lambda row: row["LoadAt"] if row["LoadAt"] else row["วันที่"], axis=1)
    df["วันเวลาอ้างอิง 2"] = df["วันเวลาอ้างอิง 1"]
    df["วันเวลาอ้างอิง 3"] = df["วันเวลาอ้างอิง 1"]
    df["วันเวลาอ้างอิง 4"] = df["วันเวลาอ้างอิง 1"]
    df["เวลาออกเดินทาง"] = df["วันเวลาอ้างอิง 1"]
    df["Type"] = "single drop"
    df["ประเภทการวิ่ง"] = "legacy"
    df["ประเภทการขนส่งขากลับ"] = ""
    df["ประเภทการขนส่ง"] = "heavy"
    df["Service Parameter A"] = ""
    df["Service Parameter B"] = ""
    df["dropoffs"] = ""
    df["วันเวลาลงสินค้า"] = df.apply(lambda row: row["PlantMoveOutAt"] if row["PlantMoveOutAt"] else row["วันที่"], axis=1)
    df["วันเวลาปิด LDT"] = df.apply(lambda row: row["ArriveToPlantAt"] if row["ArriveToPlantAt"] else row["วันที่"], axis=1)
    df = df[df["แพล้นท์"].str.startswith(("SU", "SX"))]

    selected_columns = [
        "LDT", "แพล้นท์", "วันที่", "ทะเบียนหัว", "Ship To",
        "เลขที่ตั๋วเพิ่ม 2", "เลขที่ตั๋วเพิ่ม 4", "สาขา", "ผลิตภัณฑ์",
        "นน ปลายทาง", "นน ต้นทาง", "วันเวลาลงสินค้า", "วันเวลาปิด LDT",
        "วันเวลาอ้างอิง 1", "วันเวลาอ้างอิง 2", "วันเวลาอ้างอิง 3", "วันเวลาอ้างอิง 4",
        "เวลาออกเดินทาง", "วันที่ครบกำหนด", "Type", "ประเภทการวิ่ง",
        "ประเภทการขนส่งขากลับ", "ประเภทการขนส่ง", "Service Parameter A",
        "Service Parameter B", "dropoffs",
    ]
    logging.info("Data processing completed successfully.")
    return df[selected_columns]


def save_to_excel(df, filename=None):
    if filename is None:
        filename = str(BASE_DIR / "data" / "ldt" / "df_ldt.xlsx")
    if not df.empty:
        df.to_excel(filename, index=False)
        logging.info(f"Data saved to {filename}")
    else:
        logging.warning("No data to save.")


date_cols = [
    "วันที่", "วันที่ครบกำหนด", "เวลาออกเดินทาง",
    "วันเวลาอ้างอิง 1", "วันเวลาอ้างอิง 2", "วันเวลาอ้างอิง 3", "วันเวลาอ้างอิง 4",
    "วันเวลาลงสินค้า", "วันเวลาปิด LDT",
]


def format_datetime_keep_time(val):
    if pd.isna(val):
        return val
    dt = pd.to_datetime(val, dayfirst=True, errors="coerce")
    if pd.isna(dt):
        return val
    if dt.time() == pd.Timestamp.min.time():
        return dt.strftime("%d/%m/%Y")
    return dt.strftime("%d/%m/%Y %H:%M")


if __name__ == "__main__":
    logging.info("task_1 started.")
    raw_data = fetch_data()
    processed_data = process_data(raw_data)
    for col in date_cols:
        if col in processed_data.columns:
            processed_data[col] = processed_data[col].apply(format_datetime_keep_time)
    save_to_excel(processed_data)
    logging.info("task_1 completed.")
    print(processed_data.head())
