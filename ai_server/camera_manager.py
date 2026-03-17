# camera_manager.py

import threading
import time
import struct
from datetime import datetime
from multiprocessing import shared_memory
import cv2
import numpy as np
import zmq

from detector import Detector
from ffmpeg_stream import FFmpegStream


# ===============================
# CONFIG
# ===============================
WIDTH = 1920
HEIGHT = 1080
FPS = 15
SLOTS = 20
HEADER_SIZE = 32
FRAME_SIZE = WIDTH * HEIGHT * 3 // 2

VOICE_TEMPLATE = "Warning. {label} detected on {camera}. Confidence {confidence:.0f} percent."


class CameraWorker(threading.Thread):

    def __init__(self, camera_config, system_config, model_path):
        super().__init__(daemon=True)

        self.camera = camera_config
        self.system = system_config

        # ===============================
        # DETECTOR
        # ===============================
        self.detector = Detector(
            conf_threshold=system_config.get("confidence_threshold", 0.3),
            class_conf_thresholds=system_config.get("class_confidence_thresholds", {}),
            alert_frames_required=system_config.get("alert_frames_required", 5),
            alert_classes=system_config.get("alert_classes", ["fire", "smoke"]),
            min_box_area_ratio=system_config.get("min_box_area_ratio", 0.0005),
            alert_cooldown=system_config.get("alert_cooldown", 5.0),
            track_timeout=system_config.get("track_timeout", 2.0),
            target_width=system_config.get("detector_target_width", 960),
            model_path=model_path
        )

        # ===============================
        # ZMQ Publisher
        # ===============================
        context = zmq.Context.instance()
        self.socket = context.socket(zmq.PUB)
        self.socket.connect(system_config.get("alert_zmq_endpoint", "tcp://127.0.0.1:5555"))
        time.sleep(0.5)

        # ===============================
        # STREAM (FFMPEG MODULE)
        # ===============================
        self.stream = FFmpegStream(
            camera_config=camera_config,
            width=WIDTH,
            height=HEIGHT,
            fps=FPS,
            frame_size=FRAME_SIZE
        )

        # ===============================
        # CONTROL FLAGS
        # ===============================
        self.running = True
        self.detect_running = True

        # ===============================
        # SHARED MEMORY
        # ===============================
        self.total_size = HEADER_SIZE + FRAME_SIZE * SLOTS

        self.shm = None
        self.buffer = None
        self.index = 0

        self.detected_shm = None
        self.detected_buffer = None
        self.detected_index = 0

        # Latest frame buffer (thread safe)
        self.latest_raw = None
        self.latest_lock = threading.Lock()

    # ===============================
    # SHARED MEMORY (RAW STREAM)
    # ===============================
    def create_shared_memory(self):
        try:
            self.shm = shared_memory.SharedMemory(
                name=self.camera["id"],
                create=True,
                size=self.total_size
            )
            print(f"[{self.camera['name']}] Shared memory created")
        except FileExistsError:
            self.shm = shared_memory.SharedMemory(name=self.camera["id"])

        self.buffer = self.shm.buf
        struct.pack_into("Q", self.buffer, 0, 0)

    # ===============================
    # SHARED MEMORY (DETECTED STREAM)
    # ===============================
    def create_detected_shared_memory(self):
        name = f"detected-{self.camera['id']}"

        try:
            self.detected_shm = shared_memory.SharedMemory(
                name=name,
                create=True,
                size=self.total_size
            )
            print(f"[{self.camera['name']}] Detected shared memory created")
        except FileExistsError:
            self.detected_shm = shared_memory.SharedMemory(name=name)

        self.detected_buffer = self.detected_shm.buf
        struct.pack_into("Q", self.detected_buffer, 0, 0)

    # ===============================
    # MAIN LOOP (CAPTURE)
    # ===============================
    def run(self):

        self.create_shared_memory()
        self.create_detected_shared_memory()
        self.stream.start()

        detect_thread = threading.Thread(
            target=self.detection_loop,
            daemon=True
        )
        detect_thread.start()

        print(f"[STARTING] {self.camera['name']}")

        try:
            while self.running:

                raw = self.stream.read_frame()

                if raw is None:
                    self.stream.restart()
                    continue

                slot = self.index % SLOTS
                offset = HEADER_SIZE + slot * FRAME_SIZE

                self.buffer[offset:offset + FRAME_SIZE] = raw

                self.index += 1
                struct.pack_into("Q", self.buffer, 0, self.index)

                # Update latest frame for detection
                with self.latest_lock:
                    self.latest_raw = raw

        except Exception as e:
            print(f"[{self.camera['name']}] ERROR:", e)

        finally:
            self.cleanup()

    # ===============================
    # DETECTION LOOP
    # ===============================
    def detection_loop(self):

        while self.detect_running:

            with self.latest_lock:
                raw = self.latest_raw
                self.latest_raw = None

            if raw is None:
                time.sleep(0.001)
                continue

            frame = self.yuv420p_to_bgr(raw)

            # ===============================
            # RUN AI
            # ===============================

            alerts, annotated = self.detector.detect(frame)

            if annotated.shape[1] != WIDTH or annotated.shape[0] != HEIGHT:
                annotated = cv2.resize(annotated, (WIDTH, HEIGHT))

            annotated_yuv = cv2.cvtColor(annotated, cv2.COLOR_BGR2YUV_I420)

            if annotated_yuv.size != FRAME_SIZE:
                print(f"[{self.camera['name']}] Frame size mismatch! Skipping frame.")
                continue

            slot = self.detected_index % SLOTS
            offset = HEADER_SIZE + slot * FRAME_SIZE

            self.detected_buffer[offset:offset + FRAME_SIZE] = annotated_yuv.tobytes()

            self.detected_index += 1
            struct.pack_into("Q", self.detected_buffer, 0, self.detected_index)

            # ===============================
            # SEND ALERTS
            # ===============================
            if alerts:
                for label, conf in alerts:

                    voice_message = VOICE_TEMPLATE.format(
                        label=label,
                        camera=self.camera["name"],
                        confidence=conf * 100
                    )

                    event = {
                        "camera_id": self.camera["id"],
                        "camera_name": self.camera["name"],
                        "label": label,
                        "confidence": float(conf),
                        "timestamp": datetime.utcnow().isoformat(),
                        "voice_message": voice_message
                    }
                    print("[PUB] Sending alert:", event)
                    self.socket.send_json(event)

    # ===============================
    # CLEANUP
    # ===============================
    def cleanup(self):

        self.running = False
        self.detect_running = False

        # Stop FFmpeg stream safely
        self.stream.stop()

        if self.shm:
            try:
                self.shm.close()
            except:
                pass

        if self.detected_shm:
            try:
                self.detected_shm.close()
            except:
                pass

        print(f"[{self.camera['name']}] Worker stopped.")

    # ===============================
    # YUV → BGR
    # ===============================
    def yuv420p_to_bgr(self, raw):
        yuv = np.frombuffer(raw, dtype=np.uint8).reshape(
            (HEIGHT * 3 // 2, WIDTH)
        )
        return cv2.cvtColor(yuv, cv2.COLOR_YUV2BGR_I420)


