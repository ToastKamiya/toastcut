// operations/mergeAudio.js
const path = require('path');
const fs = require('fs');

function getUIHtml() {
    // Updated UI: Removed the separate audio file input
    return `
        <p>Video: <strong>(already selected above)</strong></p>
        <p>This operation will merge all audio tracks within the selected video into a single stereo track.</p>
        <label>Output File Name:</label>
        <div style="display: flex; margin-bottom: 10px;">
            <input type="text" id="outputFileName" class="border p-2 rounded w-full">
            <label style="align-content: center; padding-left: 10px;">.mp4</label>
        </div>
        `;
}

// Function to attach event listeners specific to the MERGE UI
// No specific listeners are needed for this operation's UI
function attachEventListeners(containerElement) {
    console.log("MERGE module: No specific event listeners needed for this operation.");
}

// Function to construct the FFMPEG command for MERGE (merging internal audio tracks)
// Needs access to the main selected file path and the container element for inputs
// Does NOT need a separate audioFilePath
function getFFmpegCommand(selectedFilePath, containerElement) {
    const outputFileNameInput = containerElement.querySelector('#outputFileName');

    if (!outputFileNameInput) {
         console.error("MERGE module: Could not find output file name input.");
        alert('Internal error: Missing input fields for Merge operation.');
        return null; // Indicate validation failure
    }

    const outputFileName = outputFileNameInput.value;

    // Updated validation: Only selected video and output file name are required
    if (!selectedFilePath || !outputFileName) {
        alert('Please select a video and provide an output file name!');
        return null; // Indicate validation failure
    }

    const outputFile = outputFileName + ".mp4";

    const ffmpegCommand = `-y -i "${selectedFilePath}" -map 0:v:0 -map 0:a -c:v copy -c:a aac -b:a 192k -ac 2 "${outputFile}"`;
    // -map 0:v:0: Selects the first video stream from input 0
    // -map 0:a: Selects ALL audio streams from input 0
    // -c:v copy: Copies the video stream without re-encoding
    // -c:a aac: Re-encodes audio to AAC
    // -b:a 192k: Sets audio bitrate to 192 kbps (adjust as needed)
    // -ac 2: Sets audio channels to 2 (stereo)

    return { command: ffmpegCommand, outputFile: outputFile }; // Return command and output file name
}

// Export the functions
module.exports = {
    getUIHtml,
    attachEventListeners,
    getFFmpegCommand
};
