# capture.py
import subprocess
import sys
import time
import signal
import struct
import os
from multiprocessing import shared_memory

# ===============================
# CONFIG
# ===============================

WIDTH = 1920
HEIGHT = 1080
FPS = 15
SLOTS = 20
HEADER_SIZE = 32
CAMERA_NAME = "camera_1"

# ===============================
# BUILD FFMPEG COMMAND
# ===============================

def build_ffmpeg_cmd(rtsp_url):
    return [
        "ffmpeg",
        "-hide_banner",
        "-loglevel", "error",
        "-rtsp_transport", "tcp",
        "-fflags", "nobuffer",
        "-flags", "low_delay",
        "-i", rtsp_url,
        "-an",
        "-sn",
        "-r", str(FPS),
        "-vf", f"scale={WIDTH}:{HEIGHT}",
        "-pix_fmt", "yuv420p",
        "-f", "rawvideo",
        "pipe:1",
    ]

# ===============================
# SAFE SHARED MEMORY CREATION
# ===============================

def create_shared_memory(name, size):
    try:
        shm = shared_memory.SharedMemory(name=name, create=True, size=size)
        print("[CAPTURE] Created new shared memory")
        return shm

    except FileExistsError:
        print("[CAPTURE] Shared memory exists. Attaching...")

        shm = shared_memory.SharedMemory(name=name)
        if shm.size != size:
            print("[CAPTURE] Size mismatch. Recreating...")
            shm.close()
            shm.unlink()
            shm = shared_memory.SharedMemory(name=name, create=True, size=size)

        return shm

# ===============================
# MAIN
# ===============================

def main():

    if len(sys.argv) < 2:
        print("Usage: python capture.py <rtsp_url>")
        sys.exit(1)

    rtsp_url = sys.argv[1]

    frame_size = WIDTH * HEIGHT * 3 // 2
    total_size = HEADER_SIZE + frame_size * SLOTS

    print(f"[CAPTURE] Allocating {total_size / (1024*1024):.2f} MB")

    shm = create_shared_memory(CAMERA_NAME, total_size)

    buffer = shm.buf
    memory = memoryview(buffer)

    # Initialize header
    struct.pack_into("Q", buffer, 0, 0)

    proc = subprocess.Popen(
        build_ffmpeg_cmd(rtsp_url),
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        bufsize=10**8,
    )

    running = True
    index = 0

    def shutdown(sig, frame):
        nonlocal running
        print("\n[CAPTURE] Shutdown signal received")
        running = False

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    print("[CAPTURE] Streaming started")

    try:
        while running:

            raw = proc.stdout.read(frame_size)

            if raw is None or len(raw) != frame_size:
                time.sleep(0.002)
                continue

            slot = index % SLOTS
            offset = HEADER_SIZE + slot * frame_size

            # Write frame first
            memory[offset:offset + frame_size] = raw

            # Then publish index (atomic signal)
            struct.pack_into("Q", buffer, 0, index)

            index += 1

    except Exception as e:
        print("[CAPTURE ERROR]", e)

    finally:
        print("[CAPTURE] Stopping ffmpeg...")
        proc.kill()
        proc.wait()

        shm.close()
        # 🔥 DO NOT UNLINK HERE
        # Shared memory lives as long as capture process runs

        print("[CAPTURE] Shutdown complete")


if __name__ == "__main__":
    main()
