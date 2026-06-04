import os
import re
from datetime import datetime, timedelta
from pathlib import Path

BASE_DIR = Path(__file__).parent
DIRECTORY = str(BASE_DIR / "output")

threshold_date = datetime.now() - timedelta(days=4)


def check_and_delete_old_data(directory):
    old_data_files = []
    total_files = 0
    for file in os.listdir(directory):
        if file.endswith(".xlsx") or file.endswith(".xls"):
            total_files += 1
            match = re.search(r"_(\d{8})", file)
            if match:
                file_date_str = match.group(1)
                try:
                    file_date = datetime.strptime(file_date_str, "%d%m%Y")
                    if file_date < threshold_date:
                        old_data_files.append(file)
                        os.remove(os.path.join(directory, file))
                        print(f"Deleted: {file}")
                except ValueError:
                    print(f"Skipping file {file}, unable to parse date.")
            else:
                print(f"Skipping file {file}, no valid date found.")
    return old_data_files, total_files


if __name__ == "__main__":
    old_files, total_files = check_and_delete_old_data(DIRECTORY)
    print("Total Excel files found:", total_files)
    print("Files deleted:", old_files)
