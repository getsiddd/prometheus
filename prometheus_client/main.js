const { app, BrowserWindow, Tray, Menu, ipcMain, Notification } = require('electron');
const path = require('path');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-setuid-sandbox');

let mainWindow;
let tray;

function getTrayIcon() {
    if (process.platform === 'win32') {
        return path.join(__dirname, 'assets/prometheus.ico');
    }
    if (process.platform === 'darwin') {
        return path.join(__dirname, 'assets/prometheus.icns');
    }
    return path.join(__dirname, 'assets/prometheus.png'); // linux
}


function createWindow() {
    mainWindow = new BrowserWindow({
        fullscreen: true,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile('index.html');

    mainWindow.on('close', function (event) {
        if (!app.isQuiting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });
}

function createTray() {
    tray = new Tray(getTrayIcon()); // <-- add your icon
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show Dashboard', click: () => mainWindow.show() },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                app.isQuiting = true;
                app.quit();
            }
        }
    ]);
    tray.setToolTip('Safety & Alert System');
    tray.setContextMenu(contextMenu);
}

function showSystemNotification(title, body) {
    if (process.platform === 'win32' && tray) {
        tray.displayBalloon({
            title,
            content: body,
            icon: getTrayIcon()
        });
    } else {
        new Notification({
            title,
            body,
            silent: false
        }).show();
    }
}

// IPC from renderer
ipcMain.on('system-alert', (event, payload) => {
    showSystemNotification(
        payload.title || 'Alert',
        payload.message || 'New alert received'
    );
});

app.whenReady().then(() => {
    createWindow();
    createTray();

    // Auto start on login
    app.setLoginItemSettings({
        openAtLogin: true
    });
});

app.on('window-all-closed', function () {
    // keep running in tray
});