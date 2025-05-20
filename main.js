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
    // In a packaged app, use process.resourcesPath which points to 'YourApp.app/Contents/Resources' (macOS)
    // or 'YourApp/resources' (Windows/Linux).
    // Binaries are now inside 'app.asar.unpacked/node_modules/'
    const unpackedNodeModulesPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules');

    if (binaryName === 'ffmpeg') {
      // ffmpeg-static on Windows typically puts ffmpeg.exe directly in its root
      // On other platforms, it's just 'ffmpeg'
      const ffmpegDir = path.join(unpackedNodeModulesPath, 'ffmpeg-static');
      executablePath = path.join(ffmpegDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    } else if (binaryName === 'ffprobe') {
      // ffprobe-static has a nested structure: node_modules/ffprobe-static/bin/${platform}/${arch}/ffprobe(.exe)
      const ffprobeBinDir = path.join(unpackedNodeModulesPath, 'ffprobe-static', 'bin', process.platform, process.arch);
      executablePath = path.join(ffprobeBinDir, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
    }
  } else {
    // In development, use the paths provided by ffmpeg-static and ffprobe-static packages
    if (binaryName === 'ffmpeg') {
      executablePath = require('ffmpeg-static'); // This gets the path directly from the package
    } else if (binaryName === 'ffprobe') {
      executablePath = require('ffprobe-static').path; // This gets the path from the 'path' property
    }
  }

  // Ensure path is quoted if it contains spaces (crucial for child_process.exec)
  return `"${executablePath}"`;
};

const ffmpegPath = getBinaryPath('ffmpeg');
const ffprobePath = getBinaryPath('ffprobe');

app.whenReady().then(() => {

  console.log(`FFmpeg path: ${ffmpegPath}`);
  console.log(`FFprobe path: ${ffprobePath}`);

  mainWindow = new BrowserWindow({
    width: 500,
    height: 1000,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, 
      enableRemoteModule: true, 
    },
  });
  mainWindow.removeMenu()

  // Load your index.html file
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
    ffmpegProcess.kill('SIGTERM'); // Use SIGTERM to terminate the process more reliably
    ffmpegProcess = null; // Reset the reference
  }
});

// Run the FFMPEG process based on the received command
ipcMain.on('run-ffmpeg', (event, ffmpegCommand) => {
  // Ensure any previous process is terminated before starting a new one
  if (ffmpegProcess) {
    console.log("Terminating existing FFMPEG process before starting a new one...");
    ffmpegProcess.kill('SIGTERM');
    ffmpegProcess = null;
  }

  // Prepend the correct ffmpegPath to the command
  const finalFfmpegCommand = `${ffmpegPath} ${ffmpegCommand}`;
  console.log(`Executing command: ${finalFfmpegCommand}`); // Log the command

  ffmpegProcess = exec(finalFfmpegCommand, (error, stdout, stderr) => {
    if (error) {
      console.error(`FFMPEG execution error: ${error}`);
      event.sender.send('ffmpeg-error', `Execution failed: ${error.message}`);
      ffmpegProcess = null; // Reset reference on completion/failure
      return;
    }
  });

  ffmpegProcess.stderr.on('data', (data) => {
    event.sender.send('ffmpeg-progress', data.toString());
  });

  // Handle process completion or failure
  ffmpegProcess.on('close', (code) => {
    console.log(`FFMPEG process closed with code ${code}`); // Log close code
    if (code === 0) {
      event.sender.send('ffmpeg-success', 'FFMPEG process completed successfully.');
    } else {
      event.sender.send('ffmpeg-error', `FFMPEG process failed with code: ${code}`);
    }

    // Reset the ffmpegProcess reference after it has closed
    ffmpegProcess = null;
  });

   ffmpegProcess.on('error', (error) => {
       console.error(`FFMPEG process error event: ${error}`);
       event.sender.send('ffmpeg-error', `Process error: ${error.message}`);
       ffmpegProcess = null; // Reset reference on error
   });
});

ipcMain.on('run-ffprobe', (event, filePath) => {
    if (!filePath) {
        event.sender.send('ffprobe-result', { error: 'No file path provided.' });
        return;
    }

    // Use the determined ffprobePath
    const command = `${ffprobePath} -v quiet -print_format json -show_format -select_streams v:0 -show_streams "${filePath}"`;
    console.log(`Executing ffprobe command: ${command}`); // Log the ffprobe command

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`FFprobe execution error: ${error}`);
            // Send error details back to renderer
            event.sender.send('ffprobe-result', { error: error.message, stderr: stderr });
            return;
        }

        try {
            // Parse the JSON output from ffprobe
            const ffprobeData = JSON.parse(stdout);
            // Send the parsed data back to the renderer
            event.sender.send('ffprobe-result', { data: ffprobeData });
        } catch (parseError) {
            console.error(`Failed to parse ffprobe JSON output: ${parseError}`);
             // Send parsing error back to renderer
            event.sender.send('ffprobe-result', { error: 'Failed to parse ffprobe output.', parseError: parseError.message, stdout: stdout });
        }
    });
});
// Quit the app when all windows are closed (except on macOS, sorry)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Add a listener for the 'activate' event on macOS to recreate a window if necessary
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow(); // I don't think this does anything yet
  }
});
