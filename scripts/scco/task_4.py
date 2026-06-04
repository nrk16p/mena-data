import logging
import os
import glob
import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from pathlib import Path
import pandas as pd

BASE_DIR = Path(__file__).parent
DOWNLOAD_DIR = str(BASE_DIR / "data" / "get_report_ship_to" / "data")
USERNAME = "narongkorn.a"
PASSWORD = "Mnt@0108"
BASE_URL = "https://www.mena-atms.com/"

logging.basicConfig(filename="automation_log.log", level=logging.INFO,
                    format="%(asctime)s - %(levelname)s - %(message)s", datefmt="%Y-%m-%d %H:%M:%S")


def clear_download_directory(download_dir):
    for file in glob.glob(os.path.join(download_dir, "*")):
        try:
            os.remove(file)
        except Exception as e:
            logging.error(f"Error deleting {file}: {e}")


def setup_driver(download_dir):
    chrome_options = Options()
    chrome_options.add_experimental_option("prefs", {"download.default_directory": download_dir})
    return webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)


def login_to_site(driver, base_url, username, password):
    try:
        driver.get(base_url)
        driver.find_element(By.ID, "username").send_keys(username)
        driver.find_element(By.ID, "password").send_keys(password)
        driver.find_element(By.ID, "submit").click()
        time.sleep(3)
    except Exception as e:
        logging.error(f"Login failed: {e}")


def download_report(driver, base_url, client):
    try:
        driver.get(f"{base_url}/report/excel/index.excel/type/ship.to?customer_id={client}&status=A")
        driver.find_element(By.ID, "submit").click()
        time.sleep(700)
    except Exception as e:
        logging.error(f"Error downloading report: {e}")


def process_downloaded_file(download_dir):
    try:
        xlsx_files = [f for f in os.listdir(download_dir) if f.endswith(".xlsx")]
        if not xlsx_files:
            return None
        dataframes = [pd.read_excel(os.path.join(download_dir, f), header=1) for f in xlsx_files]
        return pd.concat(dataframes, ignore_index=True) if len(dataframes) > 1 else dataframes[0]
    except Exception as e:
        logging.error(f"Error reading file: {e}")
        return None


if __name__ == "__main__":
    clear_download_directory(DOWNLOAD_DIR)
    driver = setup_driver(DOWNLOAD_DIR)
    try:
        login_to_site(driver, BASE_URL, USERNAME, PASSWORD)
        download_report(driver, BASE_URL, 1)
        data_frame = process_downloaded_file(DOWNLOAD_DIR)
        if data_frame is not None:
            data_frame.to_excel(str(BASE_DIR / "data" / "ship_to" / "ship_to.xlsx"), index=False)
    finally:
        driver.quit()
