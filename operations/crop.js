// operations/crop.js
const path = require('path');
const fs = require('fs');

// Function to provide the HTML for the CROP operation UI
function getUIHtml() {
    return `
        <label>Width:</label>
        <div style="margin-bottom: 10px;">
            <input type="number" id="width" class="border p-2 rounded w-full">
        </div>
        <label>Height:</label>
        <div style="margin-bottom: 10px;">
            <input type="number" id="height" class="border p-2 rounded w-full">
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

// CROP operation doesn't have specific event listeners for its UI elements
function attachEventListeners(containerElement, videoPreviewElement) {
    // No specific listeners needed for crop inputs (number inputs handle changes automatically)
}

// Function to construct the FFMPEG command for CROP
// Needs access to the main selected file path and the container element for inputs
function getFFmpegCommand(selectedFilePath, containerElement) {
    const widthInput = containerElement.querySelector('#width');
    const heightInput = containerElement.querySelector('#height');
    const outputFileNameInput = containerElement.querySelector('#outputFileName');
    const cudaBox = containerElement.querySelector('#useaccel');

     if (!widthInput || !heightInput || !outputFileNameInput) {
         console.error("CROP module: Could not find all required input elements.");
        alert('Internal error: Missing input fields for Crop operation.');
        return null; // Indicate validation failure
    }

    const width = widthInput.value;
    const height = heightInput.value;
    const outputFileName = outputFileNameInput.value;

    if (!width || !height || !outputFileName) {
        alert('Please fill out all fields for the Crop operation!');
        return null; // Indicate validation failure
    }

    let usecuda = '';
    if (cudaBox && cudaBox.checked) {
        usecuda = "-hwaccel cuda";
    }

    // Construct the FFMPEG command
    const outputFile = outputFileName + ".mp4";
    // Ensure paths are quoted to handle spaces
    const ffmpegCommand = `ffmpeg -y ${usecuda} -i "${selectedFilePath}" -filter:v "crop=${width}:${height}" "${outputFile}"`;

    return { command: ffmpegCommand, outputFile: outputFile }; // Return command and output file name
}

// Export the functions
module.exports = {
    getUIHtml,
    attachEventListeners, // Export even if empty, for consistency
    getFFmpegCommand
};
