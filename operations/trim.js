// operations/trim.js
const path = require('path');
const fs = require('fs');

// Function to provide the HTML for the TRIM operation UI
function getUIHtml() {
    return `
        <label>Start Time (HH:MM:SS):</label>
        <div style="display: flex;">
            <input type="text" style="margin-right: 10px;" id="startTime" value="00:00:00">
            <input class="btn1" type="button" value="Apply timestamp">
        </div>
        <label>End Time (HH:MM:SS):</label>
        <div style="display: flex;">
            <input type="text" style="margin-right: 10px;" id="endTime" value="00:00:00">
            <input class="btn2" type="button" value="Apply timestamp">
        </div>
        <label>Output File Name:</label>
        <div style="display: flex;">
            <input type="text" id="outputFileName">
            <label style="align-content: center;">.mp4</label>
        </div>
        <label class="flex items-center">
            Use Cuda HW-Acceleration:
            <input type="checkbox" id="useaccel" value="-hwaccel cuda" class="mr-2">
        </label>
    `;
}

// Function to attach event listeners specific to the TRIM UI
// Needs access to the container div and the video element
function attachEventListeners(containerElement, videoPreviewElement) {
    const startButton = containerElement.querySelector(".btn1");
    const endButton = containerElement.querySelector(".btn2");

    if (startButton && endButton) {
        startButton.addEventListener('click', () => {
            const formattedStartTime = formatTime(videoPreviewElement.currentTime);
            containerElement.querySelector('#startTime').value = formattedStartTime;
        });

        endButton.addEventListener('click', () => {
            const formattedEndTime = formatTime(videoPreviewElement.currentTime);
            containerElement.querySelector('#endTime').value = formattedEndTime;
        });
    }
}

// Helper function 
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secondsLeft = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secondsLeft.toString().padStart(2, '0')}`;
}


// Function to construct the FFMPEG command for TRIM
// Needs access to the main selected file path
function getFFmpegCommand(selectedFilePath, containerElement) {
    const startTime = containerElement.querySelector('#startTime').value;
    const endTime = containerElement.querySelector('#endTime').value;
    const outputFileName = containerElement.querySelector('#outputFileName').value;
    const cudaBox = containerElement.querySelector('#useaccel');

    if (!startTime || !endTime || !outputFileName) {
        alert('Please fill out all fields for the Trim operation!');
        return null; // Indicate validation failure
    }

    let usecuda = '';
    if (cudaBox && cudaBox.checked) {
        usecuda = "-hwaccel cuda";
    }

    // Construct the command
    const outputFile = outputFileName + ".mp4";
    const ffmpegCommand = `ffmpeg -y ${usecuda} -ss ${startTime} -to ${endTime} -i "${selectedFilePath}" -c copy "${outputFile}"`;

    return { command: ffmpegCommand, outputFile: outputFile }; // Return command and output file name
}

// Export the functions
module.exports = {
    getUIHtml,
    attachEventListeners,
    getFFmpegCommand
};