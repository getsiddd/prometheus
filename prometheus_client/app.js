// ===============================
// CONFIG
// ===============================

const BACKEND = "http://192.168.101.241:8000";
const WS_BASE = "ws://192.168.101.241:8000";
const ALERT_TIMEOUT = 3000;
const ALARM_HOLD_TIME = 7000; // hold after last alert

// ===============================
// GLOBAL STATE
// ===============================

let globalAlertCount = 0;
let alarmHoldTimer = null;

const alertBanner = document.getElementById("alertBanner");
const alarm = document.getElementById("alarmSound");

// ===============================
// SOUND UNLOCK (Electron Safe)
// ===============================

window.addEventListener(
    "click",
    () => {
        alarm.play().then(() => {
            alarm.pause();
            alarm.currentTime = 0;
        }).catch(() => {});
    },
    { once: true }
);

function enableSound() {
    alarm.play().then(() => {
        alarm.pause();
        alarm.currentTime = 0;
    }).catch(() => {});
}
enableSound();

// ===============================
// LOAD CAMERAS
// ===============================

async function loadCameras() {
    try {
        const response = await fetch(BACKEND + "/");
        const data = await response.json();

        document.getElementById("serverStatus").innerText = "Connected";

        const container = document.getElementById("cameraContainer");
        container.innerHTML = "";

        data.cameras.forEach((cam) => createCameraCard(cam));

    } catch (err) {
        document.getElementById("serverStatus").innerText = "Disconnected";
        setTimeout(loadCameras, 3000);
    }
}

// ===============================
// CREATE CAMERA CARD
// ===============================

function createCameraCard(cam) {
    const card = document.createElement("div");
    card.className = "cameraCard";

    const title = document.createElement("div");
    title.className = "cameraTitle";
    title.innerText = cam.camera_id;

    const controls = document.createElement("div");
    controls.className = "controls";

    const rawBtn = document.createElement("button");
    rawBtn.innerText = "Raw";

    const detectedBtn = document.createElement("button");
    detectedBtn.innerText = "Detected";

    controls.appendChild(rawBtn);
    controls.appendChild(detectedBtn);

    const img = document.createElement("img");
    img.dataset.raw = cam.raw_stream;
    img.dataset.detected = cam.detected_stream;

    const savedMode = localStorage.getItem("stream_mode_" + cam.camera_id);
    const defaultStream =
        savedMode === "raw" ? cam.raw_stream : cam.detected_stream;

    setStream(img, defaultStream);

    rawBtn.onclick = () => {
        localStorage.setItem("stream_mode_" + cam.camera_id, "raw");
        setStream(img, img.dataset.raw);
    };

    detectedBtn.onclick = () => {
        localStorage.setItem("stream_mode_" + cam.camera_id, "detected");
        setStream(img, img.dataset.detected);
    };

    const alertsBox = document.createElement("div");
    alertsBox.className = "alerts";
    alertsBox.id = "alerts_" + cam.camera_id;

    card.appendChild(title);
    card.appendChild(controls);
    card.appendChild(img);
    card.appendChild(alertsBox);

    document.getElementById("cameraContainer").appendChild(card);

    connectWebSocket(cam.camera_id, card);
}

// ===============================
// STREAM HANDLER
// ===============================

function setStream(img, url) {

    let reconnectTimer = null;

    function load() {
        img.src = url + "?t=" + Date.now();
    }

    function scheduleReconnect() {
        if (reconnectTimer) return;
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            load();
        }, 3000);
    }

    img.onload = () => {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
    };
    img.onerror = () => scheduleReconnect();

    load();
}

// ===============================
// WEBSOCKET ALERTS
// ===============================

function connectWebSocket(camId, card) {

    const ws = new WebSocket(WS_BASE + "/ws/alerts/" + camId);
    const activeAlerts = {};
    let cameraAlertCount = 0;

    ws.onmessage = (event) => {

        const data = JSON.parse(event.data);
        const box = document.getElementById("alerts_" + camId);
        const key = data.label;

        // Refresh existing alert timeout
        if (activeAlerts[key]) {
            clearTimeout(activeAlerts[key].timeout);
            activeAlerts[key].timeout = createTimeout(key);
            return;
        }

        // Create new alert
        const item = document.createElement("div");
        item.className = "alertItem";
        item.innerText =
            data.label + " (" + (data.confidence * 100).toFixed(1) + "%)";
        box.appendChild(item);

        activeAlerts[key] = {
            element: item,
            timeout: createTimeout(key)
        };

        cameraAlertCount++;
        globalAlertCount++;

        // System notification
        if (cameraAlertCount === 1) {
            window.electronAPI?.notify?.({
                title: "Safety Alert",
                message: `${data.label} detected on ${camId}`
            });
        }

        // Cancel hold timer if new alert comes
        if (alarmHoldTimer) {
            clearTimeout(alarmHoldTimer);
            alarmHoldTimer = null;
        }

        startAlarm();
        card.classList.add("cameraAlertActive");
        showBanner();
    };

    function createTimeout(key) {
        return setTimeout(() => {

            const alert = activeAlerts[key];
            if (!alert) return;

            alert.element.remove();
            delete activeAlerts[key];

            cameraAlertCount--;
            globalAlertCount--;

            if (cameraAlertCount < 0) cameraAlertCount = 0;
            if (globalAlertCount < 0) globalAlertCount = 0;

            // 🔥 DO NOT REMOVE BLINK HERE

            if (globalAlertCount === 0 && !alarmHoldTimer) {

                alarmHoldTimer = setTimeout(() => {

                    if (globalAlertCount === 0) {
                        stopAlarm();
                        hideBanner();

                        // 🔥 Stop blinking ONLY after hold time
                        document
                            .querySelectorAll(".cameraCard")
                            .forEach(c =>
                                c.classList.remove("cameraAlertActive")
                            );
                    }

                    alarmHoldTimer = null;

                }, ALARM_HOLD_TIME);
            }

        }, ALERT_TIMEOUT);
    }

    ws.onclose = () => {
        setTimeout(() => connectWebSocket(camId, card), 3000);
    };

    ws.onerror = () => ws.close();
}

// ===============================
// ALARM CONTROL
// ===============================

function startAlarm() {
    if (alarm.paused) {
        alarm.play().catch(() => {});
    }
}

function stopAlarm() {
    if (!alarm.paused) {
        alarm.pause();
        alarm.currentTime = 0;
    }
}

// ===============================
// BANNER CONTROL
// ===============================

function showBanner() {
    alertBanner.classList.remove("alertBannerHidden");
    alertBanner.classList.add("alertBannerActive");
}

function hideBanner() {
    alertBanner.classList.remove("alertBannerActive");
    alertBanner.classList.add("alertBannerHidden");
}

// ===============================
// START
// ===============================

loadCameras();