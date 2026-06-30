import subprocess
import logging
import sys
from pathlib import Path

logging.basicConfig(
    filename="app.log",
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)

TASKS = ["task_1.py", "task_2.py", "task_3.py", "task_4.py", "task_5.py", "task_6.py", "task_mongo.py"]

project_root = Path(__file__).parent


def run_task(script_name: str):
    logging.info(f"Starting {script_name}")
    print(f"\nRunning {script_name} ...")
    task_path = project_root / script_name
    if not task_path.exists():
        logging.warning(f"{script_name} not found, skipping.")
        print(f"{script_name} not found, skipping.")
        return
    try:
        result = subprocess.run(
            [sys.executable, str(task_path)],
            capture_output=True,
            text=True,
            check=True,
            cwd=str(project_root),
        )
        logging.info(f"{script_name} completed.\n{result.stdout}")
        print(f"{script_name} finished successfully!")
    except subprocess.CalledProcessError as e:
        logging.error(f"Error in {script_name}:\n{e.stderr}")
        print(f"Error in {script_name}:\n{e.stderr}")


if __name__ == "__main__":
    print("LD Pipeline Runner")
    for task in TASKS:
        run_task(task)
    print("\nAll tasks finished.")
    logging.info("All tasks completed.")
