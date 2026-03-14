# detector.py

import cv2
import time
from ultralytics import YOLO


class Detector:
    def __init__(
        self,
        conf_threshold=0.3,
        class_conf_thresholds=None,
        alert_frames_required=3,
        alert_classes=None,
        model_path=None,
        track_timeout=2.0,
        alert_cooldown=5.0,
        min_box_area_ratio=0.0005  # filter tiny detections
    ):

        if model_path is None:
            raise ValueError("model_path must be specified")

        self.model = YOLO(model_path)
        self.model.to("cpu")

        self.global_conf_threshold = conf_threshold
        self.class_conf_thresholds = (
            {k.lower(): v for k, v in class_conf_thresholds.items()}
            if class_conf_thresholds else {}
        )

        self.alert_frames_required = alert_frames_required
        self.track_timeout = track_timeout
        self.alert_cooldown = alert_cooldown
        self.min_box_area_ratio = min_box_area_ratio

        if alert_classes is None:
            alert_classes = ["fire", "smoke"]

        self.alert_classes = [c.lower() for c in alert_classes]

        self.track_memory = {}

        print(f"[Detector] Alert classes: {self.alert_classes}")
        print(f"[Detector] Class thresholds: {self.class_conf_thresholds}")

    # ===============================
    def resize_with_ratio(self, image, target_width):
        h, w = image.shape[:2]
        scale = target_width / w
        new_h = int(h * scale)
        return cv2.resize(image, (target_width, new_h))

    # ===============================
    def detect(self, frame, target_width=1280):

        now = time.time()

        detect_frame = self.resize_with_ratio(frame, target_width)

        results = self.model.track(
            detect_frame,
            imgsz=target_width,
            conf=self.global_conf_threshold,
            device="cpu",
            persist=True,
            tracker="bytetrack.yaml",
            verbose=False
        )

        annotated_small = results[0].plot()
        annotated = cv2.resize(
            annotated_small,
            (frame.shape[1], frame.shape[0])
        )

        alerts = []

        frame_area = frame.shape[0] * frame.shape[1]

        for box in results[0].boxes:

            if box.id is None:
                continue

            track_id = int(box.id[0])
            cls_id = int(box.cls[0])
            conf = float(box.conf[0])
            label = self.model.names[cls_id].lower()

            if label not in self.alert_classes:
                continue

            # 🔥 Class specific threshold
            class_threshold = self.class_conf_thresholds.get(
                label,
                self.global_conf_threshold
            )

            if conf < class_threshold:
                continue

            # 🧹 Filter very small boxes (removes noise)
            x1, y1, x2, y2 = box.xyxy[0]
            box_area = (x2 - x1) * (y2 - y1)

            if (box_area / frame_area) < self.min_box_area_ratio:
                continue

            if track_id not in self.track_memory:
                self.track_memory[track_id] = {
                    "frames": 0,
                    "avg_conf": conf,
                    "label": label,
                    "last_seen": now,
                    "confirmed": False,
                    "last_alert_time": 0
                }

            memory = self.track_memory[track_id]

            # 🔥 Stronger smoothing (less flicker)
            memory["avg_conf"] = 0.9 * memory["avg_conf"] + 0.1 * conf
            memory["frames"] += 1
            memory["last_seen"] = now

            # Require sustained detection
            if (
                not memory["confirmed"]
                and memory["frames"] >= self.alert_frames_required
            ):
                memory["confirmed"] = True

            if memory["confirmed"]:
                if now - memory["last_alert_time"] > self.alert_cooldown:

                    alerts.append((label, memory["avg_conf"]))

                    print(
                        f"[ALERT] {label.upper()} | "
                        f"Track {track_id} | "
                        f"Conf {memory['avg_conf']:.2f}"
                    )

                    memory["last_alert_time"] = now

        # Cleanup dead tracks
        for tid in list(self.track_memory.keys()):
            if now - self.track_memory[tid]["last_seen"] > self.track_timeout:
                del self.track_memory[tid]

        return alerts, annotated