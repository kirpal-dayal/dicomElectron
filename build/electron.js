const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;

app.on('ready', () => {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            webSecurity: true,
        },
    });

    // const startURL = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '../build/index.html')}`;
    const startURL = `file://${path.join(__dirname, '../build/index.html')}`;
    console.log('Loading URL:', startURL); // Añadir log para verificar la URL

    mainWindow.loadURL(startURL);
    mainWindow.webContents.openDevTools();

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});