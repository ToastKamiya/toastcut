// operations/bitrate.js
const path = require('path');
const fs = require('fs');
const { ipcRenderer } = require('electron'); // Need ipcRenderer to talk to main process

// State local to BITRATE operation module
let inputVideoData = null; // To store data from ffprobe (duration, bitrate, size)

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
            Overall Bitrate: <span id="inputBitrate">N/A</span>
        </div>

        <div id="outputEstimate" class="mt-4 text-sm text-gray-700">
            <strong>Estimated Output:</strong><br>
            Estimated Size: <span id="estimatedSize">N/A</span><br>
            Estimated Bitrate: <span id="estimatedBitrate">N/A</span>
        </div>

        <label class="mt-4">Output File Name:</label>
        <div style="display: flex; margin-bottom: 10px;">
            <input type="text" id="outputFileName" class="border p-2 rounded w-full">
            <label style="align-content: center; padding-left: 10px;">.mp4</label>
        </div>
        <label class="flex items-center mt-2">
            <input type="checkbox" id="useaccel" value="-hwaccel cuda" class="mr-2">
            Use Cuda HW-Acceleration:
        </label>
    `;
}

// Function to attach event listeners specific to the BITRATE UI
// Needs access to the container div. It will access selectedFilePath from the outer scope.
function attachEventListeners(containerElement, videoPreviewElement) { // videoPreviewElement is passed but not used here
    const bitrateSelect = containerElement.querySelector('#bitrateSelect');
    const crfValueSpan = containerElement.querySelector('#crfValue');
    const inputSizeSpan = containerElement.querySelector('#inputSize');
    const inputDurationSpan = containerElement.querySelector('#inputDuration');
    const inputBitrateSpan = containerElement.querySelector('#inputBitrate');
    const estimatedSizeSpan = containerElement.querySelector('#estimatedSize');
    const estimatedBitrateSpan = containerElement.querySelector('#estimatedBitrate');


    if (bitrateSelect && crfValueSpan && inputSizeSpan && inputDurationSpan && inputBitrateSpan && estimatedSizeSpan && estimatedBitrateSpan) {
        // Set initial displayed CRF value
        crfValueSpan.innerText = bitrateSelect.value;

        // Add event listener for slider input to update display and estimate
        bitrateSelect.addEventListener('input', (event) => {
            const currentCrf = event.target.value;
            crfValueSpan.innerText = currentCrf;
            updateOutputEstimate(containerElement, currentCrf);
        });

        // --- FFprobe Data Fetching ---
        // Access selectedFilePath directly from the outer scope (renderer.js)
        if (selectedFilePath) {
            console.log("BITRATE module: Requesting FFprobe data for:", selectedFilePath);
            // Send IPC message to main process to run ffprobe
            ipcRenderer.send('run-ffprobe', selectedFilePath);

            // Listen for the ffprobe result
            const handleFFprobeResult = (event, result) => {
                // Remove the listener after receiving the result to avoid duplicates
                ipcRenderer.removeListener('ffprobe-result', handleFFprobeResult);

                if (result.error) {
                    console.error("FFprobe Error:", result.error);
                    inputSizeSpan.innerText = `Error: ${result.error}`;
                    inputDurationSpan.innerText = 'N/A';
                    inputBitrateSpan.innerText = 'N/A';
                    estimatedSizeSpan.innerText = 'N/A';
                    estimatedBitrateSpan.innerText = 'N/A';
                    inputVideoData = null; // Clear previous data
                } else if (result.data && result.data.format) {
                    inputVideoData = result.data.format;
                    console.log("FFprobe Data received:", inputVideoData); // Log received data

                    // Display input info
                    const sizeBytes = parseInt(inputVideoData.size, 10);
                    inputSizeSpan.innerText = sizeBytes ? formatBytes(sizeBytes) : 'N/A';

                    const durationSeconds = parseFloat(inputVideoData.duration);
                    inputDurationSpan.innerText = durationSeconds ? formatDuration(durationSeconds) : 'N/A';

                    const bitrateBps = parseInt(inputVideoData.bit_rate, 10);
                     // Store bitrate in bits per second (bps)
                    inputVideoData.bit_rate_bps = bitrateBps;
                    inputBitrateSpan.innerText = bitrateBps ? formatBitrate(bitrateBps) : 'N/A';


                    // Update the initial output estimate based on fetched data and default slider value
                    updateOutputEstimate(containerElement, bitrateSelect.value);

                } else {
                    console.error("FFprobe returned unexpected data:", result);
                     inputSizeSpan.innerText = 'Error fetching data';
                    inputDurationSpan.innerText = 'N/A';
                    inputBitrateSpan.innerText = 'N/A';
                    estimatedSizeSpan.innerText = 'N/A';
                    estimatedBitrateSpan.innerText = 'N/A';
                    inputVideoData = null; // Clear previous data
                }
            };

            // Attach the listener
            ipcRenderer.on('ffprobe-result', handleFFprobeResult);

        } else {
            console.warn("BITRATE module: No selected file path to run FFprobe.");
             inputSizeSpan.innerText = 'No file selected';
            inputDurationSpan.innerText = 'N/A';
            inputBitrateSpan.innerText = 'N/A';
            estimatedSizeSpan.innerText = 'N/A';
            estimatedBitrateSpan.innerText = 'N/A';
            inputVideoData = null; // Clear previous data
        }

    } else {
         console.error("BITRATE module: Could not find all required UI elements to attach listeners.");
    }
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

// Function to estimate output bitrate based on input bitrate and CRF
// This is a simplified estimation and will not be perfectly accurate.
function estimateOutputBitrate(inputBitrateBps, durationSeconds, crf) {
    if (!inputBitrateBps || !durationSeconds) {
        return null; // Cannot estimate without input data
    }

    // --- Simplified Estimation Model ---
    // This model is based on general observations and is NOT a precise formula.
    // It assumes a relationship between CRF and bitrate reduction relative to a baseline.
    // A typical "good quality" might be around CRF 23.
    // Let's assume a baseline bitrate ratio at CRF 23 (e.g., 50% of original, or a fixed value).
    // A simpler approach is to model the bitrate as decreasing exponentially with increasing CRF.
    // Bitrate(CRF) = BaseBitrate * exp(-k * CRF)
    // We need to pick a BaseBitrate and k. This is highly empirical.
    // Let's try a simpler linear scaling relative to the input bitrate,
    // with some assumptions about the range.
    // Assume CRF 0 is ~100% of original (or higher if lossless)
    // Assume CRF 51 is a very low percentage (e.g., 5-10%)
    // Assume CRF 23 is somewhere in the middle (e.g., 30-60%)

    // Let's use a simplified inverse linear relationship for demonstration:
    // Estimated Bitrate Ratio = (MaxCRF - CRF) / MaxCRF * (MaxRatio - MinRatio) + MinRatio
    // Where MaxCRF = 51, MaxRatio (at CRF 0) = 1.0 (or more), MinRatio (at CRF 51) = 0.05
    // Let's use MaxRatio = 1.2 (assuming CRF 0 can be slightly higher than original) and MinRatio = 0.05

    const maxCrf = 51;
    const maxRatio = 1.2; // Estimated bitrate ratio at CRF 0
    const minRatio = 0.05; // Estimated bitrate ratio at CRF 51

    // Ensure CRF is within bounds
    const clampedCrf = Math.max(0, Math.min(maxCrf, crf));

    // Calculate the ratio based on the clamped CRF
    const bitrateRatio = ((maxCrf - clampedCrf) / maxCrf) * (maxRatio - minRatio) + minRatio;

    // Estimated output bitrate
    const estimatedBitrate = inputBitrateBps * bitrateRatio;

    // Ensure estimated bitrate is not negative or zero (shouldn't happen with this model, but as a safeguard)
    return Math.max(1, estimatedBitrate); // Minimum 1 bps to avoid division by zero or zero size
}


// Function to update the estimated output size and bitrate display
function updateOutputEstimate(containerElement, currentCrf) {
    const estimatedSizeSpan = containerElement.querySelector('#estimatedSize');
    const estimatedBitrateSpan = containerElement.querySelector('#estimatedBitrate');

    if (!estimatedSizeSpan || !estimatedBitrateSpan) {
         console.error("BITRATE module: Could not find estimated output UI elements.");
        return;
    }

    if (inputVideoData && inputVideoData.bit_rate_bps && inputVideoData.duration) {
        const inputBitrateBps = inputVideoData.bit_rate_bps;
        const durationSeconds = parseFloat(inputVideoData.duration);

        const estimatedBitrateBps = estimateOutputBitrate(inputBitrateBps, durationSeconds, parseInt(currentCrf, 10));

        if (estimatedBitrateBps !== null) {
            // Estimated size = Estimated Bitrate (bps) * Duration (s) / 8 (bits to bytes)
            const estimatedSizeBytes = (estimatedBitrateBps * durationSeconds) / 8;

            estimatedBitrateSpan.innerText = formatBitrate(estimatedBitrateBps);
            estimatedSizeSpan.innerText = formatBytes(estimatedSizeBytes);
        } else {
             estimatedBitrateSpan.innerText = 'N/A';
             estimatedSizeSpan.innerText = 'N/A';
        }

    } else {
        // Input data not available yet or error occurred
        estimatedBitrateSpan.innerText = 'N/A';
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
        // Note: Using -hwaccel cuda with libx264 might not be the most efficient way
        // to use hardware acceleration for encoding. You might need to use a different
        // encoder like h264_nvenc if CUDA is available and you want hardware encoding.
        // The current command uses libx264 which is a CPU-based encoder by default.
        // If you intend hardware encoding, the command needs to be adjusted.
         console.warn("BITRATE module: CUDA acceleration checkbox selected, but command uses libx264 (CPU encoder). Consider using a hardware encoder like h264_nvenc if available.");
    }

    // Construct the FFMPEG command
    const outputFile = outputFileName + ".mp4";
    // Ensure paths are quoted to handle spaces
    // Using -crf for constant quality encoding
    const ffmpegCommand = `ffmpeg -y ${usecuda} -i "${selectedFilePath}" -c:v libx264 -crf ${bitrate} "${outputFile}"`;

    return { command: ffmpegCommand, outputFile: outputFile }; // Return command and output file name
}

// Export the functions
module.exports = {
    getUIHtml,
    attachEventListeners,
    getFFmpegCommand
};
