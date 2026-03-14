const BACKEND = "http://192.168.101.241:8000";
const WS_BASE = "ws://192.168.101.241:8000";
const ALERT_TIMEOUT = 3000;
const ALARM_HOLD_TIME = 5000    // extra hold after last alert

const alertBanner = document.getElementById("alertBanner");

async function loadCameras() {
    try {
        const response = await fetch(BACKEND + "/");
        const data = await response.json();

        document.getElementById("serverStatus").innerText = "Connected";

        const container = document.getElementById("cameraContainer");
        container.innerHTML = "";

        data.cameras.forEach(cam => createCameraCard(cam));

    } catch (err) {
        document.getElementById("serverStatus").innerText = "Disconnected";
        console.error("Backend not reachable");
        setTimeout(loadCameras, 3000);
    }
}

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
    const defaultStream = savedMode === "raw"
        ? cam.raw_stream
        : cam.detected_stream;

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

    connectWebSocket(cam.camera_id);
}

function setStream(img, url) {
    img.src = url + "?t=" + new Date().getTime();
    img.onerror = () => {
        setTimeout(() => setStream(img, url), 3000);
    };
}

function connectWebSocket(camId) {

    const ws = new WebSocket(WS_BASE + "/ws/alerts/" + camId);
    const activeAlerts = {};
    let cameraAlertCount = 0;

    const card = document.querySelector(`#alerts_${camId}`).closest(".cameraCard");

    ws.onmessage = (event) => {

        const data = JSON.parse(event.data);
        const box = document.getElementById("alerts_" + camId);
        const key = data.label;

        if (activeAlerts[key]) {
            clearTimeout(activeAlerts[key].timeout);
            activeAlerts[key].timeout = createTimeout(key);
            return;
        }

        const item = document.createElement("div");
        item.className = "alertItem";
        item.id = "alert_" + camId + "_" + key;

        item.innerText =
            data.label + " (" + (data.confidence * 100).toFixed(1) + "%)";

        box.appendChild(item);

        activeAlerts[key] = {
            element: item,
            timeout: createTimeout(key)
        };

        cameraAlertCount++;
        globalAlertCount++;

        // Cancel hold timer if running
        if (alarmHoldTimer) {
            clearTimeout(alarmHoldTimer);
            alarmHoldTimer = null;
        }

        // 🔥 Start alarm
        startAlarm();

        // 🔥 Add blinking class
        card.classList.add("cameraAlertActive");
        // 🔥 Show banner
        alertBanner.classList.remove("alertBannerHidden");
        alertBanner.classList.add("alertBannerActive");
    };

    function createTimeout(key) {
        return setTimeout(() => {

            const alert = activeAlerts[key];
            if (!alert) return;

            alert.element.remove();
            delete activeAlerts[key];

            cameraAlertCount--;
            globalAlertCount--;

            if (cameraAlertCount <= 0) {
                cameraAlertCount = 0;
                card.classList.remove("cameraAlertActive");  // 🔥 Stop blinking
            }

            if (globalAlertCount <= 0) {
                globalAlertCount = 0;

                // 🔥 Start hold timer instead of stopping immediately
                if (!alarmHoldTimer) {
                    alarmHoldTimer = setTimeout(() => {

                        // If still no alerts after hold time
                        if (globalAlertCount === 0) {
                            stopAlarm();
                            document.querySelectorAll(".cameraCard")
                                .forEach(c => c.classList.remove("cameraAlertActive"));

                            // 🔥 Hide banner
                            alertBanner.classList.remove("alertBannerActive");
                            alertBanner.classList.add("alertBannerHidden");
                        }

                        alarmHoldTimer = null;

                    }, ALARM_HOLD_TIME);
                }
            }

        }, ALERT_TIMEOUT);
    }

    ws.onclose = () => {
        setTimeout(() => connectWebSocket(camId), 3000);
    };

    ws.onerror = () => ws.close();
}

loadCameras();

let globalAlertCount = 0;
let alarmHoldTimer = null;
const alarm = document.getElementById("alarmSound");

window.addEventListener("click", () => {
    alarm.play().then(() => {
        alarm.pause();
        alarm.currentTime = 0;
    }).catch(() => {});
}, { once: true });

function enableSound() {
    alarm.play().then(() => {
        alarm.pause();
        alarm.currentTime = 0;
        alert("Alarm Enabled");
    }).catch(() => {});
}

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

enableSound();