
import os
import webview

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

if __name__ == "__main__":
    webview.create_window(
        "Prometheus AI Client",
        os.path.join(BASE_DIR, "index.html"),
        fullscreen=True
    )
    webview.start(gui='qt')