import cv2
import numpy as np
import struct
import yaml
import time
import math
from multiprocessing import shared_memory

# ===============================
# VIDEO CONFIG (MUST MATCH CAMERA_MANAGER)
# ===============================
WIDTH = 1920
HEIGHT = 1080
SLOTS = 20
HEADER_SIZE = 32
FRAME_SIZE = WIDTH * HEIGHT * 3 // 2

DISPLAY_WIDTH = 640
DISPLAY_HEIGHT = 360


# ===============================
# LOAD CONFIG
# ===============================
def load_config(path="config.yaml"):
    with open(path, "r") as f:
        return yaml.safe_load(f)


# ===============================
# ATTACH SHARED MEMORY (NON-BLOCKING)
# ===============================
def attach_shared_memory(cam_id):
    try:
        shm = shared_memory.SharedMemory(name=cam_id)
        print(f"[Viewer] Attached to {cam_id}")
        return shm
    except FileNotFoundError:
        return None


# ===============================
# READ LATEST FRAME SAFELY
# ===============================
def read_latest_frame(shm):
    try:
        buffer = shm.buf

        index = struct.unpack_from("Q", buffer, 0)[0]
        if index == 0:
            return None

        slot = (index - 1) % SLOTS
        offset = HEADER_SIZE + slot * FRAME_SIZE

        # IMPORTANT: copy to avoid race condition
        raw = bytes(buffer[offset:offset + FRAME_SIZE])

        yuv = np.frombuffer(raw, dtype=np.uint8).reshape(
            (HEIGHT * 3 // 2, WIDTH)
        )

        frame = cv2.cvtColor(yuv, cv2.COLOR_YUV2BGR_I420)
        return frame

    except Exception:
        return None


# ===============================
# BUILD GRID (AUTO LAYOUT)
# ===============================
def build_grid(frames):
    if not frames:
        return None

    count = len(frames)
    cols = math.ceil(math.sqrt(count))
    rows = math.ceil(count / cols)

    blank = np.zeros_like(frames[0])
    grid_rows = []

    for r in range(rows):
        row_frames = []
        for c in range(cols):
            idx = r * cols + c
            if idx < count:
                row_frames.append(frames[idx])
            else:
                row_frames.append(blank)
        grid_rows.append(np.hstack(row_frames))

    return np.vstack(grid_rows)


# ===============================
# MAIN
# ===============================
def main():
    config = load_config()

    cameras = [
        cam for cam in config["cameras"]
        if cam.get("active", False)
    ]

    if not cameras:
        print("No active cameras found in config.")
        return

    shms = {cam["id"]: None for cam in cameras}

    print("[Viewer] Starting...")

    while True:

        frames = []

        for cam in cameras:
            cam_id = cam["id"]

            # Attach if not connected
            if shms[cam_id] is None:
                shms[cam_id] = attach_shared_memory(cam_id)

            frame = None
            if shms[cam_id] is not None:
                frame = read_latest_frame(shms[cam_id])

            if frame is None:
                frame = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
                cv2.putText(
                    frame,
                    "NO SIGNAL",
                    (WIDTH // 3, HEIGHT // 2),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    2,
                    (0, 0, 255),
                    4
                )

            frame = cv2.resize(frame, (DISPLAY_WIDTH, DISPLAY_HEIGHT))

            cv2.putText(
                frame,
                cam["name"],
                (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.9,
                (0, 255, 0),
                2
            )

            frames.append(frame)

        grid = build_grid(frames)

        if grid is not None:
            cv2.imshow("Camera Viewer", grid)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

        time.sleep(0.01)

    cv2.destroyAllWindows()

    for shm in shms.values():
        if shm:
            shm.close()

    print("[Viewer] Closed cleanly.")


if __name__ == "__main__":
    main()
