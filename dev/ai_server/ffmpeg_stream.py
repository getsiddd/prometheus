# ffmpeg_stream.py

import subprocess
import time


class FFmpegStream:

    def __init__(self, camera_config, width, height, fps, frame_size):
        self.camera = camera_config
        self.width = width
        self.height = height
        self.fps = fps
        self.frame_size = frame_size

        self.proc = None

    # ===============================
    # BUILD COMMAND
    # ===============================
    def build_command(self):

        source = self.camera["url"]

        base_cmd = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel", "error",
        ]

        # RTSP CAMERA
        if source.startswith("rtsp://"):

            print(f"[{self.camera['name']}] Using RTSP stream")

            input_cmd = [
                "-rtsp_transport", "tcp",
                "-fflags", "nobuffer",
                "-flags", "low_delay",
                "-fflags", "+discardcorrupt",
                "-i", source,
            ]

        # VIDEO FILE
        else:

            print(f"[{self.camera['name']}] Using video file")

            input_cmd = [
                "-re",
                "-stream_loop", "-1",
                "-i", source,
            ]

        output_cmd = [
            "-an",
            "-sn",
            "-r", str(self.fps),
            "-vf", f"scale={self.width}:{self.height}",
            "-pix_fmt", "yuv420p",
            "-f", "rawvideo",
            "pipe:1",
        ]

        return base_cmd + input_cmd + output_cmd

    # ===============================
    # START
    # ===============================
    def start(self):

        self.proc = subprocess.Popen(
            self.build_command(),
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            bufsize=10**8
        )

        print(f"[{self.camera['name']}] FFmpeg started")

    # ===============================
    # RESTART
    # ===============================
    def restart(self):

        print(f"[{self.camera['name']}] Restarting FFmpeg...")

        self.stop()
        time.sleep(2)
        self.start()

    # ===============================
    # READ EXACT FRAME
    # ===============================
    def read_frame(self):

        try:
            data = self.proc.stdout.read(self.frame_size)
            if not data or len(data) != self.frame_size:
                return None
            return data
        except:
            return None

    # ===============================
    # STOP
    # ===============================
    def stop(self):

        if self.proc:
            try:
                self.proc.kill()
                self.proc.wait(timeout=2)
            except:
                pass

            self.proc = None

