// operations/bitrate.js
const path = require('path');
const fs = require('fs');
const { ipcRenderer } = require('electron'); // Need ipcRenderer to talk to main process

// State local to BITRATE operation module
let inputVideoData = null; // To store data from ffprobe (format and video stream)
let currentContainerElement = null; // Store the container element reference

// Function to provide the HTML for the BITRATE operation UI
function getUIHtml() {
    return `
        <label>Compression (CRF): <span id="crfValue">23</span></label>
        <div style="margin-bottom: 10px;">
            <input type="range" min="0" max="51" value="23" class="slider w-full" id="bitrateSelect">
        </div>
        <p class="text-sm text-gray-600 mt-1">Lower CRF means higher quality and larger file size (0 is lossless, ~23 is default, 51 is worst quality).</p>

        <div id="inputInfo" class="mt-4 text-sm text-gray-700">
            <strong>Input Info:</strong><br>
            File Size: <span id="inputSize">N/A</span><br>
            Duration: <span id="inputDuration">N/A</span><br>
            Video Bitrate: <span id="inputVideoBitrate">N/A</span><br>
            Overall Bitrate: <span id="inputOverallBitrate">N/A</span>
        </div>
        <br>

        <div id="outputEstimate" class="mt-4 text-sm text-gray-700">
            <strong>Estimated Output:</strong><br>
            Estimated Size: <span id="estimatedSize">N/A</span><br>
            Estimated Video Bitrate: <span id="estimatedVideoBitrate">N/A</span>
        </div>
        <br>

        <label class="mt-4">Output File Name:</label>
        <div style="display: flex; margin-bottom: 10px;">
            <input type="text" id="outputFileName" class="border p-2 rounded w-full">
            <label style="align-content: center; padding-left: 10px;">.mp4</label>
        </div>
        <label class="flex items-center mt-2">
            Use Cuda HW-Acceleration:
            <input type="checkbox" id="useaccel" value="-hwaccel cuda" class="mr-2">
        </label>
    `;
}

// Function to attach event listeners specific to the BITRATE UI
// Needs access to the container div. It will access selectedFilePath from the outer scope.
function attachEventListeners(containerElement, videoPreviewElement) { // videoPreviewElement is passed but not used here
    currentContainerElement = containerElement; // Store the container element

    const bitrateSelect = containerElement.querySelector('#bitrateSelect');
    const crfValueSpan = containerElement.querySelector('#crfValue');

    if (bitrateSelect && crfValueSpan) {
        // Set initial displayed CRF value
        crfValueSpan.innerText = bitrateSelect.value;

        // Add event listener for slider input to update display and estimate
        bitrateSelect.addEventListener('input', (event) => {
            const currentCrf = event.target.value;
            crfValueSpan.innerText = currentCrf;
            updateOutputEstimate(currentContainerElement, currentCrf); // Use stored container
        });

        // Trigger initial FFprobe data fetch
        fetchAndDisplayFileInfo(selectedFilePath, currentContainerElement); // Access selectedFilePath from outer scope

    } else {
         console.error("BITRATE module: Could not find required UI elements to attach listeners.");
    }
}

// --- FFprobe Data Fetching and Display ---

