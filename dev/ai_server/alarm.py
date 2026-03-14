# alarm.py

import pygame
import numpy as np
import threading
import time
import pyttsx3
import zmq
import json
import os

# ==============================
# CONFIG
# ==============================
SAVE_DIR = "alerts"

VOICE_TEMPLATE = "Warning. {label} detected on {camera}."
MANUAL_MESSAGE = "Manual alarm activated."

# ==============================
# INIT AUDIO
# ==============================
pygame.mixer.init(frequency=44100, size=-16, channels=1)

# ==============================
# INIT VOICE
# ==============================
engine = pyttsx3.init()
engine.setProperty("rate", 160)
engine.setProperty("volume", 1.0)

alarm_active = False
current_message = "Warning. Fire detected."

lock = threading.Lock()

# ==============================
# POLICE STYLE SIREN GENERATOR
# ==============================
def generate_tone(freq, duration=0.5):
    sample_rate = 44100
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    wave = np.sin(freq * t * 2 * np.pi)
    audio = (wave * 32767).astype(np.int16)
    return pygame.sndarray.make_sound(audio)


high_tone = generate_tone(1200, 0.5)
low_tone = generate_tone(700, 0.5)

# ==============================
# SIREN LOOP
# ==============================
def siren_loop():
    global alarm_active
    while True:
        if alarm_active:
            high_tone.play()
            pygame.time.delay(500)
            low_tone.play()
            pygame.time.delay(500)
        else:
            time.sleep(0.1)


# ==============================
# VOICE LOOP
# ==============================
def voice_loop():
    global alarm_active, current_message
    while True:
        if alarm_active:
            engine.say(current_message)
            engine.runAndWait()
            time.sleep(5)
        else:
            time.sleep(0.1)


# ==============================
# CONTROL FUNCTIONS
# ==============================
def start_alarm(message):
    global alarm_active, current_message

    with lock:
        current_message = message
        if not alarm_active:
            alarm_active = True
            print("[🚨] ALARM STARTED")


def stop_alarm():
    global alarm_active
    with lock:
        if alarm_active:
            alarm_active = False
            print("[🔕] ALARM STOPPED BY USER")


# ==============================
# KEYBOARD LISTENER
# ==============================
def keyboard_listener():
    print("[CONTROL] Commands:")
    print("  s + Enter  → Stop alarm")
    print("  c + Enter  → Trigger manual alarm")

    while True:
        cmd = input().strip().lower()

        if cmd == "s":
            stop_alarm()

        elif cmd == "c":
            start_alarm(MANUAL_MESSAGE)


# ==============================
# LOGGING
# ==============================
def save_log(event):
    os.makedirs(SAVE_DIR, exist_ok=True)
    file_path = os.path.join(SAVE_DIR, "events.txt")

    with open(file_path, "a") as f:
        f.write(json.dumps(event) + "\n")


# ==============================
# ZMQ LISTENER
# ==============================
def main():

    context = zmq.Context()
    socket = context.socket(zmq.SUB)
    socket.bind("tcp://*:5555")
    socket.setsockopt_string(zmq.SUBSCRIBE, "")

    print("[ALARM SERVICE] Listening on port 5555...")

    # Start background threads
    threading.Thread(target=siren_loop, daemon=True).start()
    threading.Thread(target=voice_loop, daemon=True).start()
    threading.Thread(target=keyboard_listener, daemon=True).start()

    while True:
        event = socket.recv_json()
        print("[EVENT RECEIVED]", event)

        save_log(event)

        label = event.get("label", "Unknown")
        camera = event.get("camera_name", "Camera")

        message = VOICE_TEMPLATE.format(
            label=label.upper(),
            camera=camera
        )

        # Auto-start if not active
        if not alarm_active:
            start_alarm(message)
        else:
            # Update live message while running
            with lock:
                global current_message
                current_message = message


if __name__ == "__main__":
    main()