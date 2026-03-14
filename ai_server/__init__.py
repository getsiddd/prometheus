from rtsp_publisher import RTSPPublisher

self.raw_publisher = RTSPPublisher(
    stream_name=f"raw_{self.camera['id']}",
    width=WIDTH,
    height=HEIGHT,
    fps=FPS
)

self.detected_publisher = RTSPPublisher(
    stream_name=f"detected_{self.camera['id']}",
    width=WIDTH,
    height=HEIGHT,
    fps=FPS
)
