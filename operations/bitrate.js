// operations/bitrate.js
const path = require('path');
const fs = require('fs');

// Function to provide the HTML for the BITRATE operation UI
function getUIHtml() {
    return `
        <label>Compression (CRF): <span id="crfValue">0</span></label>
        <div style="margin-bottom: 10px;">
            <input type="range" min="0" max="51" value="0" class="slider w-full" id="bitrateSelect">
        </div>
        <label>Output File Name:</label>
        <div style="display: flex; margin-bottom: 10px;">
            <input type="text" id="outputFileName" class="border p-2 rounded w-full">
            <label style="align-content: center; padding-left: 10px;">.mp4</label>
        </div>
        <label class="flex items-center">
            Use Cuda HW-Acceleration:
            <input type="checkbox" id="useaccel" value="-hwaccel cuda" class="mr-2">
        </label>
        <p class="text-sm text-gray-600 mt-1">Lower CRF means higher quality and larger file size (0 is lossless, ~23 is default, 51 is worst quality).</p>
    `;
}

// Function to attach event listeners specific to the BITRATE UI
// Needs access to the container div
function attachEventListeners(containerElement) {
    const bitrateSelect = containerElement.querySelector('#bitrateSelect');
    const crfValueSpan = containerElement.querySelector('#crfValue');

    if (bitrateSelect && crfValueSpan) {
        // Update the displayed CRF value when the slider moves
        crfValueSpan.innerText = bitrateSelect.value; // Set initial value
        bitrateSelect.addEventListener('input', (event) => {
            crfValueSpan.innerText = event.target.value;
        });
    } else {
         console.error("BITRATE module: Could not find slider or value span.");
    }
}

// Function to construct the FFMPEG command for BITRATE
// Needs access to the main selected file path and the container element for inputs
function getFFmpegCommand(selectedFilePath, containerElement) {
    const bitrateSelect = containerElement.querySelector('#bitrateSelect');
    const outputFileNameInput = containerElement.querySelector('#outputFileName');
    const cudaBox = containerElement.querySelector('#useaccel');

     if (!bitrateSelect || !outputFileNameInput) {
         console.error("BITRATE module: Could not find all required input elements.");
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
        usecuda = "-hwaccel h264_nvenc";
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
