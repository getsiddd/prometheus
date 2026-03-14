# main.py

import yaml
import os
import threading
import uvicorn

from huggingface_hub import hf_hub_download, login
from camera_manager import CameraWorker
from api_server import app, set_active_cameras

CONFIG_FILE = "config.yaml"


def load_config(path=CONFIG_FILE):
    with open(path) as f:
        return yaml.safe_load(f)


def download_model(system_config):
    token = system_config["token"]
    login(token=token)

    model_path = hf_hub_download(
        repo_id=system_config["MODEL_REPO"],
        filename=system_config["MODEL_FILE"],
        token=token
    )

    print(f"[AI] Model downloaded: {model_path}")
    return model_path


def start_api_server(host, port):

    config = uvicorn.Config(
        app,
        host=host,
        port=port,
        log_level="info"
    )

    server = uvicorn.Server(config)
    server.run()


def main():

    config = load_config()
    system_config = config["system"]

    os.makedirs(system_config["save_directory"], exist_ok=True)

    model_path = download_model(system_config)

    # ---------------------------
    # START API SERVER THREAD
    # ---------------------------
    api_thread = threading.Thread(
        target=start_api_server,
        args=(system_config["api_host"], system_config["api_port"]),
        daemon=True
    )
    api_thread.start()

    print("[MAIN] API Server started")

    # ---------------------------
    # START CAMERA WORKERS
    # ---------------------------
    workers = []

    for cam in config["cameras"]:
        if cam.get("active", False):
            worker = CameraWorker(cam, system_config, model_path)
            worker.start()
            workers.append(worker)
    
    # Inject active camera IDs into API
    active_ids = [
        cam["id"]
        for cam in config["cameras"]
        if cam.get("active", False)
    ]

    set_active_cameras(active_ids)

    try:
        for w in workers:
            w.join()
    except KeyboardInterrupt:
        print("[MAIN] Shutting down...")
        for w in workers:
            w.running = False


if __name__ == "__main__":
    main()