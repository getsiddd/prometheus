# api_server.py

import asyncio
import struct
import cv2
import numpy as np
import zmq
import zmq.asyncio
from multiprocessing import shared_memory
from typing import Dict, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

WIDTH = 1280
HEIGHT = 720
SLOTS = 20
HEADER_SIZE = 32
FRAME_SIZE = WIDTH * HEIGHT * 3 // 2

app = FastAPI(title="Prometheus AI Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For testing only
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

active_connections: Dict[str, List[WebSocket]] = {}
ALERT_ZMQ_ENDPOINT = "tcp://127.0.0.1:5555"
ALARM_ZMQ_ENDPOINT = "tcp://127.0.0.1:5556"

# This will be injected from main.py
ACTIVE_CAMERAS: List[str] = []

def set_active_cameras(camera_ids: List[str]):
    ACTIVE_CAMERAS.clear()
    ACTIVE_CAMERAS.extend(camera_ids)


def set_alert_zmq_endpoint(endpoint: str):
    global ALERT_ZMQ_ENDPOINT
    ALERT_ZMQ_ENDPOINT = endpoint


def set_alarm_zmq_endpoint(endpoint: str):
    global ALARM_ZMQ_ENDPOINT
    ALARM_ZMQ_ENDPOINT = endpoint


# ==========================================================
# ROOT ENDPOINT
# ==========================================================

@app.get("/")
async def root(request: Request):

    base_url = str(request.base_url).rstrip("/")

    cameras_info = []

    for cam_id in ACTIVE_CAMERAS:
        cameras_info.append({
            "camera_id": cam_id,
            "raw_stream": f"{base_url}/stream/{cam_id}/raw",
            "detected_stream": f"{base_url}/stream/{cam_id}/detected",
            "websocket_alerts": f"ws://{request.client.host}:{request.url.port}/ws/alerts/{cam_id}"
        })

    return {
        "server": "Prometheus AI Backend",
        "status": "running",
        "resolution": f"{WIDTH}x{HEIGHT}",
        "active_cameras": len(ACTIVE_CAMERAS),
        "cameras": cameras_info
    }


# ==========================================================
# HEALTH CHECK
# ==========================================================

@app.get("/health")
async def health():
    return {"status": "healthy"}


# ==========================================================
# SHARED MEMORY READER
# ==========================================================

class SharedMemoryReader:
    def __init__(self, name):
        self.shm = shared_memory.SharedMemory(name=name)
        self.buffer = self.shm.buf

    def read_latest_frame(self):
        index = struct.unpack_from("Q", self.buffer, 0)[0]
        if index == 0:
            return None

        slot = (index - 1) % SLOTS
        offset = HEADER_SIZE + slot * FRAME_SIZE
        raw = self.buffer[offset:offset + FRAME_SIZE]

        if len(raw) != FRAME_SIZE:
            return None

        return bytes(raw)

    def close(self):
        try:
            self.shm.close()
        except:
            pass


def yuv420p_to_jpeg(raw):
    yuv = np.frombuffer(raw, dtype=np.uint8).reshape(
        (HEIGHT * 3 // 2, WIDTH)
    )
    bgr = cv2.cvtColor(yuv, cv2.COLOR_YUV2BGR_I420)
    _, jpeg = cv2.imencode(".jpg", bgr)
    return jpeg.tobytes()


async def mjpeg_generator(shm_name):
    reader = SharedMemoryReader(shm_name)

    try:
        while True:
            raw = reader.read_latest_frame()
            if raw:
                jpeg = yuv420p_to_jpeg(raw)
                if jpeg:
                    yield (
                        b"--frame\r\n"
                        b"Content-Type: image/jpeg\r\n\r\n" +
                        jpeg +
                        b"\r\n"
                    )

            await asyncio.sleep(0.03)

    finally:
        reader.close()


# ==========================================================
# STREAM ENDPOINTS
# ==========================================================

@app.get("/stream/{cam_id}/raw")
async def raw_stream(cam_id: str):
    return StreamingResponse(
        mjpeg_generator(cam_id),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


@app.get("/stream/{cam_id}/detected")
async def detected_stream(cam_id: str):
    return StreamingResponse(
        mjpeg_generator(f"detected-{cam_id}"),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


# ==========================================================
# WEBSOCKET ALERTS
# ==========================================================

@app.websocket("/ws/alerts/{cam_id}")
async def websocket_alerts(websocket: WebSocket, cam_id: str):

    await websocket.accept()

    if cam_id not in active_connections:
        active_connections[cam_id] = []

    active_connections[cam_id].append(websocket)

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        if cam_id in active_connections:
            active_connections[cam_id].remove(websocket)


# ==========================================================
# ZMQ → WEBSOCKET BRIDGE
# ==========================================================

async def zmq_listener():

    context = zmq.asyncio.Context.instance()
    alert_sub = context.socket(zmq.SUB)
    alert_sub.bind(ALERT_ZMQ_ENDPOINT)
    alert_sub.setsockopt_string(zmq.SUBSCRIBE, "")

    alarm_pub = context.socket(zmq.PUB)
    alarm_pub.bind(ALARM_ZMQ_ENDPOINT)

    print(f"[ZMQ] Alert listener started on {ALERT_ZMQ_ENDPOINT}")
    print(f"[ZMQ] Alarm relay started on {ALARM_ZMQ_ENDPOINT}")

    while True:
        msg = await alert_sub.recv_json()
        cam_id = msg.get("camera_id")

        try:
            alarm_pub.send_json(msg)
        except:
            pass

        if cam_id in active_connections:
            for ws in active_connections[cam_id]:
                try:
                    await ws.send_json(msg)
                except:
                    pass


@app.on_event("startup")
async def startup_event():
    asyncio.create_task(zmq_listener())