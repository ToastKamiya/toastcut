// operations/trim.js
const path = require('path');
const fs = require('fs');

// Function to provide the HTML for the TRIM operation UI
function getUIHtml() {
    return `
        <label>Precise Trim (seconds.milliseconds):</label>
        <input type="checkbox" id="preciseTrimToggle" style="margin-left: 10px;"><br/><br/>

        <div id="hmsInputs">
            <label>Start Time (HH:MM:SS):</label>
            <div style="display: flex;">
                <input type="text" style="margin-right: 10px;" id="startTimeHMS" value="00:00:00">
                <input class="btn1" type="button" value="Apply timestamp">
            </div>
            <br/>
            <label>End Time (HH:MM:SS):</label>
            <div style="display: flex;">
                <input type="text" style="margin-right: 10px;" id="endTimeHMS" value="00:00:00">
                <input class="btn2" type="button" value="Apply timestamp">
            </div>
        </div>

        <div id="secondsMsInputs" style="display: none;">
            <label>Start Time (seconds.milliseconds):</label>
            <div style="display: flex;">
                <input type="text" style="margin-right: 10px;" id="startTimeMS" value="0.000">
                <input class="btn1" type="button" value="Apply timestamp">
            </div>
            <br/>
            <label>End Time (seconds.milliseconds):</label>
            <div style="display: flex;">
                <input type="text" style="margin-right: 10px;" id="endTimeMS" value="0.000">
                <input class="btn2" type="button" value="Apply timestamp">
            </div>
        </div>
        
        <br/>
        <label>Output File Name:</label>
        <div style="display: flex;">
            <input type="text" id="outputFileName">
            <label style="align-content: center;">.mp4</label>
        </div>
        <br/>
    `;
}

// Function to attach event listeners specific to the TRIM UI
// Needs access to the container div and the video element
function attachEventListeners(containerElement, videoPreviewElement) {
    const preciseTrimToggle = containerElement.querySelector("#preciseTrimToggle");
    const hmsInputsDiv = containerElement.querySelector("#hmsInputs");
    const secondsMsInputsDiv = containerElement.querySelector("#secondsMsInputs");

    const startTimeHMSInput = containerElement.querySelector('#startTimeHMS');
    const endTimeHMSInput = containerElement.querySelector('#endTimeHMS');
    const startTimeMSInput = containerElement.querySelector('#startTimeMS');
    const endTimeMSInput = containerElement.querySelector('#endTimeMS');

    // Attach event listener for the toggle
    if (preciseTrimToggle) {
        preciseTrimToggle.addEventListener('change', () => {
            if (preciseTrimToggle.checked) {
                hmsInputsDiv.style.display = 'none';
                secondsMsInputsDiv.style.display = 'block';
                // Update precise inputs if HMS inputs had values, but only if they are not default
                if (startTimeHMSInput.value !== "00:00:00") {
                    startTimeMSInput.value = hmsToSeconds(startTimeHMSInput.value).toFixed(3);
                }
                if (endTimeHMSInput.value !== "00:00:00") {
                    endTimeMSInput.value = hmsToSeconds(endTimeHMSInput.value).toFixed(3);
                }
            } else {
                hmsInputsDiv.style.display = 'block';
                secondsMsInputsDiv.style.display = 'none';
                 // Update HMS inputs if precise inputs had values, but only if they are not default
                 if (startTimeMSInput.value !== "0.000") {
                    startTimeHMSInput.value = formatHMS(parseFloat(startTimeMSInput.value));
                }
                if (endTimeMSInput.value !== "0.000") {
                    endTimeHMSInput.value = formatHMS(parseFloat(endTimeMSInput.value));
                }
            }
        });
    }

    // Attach event listeners for "Apply timestamp" buttons
    const startButtons = containerElement.querySelectorAll(".btn1");
    // FIX: Use querySelectorAll for .btn2 as well
    const endButtons = containerElement.querySelectorAll(".btn2"); 

    // Apply button for start time (handles both HMS and MS inputs)
    startButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (preciseTrimToggle.checked) {
                const formattedTime = formatSecondsMilliseconds(videoPreviewElement.currentTime);
                containerElement.querySelector('#startTimeMS').value = formattedTime;
            } else {
                const formattedTime = formatHMS(videoPreviewElement.currentTime);
                containerElement.querySelector('#startTimeHMS').value = formattedTime;
            }
        });
    });

    // Apply button for end time (handles both HMS and MS inputs)
    // FIX: Iterate over all found .btn2 elements
    endButtons.forEach(button => { // Changed from endButtons.addEventListener to endButtons.forEach(button => { ... });
        button.addEventListener('click', () => {
            if (preciseTrimToggle.checked) {
                const formattedTime = formatSecondsMilliseconds(videoPreviewElement.currentTime);
                containerElement.querySelector('#endTimeMS').value = formattedTime;
            } else {
                const formattedTime = formatHMS(videoPreviewElement.currentTime);
                containerElement.querySelector('#endTimeHMS').value = formattedTime;
            }
        });
    });
}

