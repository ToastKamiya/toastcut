const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs'); // fs for checking existence

let ffmpegProcess = null;
let mainWindow;

// Determine the correct path to FFmpeg and FFprobe
const getBinaryPath = (binaryName) => {
  let executablePath;

  if (app.isPackaged) {
    const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked');

    if (binaryName === 'ffmpeg') {
      const platformDir = process.platform === 'win32' ? 'win' : 'linux';
      const binaryExt = process.platform === 'win32' ? '.exe' : '';
      executablePath = path.join(unpackedPath, 'assets', 'bin', platformDir, `ffmpeg${binaryExt}`);
    } else if (binaryName === 'ffprobe') {
      const ffprobeBinDir = path.join(unpackedPath, 'node_modules', 'ffprobe-static', 'bin', process.platform, process.arch);
      executablePath = path.join(ffprobeBinDir, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
    }
  } else {
    // Development Environment Fallback
    if (binaryName === 'ffmpeg') {
      try {
        executablePath = require('@ffmpeg-installer/ffmpeg').path;
      } catch {
        executablePath = 'ffmpeg'; // system fallback
      }
    } else if (binaryName === 'ffprobe') {
      executablePath = require('ffprobe-static').path;
    }
  }

  // Ensure execution permissions on Unix/Linux platforms
  if (app.isPackaged && process.platform !== 'win32') {
    try {
      if (fs.existsSync(executablePath)) {
        fs.chmodSync(executablePath, '755');
      }
    } catch (chmodError) {
      console.error(`Failed to set permissions on ${binaryName}:`, chmodError);
    }
  }

  return `"${executablePath}"`;
};

const ffmpegPath = getBinaryPath('ffmpeg');
const ffprobePath = getBinaryPath('ffprobe');

app.whenReady().then(() => {

  console.log(`FFmpeg path: ${ffmpegPath}`);
  console.log(`FFprobe path: ${ffprobePath}`);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 880,
    minHeight: 580,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    },
  });

  mainWindow.setMenu(null);

  mainWindow.loadFile('index.html');

  mainWindow.on('close', () => {
    if (ffmpegProcess) {
      console.log("Terminating FFMPEG process before app closes...");
      ffmpegProcess.kill('SIGTERM');
    }
  });
});

// A handler that renderer can invoke
ipcMain.handle('show-save-dialog', async (event, options) => {
  return await dialog.showSaveDialog(options);
});

// Listen for the terminate-ffmpeg message to terminate the process from the renderer
ipcMain.on('terminate-ffmpeg', () => {
  if (ffmpegProcess) {
    console.log("Terminating FFMPEG process...");
    ffmpegProcess.kill('SIGTERM');
    ffmpegProcess = null;
  }
});

// Run the FFMPEG process based on the received command
ipcMain.on('run-ffmpeg', (event, ffmpegCommand) => {
  if (ffmpegProcess) {
    console.log("Terminating existing FFMPEG process before starting a new one...");
    ffmpegProcess.kill('SIGTERM');
    ffmpegProcess = null;
  }

  const finalFfmpegCommand = `${ffmpegPath} ${ffmpegCommand}`;
  console.log(`Executing command: ${finalFfmpegCommand}`);

  ffmpegProcess = exec(finalFfmpegCommand, (error, stdout, stderr) => {
    if (error) {
      console.error(`FFMPEG execution error: ${error}`);
      event.sender.send('ffmpeg-error', `Execution failed: ${error.message}`);
      ffmpegProcess = null;
      return;
    }
  });

  ffmpegProcess.stderr.on('data', (data) => {
    event.sender.send('ffmpeg-progress', data.toString());
  });

  ffmpegProcess.on('close', (code) => {
    console.log(`FFMPEG process closed with code ${code}`);
    if (code === 0) {
      event.sender.send('ffmpeg-success', 'FFMPEG process completed successfully.');
    } else {
      event.sender.send('ffmpeg-error', `FFMPEG process failed with code: ${code}`);
    }
    ffmpegProcess = null;
  });

  ffmpegProcess.on('error', (error) => {
    console.error(`FFMPEG process error event: ${error}`);
    event.sender.send('ffmpeg-error', `Process error: ${error.message}`);
    ffmpegProcess = null;
  });
});

ipcMain.on('run-ffprobe', (event, filePath) => {
  if (!filePath) {
    event.sender.send('ffprobe-result', { error: 'No file path provided.' });
    return;
  }

  const command = `${ffprobePath} -v quiet -print_format json -show_format -select_streams v:0 -show_streams "${filePath}"`;
  console.log(`Executing ffprobe command: ${command}`);

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`FFprobe execution error: ${error}`);
      event.sender.send('ffprobe-result', { error: error.message, stderr: stderr });
      return;
    }

    try {
      const ffprobeData = JSON.parse(stdout);
      event.sender.send('ffprobe-result', { data: ffprobeData });
    } catch (parseError) {
      console.error(`Failed to parse ffprobe JSON output: ${parseError}`);
      event.sender.send('ffprobe-result', { error: 'Failed to parse ffprobe output.', parseError: parseError.message, stdout: stdout });
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