// Function to fetch FFprobe data and update the UI
function fetchAndDisplayFileInfo(filePath, containerElement) {
    const inputSizeSpan = containerElement.querySelector('#inputSize');
    const inputDurationSpan = containerElement.querySelector('#inputDuration');
    const inputVideoBitrateSpan = containerElement.querySelector('#inputVideoBitrate');
    const inputOverallBitrateSpan = containerElement.querySelector('#inputOverallBitrate');
    const estimatedSizeSpan = containerElement.querySelector('#estimatedSize');
    const estimatedVideoBitrateSpan = containerElement.querySelector('#estimatedVideoBitrate');
    const bitrateSelect = containerElement.querySelector('#bitrateSelect'); // Need slider value for initial estimate

    // Clear previous info and estimates
    inputSizeSpan.innerText = 'Fetching...';
    inputDurationSpan.innerText = 'Fetching...';
    inputVideoBitrateSpan.innerText = 'Fetching...';
    inputOverallBitrateSpan.innerText = 'Fetching...';
    estimatedSizeSpan.innerText = 'N/A';
    estimatedVideoBitrateSpan.innerText = 'N/A';
    inputVideoData = null; // Clear previous data

    if (!filePath) {
        console.warn("BITRATE module: No file path provided for FFprobe.");
        inputSizeSpan.innerText = 'No file selected';
        inputDurationSpan.innerText = 'N/A';
        inputVideoBitrateSpan.innerText = 'N/A';
        inputOverallBitrateSpan.innerText = 'N/A';
        estimatedSizeSpan.innerText = 'N/A';
        estimatedVideoBitrateSpan.innerText = 'N/A';
        return;
    }

    console.log("BITRATE module: Requesting FFprobe data for:", filePath);
    // Send IPC message to main process to run ffprobe
    ipcRenderer.send('run-ffprobe', filePath);

    // Listen for the ffprobe result
    // Use a unique listener function name or remove listener to avoid duplicates
    const handleFFprobeResult = (event, result) => {
        // Remove the listener after receiving the result
        ipcRenderer.removeListener('ffprobe-result', handleFFprobeResult);

        if (result.error) {
            console.error("FFprobe Error:", result.error);
            inputSizeSpan.innerText = `Error: ${result.error}`;
            inputDurationSpan.innerText = 'N/A';
            inputVideoBitrateSpan.innerText = 'N/A';
            inputOverallBitrateSpan.innerText = 'N/A';
            estimatedSizeSpan.innerText = 'N/A';
            estimatedVideoBitrateSpan.innerText = 'N/A';
            inputVideoData = null; // Clear previous data
        } else if (result.data && result.data.format) {
            inputVideoData = result.data; // Store the whole data object

            // Find the video stream
            const videoStream = inputVideoData.streams.find(stream => stream.codec_type === 'video');

            console.log("FFprobe Data received:", inputVideoData); // Log received data
            console.log("Video Stream:", videoStream); // Log video stream data

            // Display input info
            const sizeBytes = parseInt(inputVideoData.format.size, 10);
            inputSizeSpan.innerText = sizeBytes ? formatBytes(sizeBytes) : 'N/A';

            const durationSeconds = parseFloat(inputVideoData.format.duration);
            inputDurationSpan.innerText = durationSeconds ? formatDuration(durationSeconds) : 'N/A';

            const overallBitrateBps = parseInt(inputVideoData.format.bit_rate, 10);
            inputOverallBitrateSpan.innerText = overallBitrateBps ? formatBitrate(overallBitrateBps) : 'N/A';


            let videoBitrateBps = null;
            if (videoStream && videoStream.bit_rate) {
                 videoBitrateBps = parseInt(videoStream.bit_rate, 10);
                 inputVideoBitrateSpan.innerText = formatBitrate(videoBitrateBps);
            } else {
                 inputVideoBitrateSpan.innerText = 'N/A (Bitrate not reported for video stream)';
                 console.warn("FFprobe did not report bitrate for the video stream.");
            }

            // Store video bitrate and duration if available for estimation
            if (videoBitrateBps && durationSeconds) {
                 inputVideoData.video_bitrate_bps = videoBitrateBps;
                 inputVideoData.duration_seconds = durationSeconds;
                 // Update the initial output estimate based on fetched data and current slider value
                 if(bitrateSelect) updateOutputEstimate(containerElement, bitrateSelect.value);
            } else {
                 console.warn("Cannot estimate output size/bitrate: Missing video bitrate or duration.");
                 estimatedSizeSpan.innerText = 'N/A (Cannot estimate)';
                 estimatedVideoBitrateSpan.innerText = 'N/A (Cannot estimate)';
            }


        } else {
            console.error("FFprobe returned unexpected data structure:", result);
             inputSizeSpan.innerText = 'Error fetching data';
            inputDurationSpan.innerText = 'N/A';
            inputVideoBitrateSpan.innerText = 'N/A';
            inputOverallBitrateSpan.innerText = 'N/A';
            estimatedSizeSpan.innerText = 'N/A';
            estimatedVideoBitrateSpan.innerText = 'N/A';
            inputVideoData = null; // Clear previous data
        }
    };

    // Attach the listener
    ipcRenderer.on('ffprobe-result', handleFFprobeResult);
}


// Helper function to format bytes into a human-readable string
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Helper function to format duration in HH:MM:SS
function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Helper function to format bitrate in human-readable units (bps, kbps, Mbps)
function formatBitrate(bps, decimals = 2) {
     if (bps === 0) return '0 bps';
    const k = 1000; // Use 1000 for bitrates (kbps, Mbps)
    const dm = decimals < 0 ? 0 : decimals;
    const units = ['bps', 'kbps', 'Mbps', 'Gbps', 'Tbps'];
    const i = Math.floor(Math.log(bps) / Math.log(k));
    return parseFloat((bps / Math.pow(k, i)).toFixed(dm)) + ' ' + units[i];
}


// --- Estimation Logic ---