// Helper function to format time as HH:MM:SS
function formatHMS(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secondsLeft = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secondsLeft.toString().padStart(2, '0')}`;
}

// Helper function to format time as seconds.milliseconds
function formatSecondsMilliseconds(seconds) {
    return seconds.toFixed(3); // Fix to 3 decimal places for milliseconds
}

// Helper function to convert HH:MM:SS to total seconds (float for precision)
function hmsToSeconds(hms) {
    const parts = hms.split(':').map(Number);
    if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0; // Default or error case
}


// Function to construct the FFMPEG command for TRIM
// Needs access to the main selected file path
function getFFmpegCommand(selectedFilePath, containerElement) {
    const preciseTrimToggle = containerElement.querySelector("#preciseTrimToggle");
    let startTime;
    let endTime;

    if (preciseTrimToggle.checked) {
        startTime = containerElement.querySelector('#startTimeMS').value;
        endTime = containerElement.querySelector('#endTimeMS').value;
    } else {
        startTime = containerElement.querySelector('#startTimeHMS').value;
        endTime = containerElement.querySelector('#endTimeHMS').value;
    }

    const outputFileName = containerElement.querySelector('#outputFileName').value;
    const cudaBox = containerElement.querySelector('#useaccel'); // Assuming #useaccel exists in your main GUI

    if (!startTime || !endTime || !outputFileName) {
        alert('Please fill out all fields for the Trim operation!');
        return null; // Indicate validation failure
    }

    let usecudaDecode = ''; // For input decoding acceleration
    let videoCodec = 'libx264'; // Default software H.264
    let audioCodec = 'aac';     // Default software AAC
    let codecOptions = '-preset medium -crf 23'; // Good balance for quality/speed
    let audioBitrate = '-b:a 192k';

    // If CUDA is checked, enable hardware decoding.
    // For encoding, you'd need h264_nvenc, which is separate.
    // This example will use CPU re-encoding by default unless you specifically add NVENC options.
    if (cudaBox && cudaBox.checked) {
        usecudaDecode = "-hwaccel cuda";
    }

    const outputFile = outputFileName + ".mp4";
    let ffmpegCommand;

    if (preciseTrimToggle.checked) {
        // Precise trim: Use output seeking (-ss after -i) and re-encode
        ffmpegCommand = `-y ${usecudaDecode} -i "${selectedFilePath}" -ss ${startTime} -to ${endTime} -c:v ${videoCodec} ${codecOptions} -c:a ${audioCodec} ${audioBitrate} -vsync 0 "${outputFile}"`;
    } else {
        // Fast trim: Use input seeking (-ss before -i) and stream copy (-c copy)
        ffmpegCommand = `-y ${usecudaDecode} -ss ${startTime} -to ${endTime} -i "${selectedFilePath}" -c copy "${outputFile}"`;
    }

    return { command: ffmpegCommand, outputFile: outputFile }; // Return command and output file name
}

// Export the functions
module.exports = {
    getUIHtml,
    attachEventListeners,
    getFFmpegCommand
};