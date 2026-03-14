# rtsp_publisher.py

import subprocess
import threading
import queue

class RTSPPublisher:
    def __init__(self, stream_name, width, height, fps):
        self.stream_name = stream_name
        self.width = width
        self.height = height
        self.fps = fps

        self.process = None
        self.queue = queue.Queue(maxsize=10)
        self.running = False

    def start(self):

        cmd = [
            "ffmpeg",
            "-f", "rawvideo",
            "-pix_fmt", "yuv420p",
            "-s", f"{self.width}x{self.height}",
            "-r", str(self.fps),
            "-i", "-",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-tune", "zerolatency",
            "-f", "rtsp",
            f"rtsp://127.0.0.1:8554/{self.stream_name}"
        ]

        self.process = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE
        )

        self.running = True
        threading.Thread(target=self._writer, daemon=True).start()

    def _writer(self):
        while self.running:
            frame = self.queue.get()
            if frame is None:
                break
            try:
                self.process.stdin.write(frame)
            except:
                break

    def write(self, frame):
        if not self.queue.full():
            self.queue.put(frame)

    def stop(self):
        self.running = False
        self.queue.put(None)
        if self.process:
            self.process.terminate()

