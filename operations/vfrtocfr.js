// operations/vfrToCfr.js
const path = require('path');
const fs = require('fs');

// Function to provide the HTML for the VFRtoCFR operation UI
function getUIHtml() {
    return `
        <label>Framerate:</label>
        <div style="margin-bottom: 10px;">
            <input type="number" id="framerateSelect" class="border p-2 rounded w-full" value="30" min="1">
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
    `;
}

// VFRtoCFR operation doesn't have specific event listeners for its UI elements
function attachEventListeners(containerElement, videoPreviewElement) {
    // No specific listeners needed
}

// Function to construct the FFMPEG command for VFRtoCFR
// Needs access to the main selected file path and the container element for inputs
function getFFmpegCommand(selectedFilePath, containerElement) {
    const framerateInput = containerElement.querySelector('#framerateSelect');
    const outputFileNameInput = containerElement.querySelector('#outputFileName');
    const cudaBox = containerElement.querySelector('#useaccel');

     if (!framerateInput || !outputFileNameInput) {
         console.error("VFRtoCFR module: Could not find all required input elements.");
        alert('Internal error: Missing input fields for VFR to CFR operation.');
        return null; // Indicate validation failure
    }

    const framerate = framerateInput.value;
    const outputFileName = outputFileNameInput.value;

    if (!framerate || !outputFileName) {
        alert('Please fill out all fields for the operation!');
        return null; // Indicate validation failure
    }

    let usecuda = '';
    if (cudaBox && cudaBox.checked) {
        usecuda = "-hwaccel cuda";
    }

    // Construct the FFMPEG command
    const outputFile = outputFileName + ".mp4";
    // Ensure paths are quoted to handle spaces
    const ffmpegCommand = `-y ${usecuda} -i "${selectedFilePath}" -filter:v fps=${framerate} -vsync cfr "${outputFile}"`;

    return { command: ffmpegCommand, outputFile: outputFile }; // Return command and output file name
}

// Export the functions
module.exports = {
    getUIHtml,
    attachEventListeners, // Export even if empty, for consistency
    getFFmpegCommand
};
