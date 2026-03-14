# background.py
import threading
import asyncio
from api_client import connect_to_server  # your ZMQ / WebSocket client
import webview

def show_ui():
    import os
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    webview.create_window(
        "Prometheus AI Client",
        os.path.join(BASE_DIR, "index.html"),
        fullscreen=True
    )

async def main():
    # Connect to backend and listen for alerts
    await connect_to_server(on_alert=show_ui)

if __name__ == "__main__":
    # Run background loop
    loop = asyncio.get_event_loop()
    loop.run_until_complete(main())
    