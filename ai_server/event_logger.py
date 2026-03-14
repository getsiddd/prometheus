# event_logger.py 
import os
import json
from datetime import datetime

class EventLogger:
    def __init__(self, base_dir="events"):
        self.base_dir = base_dir
        os.makedirs(base_dir, exist_ok=True)

    def log_event(self, camera_id, label, confidence, image_path=None):
        event = {
            "timestamp": datetime.utcnow().isoformat(),
            "camera_id": camera_id,
            "event_type": label,
            "confidence": float(confidence),
            "image": image_path
        }

        filename = os.path.join(
            self.base_dir,
            f"{camera_id}_{datetime.utcnow().date()}.log"
        )

        with open(filename, "a") as f:
            f.write(json.dumps(event) + "\n")

        print(f"[EVENT] {event}")
