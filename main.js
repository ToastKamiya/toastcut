const { app, BrowserWindow, ipcMain } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const ffprobePath = require('ffprobe-static').path; // Use ffprobe-static to get ffprobe path

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

  console.log(`Executing command: ${ffmpegCommand}`); // Log the command

  ffmpegProcess = exec(ffmpegCommand, (error, stdout, stderr) => {
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

    // Use ffprobePath from ffprobe-static
    const command = `"${ffprobePath}" -v quiet -print_format json -show_format -select_streams v:0 -show_streams "${filePath}"`;
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