// Function to estimate output video bitrate based on input video bitrate and CRF
// This is a simplified exponential model based on general x264 behavior.
// It's an approximation and accuracy will vary.
function estimateOutputVideoBitrate(inputVideoBitrateBps, crf) {
    if (!inputVideoBitrateBps) {
        return null; // Cannot estimate without input video bitrate
    }

    // --- Exponential Estimation Model (Revised based on new data) ---
    // Model: Estimated Bitrate Ratio = A * exp(-k * CRF)
    // Aiming for a better fit across observed points:
    // CRF 0: Ratio ~10x (your data) => A = 10.0
    // CRF 20: Ratio ~0.9x (your data)
    // Using A=10.0, solve for k at CRF 20, Ratio 0.9:
    // 0.9 = 10.0 * exp(-k * 20)
    // 0.09 = exp(-k * 20)
    // ln(0.09) = -k * 20
    // k = -ln(0.09) / 20 ≈ 0.1204

    const A = 10.0; // Estimated ratio at CRF 0 (based on your data)
    const k = 0.1204; // Decay factor (calculated to fit CRF 20 data)

    // Ensure CRF is within bounds
    const clampedCrf = Math.max(0, Math.min(51, crf));

    // Calculate the estimated ratio
    const bitrateRatio = A * Math.exp(-k * clampedCrf);

    // Estimated output video bitrate
    const estimatedBitrate = inputVideoBitrateBps * bitrateRatio;

    // Ensure estimated bitrate is not negative or zero
    return Math.max(1, estimatedBitrate); // Minimum 1 bps
}


// Function to update the estimated output size and bitrate display
function updateOutputEstimate(containerElement, currentCrf) {
    const estimatedSizeSpan = containerElement.querySelector('#estimatedSize');
    const estimatedVideoBitrateSpan = containerElement.querySelector('#estimatedVideoBitrate');

    if (!estimatedSizeSpan || !estimatedVideoBitrateSpan) {
         console.error("BITRATE module: Could not find estimated output UI elements.");
        return;
    }

    // Use the stored video bitrate and duration for estimation
    if (inputVideoData && inputVideoData.video_bitrate_bps && inputVideoData.duration_seconds) {
        const inputVideoBitrateBps = inputVideoData.video_bitrate_bps;
        const durationSeconds = inputVideoData.duration_seconds;

        const estimatedVideoBitrateBps = estimateOutputVideoBitrate(inputVideoBitrateBps, parseInt(currentCrf, 10));

        if (estimatedVideoBitrateBps !== null) {
            // Estimated size = Estimated Overall Bitrate (bps) * Duration (s) / 8 (bits to bytes)
            // To estimate overall bitrate, we add the original non-video bitrate to the estimated video bitrate.
            // This assumes the non-video bitrate (audio, metadata) remains roughly constant.
            const nonVideoBitrateBps = (inputVideoData.format.bit_rate || 0) - (inputVideoData.video_bitrate_bps || 0);
            const estimatedOverallBitrateBps = estimatedVideoBitrateBps + nonVideoBitrateBps; // Add non-video bitrate back

            const estimatedSizeBytes = (estimatedOverallBitrateBps * durationSeconds) / 8;


            estimatedVideoBitrateSpan.innerText = formatBitrate(estimatedVideoBitrateBps);
            estimatedSizeSpan.innerText = formatBytes(estimatedSizeBytes);
        } else {
             estimatedVideoBitrateSpan.innerText = 'N/A';
             estimatedSizeSpan.innerText = 'N/A';
        }

    } else {
        // Input data not available yet or error occurred
        estimatedVideoBitrateSpan.innerText = 'N/A';
        estimatedSizeSpan.innerText = 'N/A';
    }
}


// Function to construct the FFMPEG command for BITRATE
// Needs access to the main selected file path and the container element for inputs
function getFFmpegCommand(selectedFilePath, containerElement) {
    const bitrateSelect = containerElement.querySelector('#bitrateSelect');
    const outputFileNameInput = containerElement.querySelector('#outputFileName');
    const cudaBox = containerElement.querySelector('#useaccel');

     if (!bitrateSelect || !outputFileNameInput) {
         console.error("BITRATE module: Could not find all required input elements for command.");
        alert('Internal error: Missing input fields for Bitrate operation.');
        return null; // Indicate validation failure
    }

    const bitrate = bitrateSelect.value;
    const outputFileName = outputFileNameInput.value;

    if (!outputFileName) {
        alert('Please provide an output file name!');
        return null; // Indicate validation failure
    }

    let usecuda = '';
    if (cudaBox && cudaBox.checked) {
        usecuda = "-hwaccel cuda";
    }

    // Construct the FFMPEG command
    const outputFile = outputFileName + ".mp4";
    // Ensure paths are quoted to handle spaces
    // Using -crf for constant quality encoding
    const ffmpegCommand = `ffmpeg -y ${usecuda} -i "${selectedFilePath}" -c:v libx264 -crf ${bitrate} "${outputFile}"`;

    return { command: ffmpegCommand, outputFile: outputFile }; // Return command and output file name
}

// Function to handle file change notification from renderer.js
// This function is called by renderer.js when the main input file changes.
function handleFileChange(newFilePath, containerElement) {
    console.log("BITRATE module: Received file change notification:", newFilePath);
    // Trigger FFprobe data fetch and UI update with the new file path
    fetchAndDisplayFileInfo(newFilePath, containerElement);
}


// Export the functions
module.exports = {
    getUIHtml,
    attachEventListeners,
    getFFmpegCommand,
    handleFileChange // Export the new handler
};
