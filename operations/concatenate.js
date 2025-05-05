// operations/concatenate.js
const path = require('path');
const fs = require('fs');
const { webUtils } = require('electron'); // Need webUtils here

let secondFilePath = null; // State local to CONCATENATE operation

function getUIHtml() {
    return `
        <p>First video: <strong>(already selected above)</strong></p>
        <label>Choose Second Video:</label>
        <input type="file" id="secondVideoFile" accept="video/mp4">
        <label>Output File Name:</label>
        <div style="display: flex;">
            <input type="text" id="outputFileName">
            <label style="align-content: center;">.mp4</label>
        </div>
    `;
}

function attachEventListeners(containerElement) {
    containerElement.querySelector('#secondVideoFile').addEventListener('change', handleFileSelect);
}

// Helper function for handling the second file selection
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        secondFilePath = webUtils.getPathForFile(file);
    } else {
        secondFilePath = null;
    }
}

function getFFmpegCommand(selectedFilePath, containerElement) {
    const outputFileName = containerElement.querySelector('#outputFileName').value;

    if (!selectedFilePath || !secondFilePath || !outputFileName) {
        alert('Please select two videos and an output file name!');
        return null;
    }

    const outputFile = outputFileName + ".mp4";
    const concatFilePath = path.resolve('concat_list.txt'); // Resolve relative to current working dir

    // Escape single quotes for the concat list file
    const list = [
        `file '${selectedFilePath.replace(/'/g, "'\\''")}'`,
        `file '${secondFilePath.replace(/'/g, "'\\''")}'`
    ].join('\n');

    fs.writeFileSync(concatFilePath, list);

    // Construct the FFMPEG command for concatenation
    const ffmpegCommand = `ffmpeg -y -f concat -safe 0 -i "${concatFilePath}" -c copy "${outputFile}"`;

    return { command: ffmpegCommand, outputFile: outputFile, tempFilePath: concatFilePath };
}

module.exports = {
    getUIHtml,
    attachEventListeners,
    getFFmpegCommand
};