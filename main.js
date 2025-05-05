const { app, BrowserWindow, ipcMain } = require('electron');
const { exec } = require('child_process');
const path = require('path');

let ffmpegProcess = null;
let mainWindow;

app.whenReady().then(() => {

  mainWindow = new BrowserWindow({
    width: 500,
    height: 1000,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    },
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('close', () => {
    if (ffmpegProcess) {
      console.log("Terminating FFMPEG process before app closes...");
      ffmpegProcess.kill('SIGTERM');
    }
  });
});


// Listen for the terminate-ffmpeg message to terminate the process from the renderer
ipcMain.on('terminate-ffmpeg', () => {
  if (ffmpegProcess) {
    console.log("Terminating FFMPEG process...");
    ffmpegProcess.kill('SIGTERM'); // Use SIGTERM to terminate the process more reliably
    ffmpegProcess = null; // Reset the reference
  }
});

// Run the FFMPEG process based on the received command
ipcMain.on('run-ffmpeg', (event, ffmpegCommand) => {
  ffmpegProcess = exec(ffmpegCommand);

    ffmpegProcess.stderr.on('data', (data) => {
    // Optional: Parse progress info from data if needed
    event.sender.send('ffmpeg-progress', data.toString());
  });

  // Handle process completion or failure
  ffmpegProcess.on('close', (code) => {
    if (code === 0) {
      event.sender.send('ffmpeg-success', 'FFMPEG process completed successfully.');
    } else {
      event.sender.send('ffmpeg-error', `FFMPEG process failed with code: ${code}`);
    }

    // Reset the ffmpegProcess reference after it has closed
    ffmpegProcess = null;
  });
});

// Quit the app when all windows are closed (except on macOS, sorry)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
