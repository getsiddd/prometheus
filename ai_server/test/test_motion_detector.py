import cv2
import numpy as np
import struct
import time
import sys
from multiprocessing import shared_memory

sys.path.append("..")

from motion_detector import MotionDetector4


# ==============================
# CONFIGURATION
# ==============================

USE_SHARED_MEMORY = True

RTSP_URL = "rtsp://admin:asdf123%40@192.168.176.161:554/Streaming/Channels/101?transport=tcp"

SHM_NAME = "camera_1"

WIDTH = 1920
HEIGHT = 1080

SLOTS = 20
HEADER_SIZE = 32
FRAME_SIZE = WIDTH * HEIGHT * 3 // 2


# ==============================
# SHARED MEMORY READER
# ==============================

class SharedMemoryReader:

    def __init__(self, name):
        self.shm = shared_memory.SharedMemory(name=name)
        self.buffer = self.shm.buf
        self.index = 0

    def read_latest_frame(self):

        new_index = struct.unpack_from("Q", self.buffer, 0)[0]

        if new_index == self.index:
            return None

        self.index = new_index

        slot = (self.index - 1) % SLOTS
        offset = HEADER_SIZE + slot * FRAME_SIZE

        raw = self.buffer[offset:offset + FRAME_SIZE]

        yuv = np.frombuffer(raw, dtype=np.uint8).reshape(
            (HEIGHT * 3 // 2, WIDTH)
        )

        frame = cv2.cvtColor(yuv, cv2.COLOR_YUV2BGR_I420)

        return frame


# ==============================
# ROI DRAWING
# ==============================

drawing = False
ix, iy = -1, -1
rois = []


def draw_roi(event, x, y, flags, param):

    global drawing, ix, iy, rois

    frame = param["frame"]

    if event == cv2.EVENT_LBUTTONDOWN:
        drawing = True
        ix, iy = x, y

    elif event == cv2.EVENT_MOUSEMOVE:

        if drawing:

            img = frame.copy()

            for r in rois:
                cv2.rectangle(img, r[0], r[1], (0,255,0), 2)

            cv2.rectangle(img, (ix, iy), (x, y), (0,255,255), 2)

            cv2.imshow("Draw ROI - ENTER to start", img)

    elif event == cv2.EVENT_LBUTTONUP:

        drawing = False

        rois.append(((ix, iy), (x, y)))

        img = frame.copy()

        for r in rois:
            cv2.rectangle(img, r[0], r[1], (0,255,0), 2)

        cv2.imshow("Draw ROI - ENTER to start", img)


def select_rois(frame):

    global rois
    rois = []

    clone = frame.copy()

    cv2.namedWindow("Draw ROI - ENTER to start")

    cv2.setMouseCallback(
        "Draw ROI - ENTER to start",
        draw_roi,
        {"frame": clone}
    )

    print("Draw ROIs with mouse")
    print("ENTER → Start detection")
    print("R → Reset ROIs")

    while True:

        img = clone.copy()

        for r in rois:
            cv2.rectangle(img, r[0], r[1], (0,255,0), 2)

        cv2.imshow("Draw ROI - ENTER to start", img)

        key = cv2.waitKey(1) & 0xFF

        if key == 13:
            break

        if key == ord('r'):
            rois = []

    cv2.destroyWindow("Draw ROI - ENTER to start")

    return rois


def build_roi_mask(frame_shape, rois):

    h, w = frame_shape[:2]

    mask = np.zeros((h, w), dtype=np.uint8)

    if len(rois) == 0:
        mask[:] = 255
        return mask

    for (x1,y1),(x2,y2) in rois:

        x1, x2 = min(x1,x2), max(x1,x2)
        y1, y2 = min(y1,y2), max(y1,y2)

        cv2.rectangle(mask, (x1,y1), (x2,y2), 255, -1)

    return mask


# ==============================
# VIDEO SOURCE
# ==============================

if USE_SHARED_MEMORY:

    source = SharedMemoryReader(SHM_NAME)

else:

    cap = cv2.VideoCapture(RTSP_URL)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)


motion_detector = MotionDetector4()


# ==============================
# GET FIRST FRAME FOR ROI
# ==============================

print("Waiting first frame for ROI selection...")

while True:

    if USE_SHARED_MEMORY:

        frame = source.read_latest_frame()

        if frame is None:
            time.sleep(0.01)
            continue

    else:

        ret, frame = cap.read()

        if not ret:
            continue

    break


# ==============================
# ROI SELECTION
# ==============================

rois = select_rois(frame)

use_roi = len(rois) > 0

roi_mask = build_roi_mask(frame.shape, rois) if use_roi else None

roi_bool = roi_mask.astype(bool) if use_roi else None

background_frame = frame.copy()

print(f"ROI count: {len(rois)}")


# ==============================
# MAIN LOOP
# ==============================

print("Motion detector running...")

last_time = time.time()

while True:

    if USE_SHARED_MEMORY:

        frame = source.read_latest_frame()

        if frame is None:
            time.sleep(0.002)
            continue

    else:

        ret, frame = cap.read()

        if not ret:
            continue


    # -----------------------------
    # BUILD FRAME FOR MOTION
    # -----------------------------

    if use_roi:

        frame_for_motion = frame.copy()

        frame_for_motion[~roi_bool] = background_frame[~roi_bool]

    else:

        frame_for_motion = frame


    motion, mask, ratio = motion_detector.detect(frame_for_motion, None)


    # -----------------------------
    # FPS
    # -----------------------------

    now = time.time()
    fps = 1 / (now - last_time)
    last_time = now


    # -----------------------------
    # DISPLAY
    # -----------------------------

    display = frame.copy()

    if use_roi:
        display[~roi_bool] = (display[~roi_bool] * 0.3).astype(np.uint8)

    for (x1,y1),(x2,y2) in rois:
        cv2.rectangle(display,(x1,y1),(x2,y2),(0,255,0),2)


    text = f"Motion: {motion}  Ratio: {ratio:.4f}  FPS: {fps:.1f}"

    color = (0,255,0) if motion else (0,0,255)

    cv2.putText(
        display,
        text,
        (30,40),
        cv2.FONT_HERSHEY_SIMPLEX,
        1,
        color,
        2
    )


    mask_big = cv2.resize(mask, (640,360))


    cv2.imshow("Camera", display)
    cv2.imshow("Motion Mask", mask_big)


    if cv2.waitKey(1) == 27:
        break


if not USE_SHARED_MEMORY:
    cap.release()

cv2.destroyAllWindows()
