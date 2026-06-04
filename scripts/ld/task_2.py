import logging
import os
import glob
import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from datetime import datetime, timedelta
from pathlib import Path
import pandas as pd

BASE_DIR = Path(__file__).parent

DOWNLOAD_DIR = str(BASE_DIR / "data" / "vehicle_driver_data" / "data")
USERNAME = "narongkorn.a"
PASSWORD = "Mnt@0108"
BASE_URL = "https://www.mena-atms.com/"

logging.basicConfig(
    filename="automation_log.log",
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)


def clear_download_directory(download_dir):
    files = glob.glob(os.path.join(download_dir, "*"))
    for file in files:
        try:
            os.remove(file)
            logging.info(f"Deleted: {file}")
        except Exception as e:
            logging.error(f"Error deleting {file}: {e}")
    logging.info("All files deleted successfully.")


def setup_driver(download_dir):
    chrome_options = Options()
    prefs = {"download.default_directory": download_dir}
    chrome_options.add_experimental_option("prefs", prefs)
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)
    logging.info("WebDriver successfully configured.")
    return driver


def login_to_site(driver, base_url, username, password):
    try:
        driver.get(base_url)
        driver.find_element(By.ID, "username").send_keys(username)
        driver.find_element(By.ID, "password").send_keys(password)
        driver.find_element(By.ID, "submit").click()
        logging.info("Successfully logged in.")
    except Exception as e:
        logging.error(f"Login failed: {e}")


def download_report(driver, base_url):
    try:
        target_date = (datetime.today() - timedelta(days=1)).strftime("%d/%m/%Y")
        report_url = f"{base_url}report/excel/index.excel/type/vehicle.daily.transaction?t_date={target_date}&fleet_id=1&fleet_group_id=1"
        driver.get(report_url)
        driver.find_element(By.ID, "submit").click()
        time.sleep(5)
        logging.info(f"Report downloaded for date {target_date}.")
    except Exception as e:
        logging.error(f"Error downloading report: {e}")


def process_downloaded_file(download_dir):
    try:
        xlsx_files = [f for f in os.listdir(download_dir) if f.endswith(".xlsx")]
        if not xlsx_files:
            logging.warning("No .xlsx files found in the directory.")
            return None
        file_path = os.path.join(download_dir, xlsx_files[0])
        df = pd.read_excel(file_path, header=2)
        logging.info(f"Successfully read the Excel file: {file_path}")
        return df[["เบอร์รถ", "ทะเบียน", "สถานะ", "คนขับ", "รหัส.1", "ชื่อ.1"]]
    except Exception as e:
        logging.error(f"Error reading or processing the Excel file: {e}")
        return None


if __name__ == "__main__":
    logging.info("task_2 started.")
    clear_download_directory(DOWNLOAD_DIR)
    driver = setup_driver(DOWNLOAD_DIR)
    try:
        login_to_site(driver, BASE_URL, USERNAME, PASSWORD)
        download_report(driver, BASE_URL)
        data_frame = process_downloaded_file(DOWNLOAD_DIR)
        if data_frame is not None:
            data_frame.to_excel(str(BASE_DIR / "data" / "driver" / "driver.xlsx"), index=False)
            logging.info("Data saved to driver.xlsx.")
        else:
            logging.warning("No data frame to save.")
    finally:
        driver.quit()
        logging.info("WebDriver closed.")
    logging.info("task_2 completed.")
