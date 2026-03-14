import os
import yaml
import shutil
from pathlib import Path

# ==========================
# CONFIG
# ==========================

ROBOFLOW_DATA_YAML = "dataset/Fire-Smoke-Detection-Yolov11.v2-smoke-fire-detection-roboflow-3.yolov8/data.yaml"
OUTPUT_DIR = "fire_smoke_clean"

# ==========================
# LOAD ROBOFLOW DATA
# ==========================

with open(ROBOFLOW_DATA_YAML, "r") as f:
    data = yaml.safe_load(f)

def normalize(name):
    return name.strip().lower().replace(" ", "_")

names = [normalize(n) for n in data["names"]]

print("Detected Classes:", names)

# ==========================
# CLEAN OUTPUT FOLDER
# ==========================

if os.path.exists(OUTPUT_DIR):
    shutil.rmtree(OUTPUT_DIR)

# ==========================
# DETERMINE SPLIT KEYS
# ==========================

split_mapping = {
    "train": "train",
    "val": "val" if "val" in data else "valid",
    "test": "test" if "test" in data else None
}

# ==========================
# COPY FILES
# ==========================

for target_split, yaml_key in split_mapping.items():

    if yaml_key is None:
        continue

    if yaml_key not in data:
        continue

    img_src = Path(data[yaml_key]).resolve()
    lbl_src = img_src.parent / "labels"

    img_dst = Path(OUTPUT_DIR) / target_split / "images"
    lbl_dst = Path(OUTPUT_DIR) / target_split / "labels"

    img_dst.mkdir(parents=True, exist_ok=True)
    lbl_dst.mkdir(parents=True, exist_ok=True)

    print(f"Processing {target_split}...")

    for img in img_src.glob("*"):
        shutil.copy(img, img_dst)

    for lbl in lbl_src.glob("*.txt"):
        shutil.copy(lbl, lbl_dst)

# ==========================
# CREATE CLEAN YAML
# ==========================

final_yaml = {
    "path": OUTPUT_DIR,
    "train": "train/images",
    "val": "val/images",
    "nc": 2,
    "names": {
        0: "fire",
        1: "smoke"
    }
}

with open("fire_smoke.yaml", "w") as f:
    yaml.dump(final_yaml, f)

print("\n✅ Fire & Smoke dataset prepared successfully.")
print("Use fire_smoke.yaml for training.")