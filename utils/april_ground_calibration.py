import cv2
import numpy as np
import apriltag
import math
import struct
import time
from multiprocessing import shared_memory

# ==============================
# CONFIGURATION
# ==============================

USE_SHARED_MEMORY = True

RTSP_URL = "rtsp://admin:asdf123%40@192.168.176.161:554/Streaming/Channels/101?transport=tcp"

SHM_NAME = "cam4"
WIDTH = 1920
HEIGHT = 1080
SLOTS = 20
HEADER_SIZE = 32
FRAME_SIZE = WIDTH * HEIGHT * 3 // 2

# ---- PHYSICAL MEASUREMENTS ----
TAG_SIZE_METERS = 0.39   # A3 full size (~390mm usable)
DIST_X = 4.0
DIST_Y = 3.0

# Tag layout (ground plane)
TAG_LAYOUT = {
    0: (0.0, 0.0, 0.0),
    1: (DIST_X, 0.0, 0.0),
    2: (DIST_X, DIST_Y, 0.0),
    3: (0.0, DIST_Y, 0.0),
}

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

        return cv2.cvtColor(yuv, cv2.COLOR_YUV2BGR_I420)

# ==============================
# AXIS DRAW FUNCTION
# ==============================

def draw_axis(frame, camera_matrix, dist_coeffs, rvec, tvec, axis_len):

    axis = np.float32([
        [0, 0, 0],
        [axis_len, 0, 0],
        [0, axis_len, 0],
        [0, 0, -axis_len],
    ])

    imgpts, _ = cv2.projectPoints(axis, rvec, tvec, camera_matrix, dist_coeffs)
    imgpts = imgpts.astype(int)

    o = tuple(imgpts[0].ravel())
    x = tuple(imgpts[1].ravel())
    y = tuple(imgpts[2].ravel())
    z = tuple(imgpts[3].ravel())

    cv2.line(frame, o, x, (0, 0, 255), 3)
    cv2.line(frame, o, y, (0, 255, 0), 3)
    cv2.line(frame, o, z, (255, 0, 0), 3)

# ==============================
# VIDEO SOURCE
# ==============================

if USE_SHARED_MEMORY:
    source = SharedMemoryReader(SHM_NAME)
else:
    cap = cv2.VideoCapture(RTSP_URL)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

detector = apriltag.Detector()

# Initial camera matrix guess
focal_length = WIDTH
camera_matrix = np.array([
    [focal_length, 0, WIDTH/2],
    [0, focal_length, HEIGHT/2],
    [0, 0, 1]
], dtype=np.float32)

dist_coeffs = np.zeros((4,1))

print("Press SPACE to calibrate ground plane")

calibrated = False

# ==============================
# MAIN LOOP
# ==============================

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

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    results = detector.detect(gray)

    # ---- DRAW PER-TAG AXIS (BEFORE CALIBRATION) ----
    for r in results:

        pose, e0, e1 = detector.detection_pose(
            r,
            (focal_length, focal_length, WIDTH/2, HEIGHT/2),
            TAG_SIZE_METERS
        )

        R = pose[:3,:3]
        t = pose[:3,3]

        rvec, _ = cv2.Rodrigues(R)
        tvec = t.reshape(3,1)

        draw_axis(frame, camera_matrix, dist_coeffs, rvec, tvec, TAG_SIZE_METERS*4)

        cv2.polylines(frame, [r.corners.astype(int)], True, (0,255,0), 2)

    # ---- CALIBRATION TRIGGER ----
    key = cv2.waitKey(1)

    if key == 32 and not calibrated:

        if len(results) < 4:
            print("Need 4 tags visible")
        else:
            print("Calibrating ground plane...")

            object_points = []
            image_points = []

            half = TAG_SIZE_METERS/2

            for r in results:
                if r.tag_id not in TAG_LAYOUT:
                    continue

                wx, wy, wz = TAG_LAYOUT[r.tag_id]

                world_corners = [
                    (wx-half, wy-half, 0),
                    (wx+half, wy-half, 0),
                    (wx+half, wy+half, 0),
                    (wx-half, wy+half, 0),
                ]

                object_points.extend(world_corners)
                image_points.extend(r.corners)

            object_points = np.array(object_points, dtype=np.float32)
            image_points = np.array(image_points, dtype=np.float32)

            success, rvec_global, tvec_global = cv2.solvePnP(
                object_points,
                image_points,
                camera_matrix,
                dist_coeffs
            )

            if success:
                calibrated = True
                print("Calibration successful")

                H, _ = cv2.findHomography(image_points, object_points[:,:2])

    # ---- AFTER CALIBRATION DRAW GLOBAL AXIS ----
    if calibrated:
        for tag_id, origin in TAG_LAYOUT.items():

            axis = np.float32([
                origin,
                (origin[0]+0.5, origin[1], origin[2]),
                (origin[0], origin[1]+0.5, origin[2]),
                (origin[0], origin[1], origin[2]-0.5),
            ])

            imgpts, _ = cv2.projectPoints(
                axis, rvec_global, tvec_global,
                camera_matrix, dist_coeffs
            )

            imgpts = imgpts.astype(int)

            o = tuple(imgpts[0].ravel())
            x = tuple(imgpts[1].ravel())
            y = tuple(imgpts[2].ravel())
            z = tuple(imgpts[3].ravel())

            cv2.line(frame, o, x, (0,0,255), 3)
            cv2.line(frame, o, y, (0,255,0), 3)
            cv2.line(frame, o, z, (255,0,0), 3)

        warped = cv2.warpPerspective(frame, H, (1000,800))
        cv2.imshow("Bird Eye View", warped)

    cv2.imshow("AprilTag 3D Calibration", frame)

    if key == 27:
        break

if not USE_SHARED_MEMORY:
    cap.release()

cv2.destroyAllWindows()