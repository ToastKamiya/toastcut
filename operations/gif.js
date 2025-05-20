// operations/gif.js
// This module provides UI and FFmpeg command generation for converting a video to a GIF.

// Function to provide the HTML for the CONVERT TO GIF operation UI
function getUIHtml() {
    return `
        <h3 style="margin-bottom: 15px; font-size: 1.17em; font-weight: bold;">Convert Video to GIF Options</h3>

        <label>Start Time (seconds):</label>
        <div style="margin-bottom: 10px;">
            <input type="number" id="startTime" value="0" min="0" class="border p-2 rounded w-full">
        </div>

        <label>Duration (seconds):</label>
        <div style="margin-bottom: 10px;">
            <input type="number" id="duration" value="3" min="1" class="border p-2 rounded w-full">
        </div>

        <label>Frame Rate (fps):</label>
        <div style="margin-bottom: 10px;">
            <input type="number" id="frameRate" value="10" min="1" max="60" class="border p-2 rounded w-full">
        </div>

        <label>Output Width (pixels):</label>
        <div style="margin-bottom: 10px;">
            <input type="number" id="outputWidth" value="320" min="1" class="border p-2 rounded w-full">
        </div>

        <label>Loop Count (-1 is none, 0 is forever, N is N times):</label>
        <div style="margin-bottom: 10px;">
            <input type="number" id="loopCount" value="0" min="-1" class="border p-2 rounded w-full">
        </div>

        <label>Output File Name:</label>
        <div style="display: flex; margin-bottom: 10px;">
            <input type="text" id="outputFileName" class="border p-2 rounded w-full">
            <label style="align-content: center; padding-left: 10px;">.gif</label>
        </div>

        <div style="margin-bottom: 15px;">
            <button id="advancedGifOptionsButton" type="button" class="border p-2 rounded hiddenButton" style="cursor: pointer;">Advanced...</button>
        </div>

        <div id="advancedGifOptionsContainer" style="display: none;">
            <label>Palette Stats Mode:</label>
            <div style="margin-bottom: 10px;">
                <select id="paletteStatsMode" class="border p-2 rounded w-full">
                    <option value="full">Full (Default)</option>
                    <option value="diff">Diff (Moving parts)</option>
                    <option value="single">Single (Each frame)</option>
                </select>
            </div>

            <label>Dithering Algorithm:</label>
            <div style="margin-bottom: 10px;">
                <select id="ditherAlgorithm" class="border p-2 rounded w-full">
                    <option value="sierra2_4a">sierra2_4a (Default Error Diffusion)</option>
                    <option value="none">None</option>
                    <option value="bayer">bayer (Deterministic)</option>
                    <option value="floyd_steinberg">floyd_steinberg (Error Diffusion)</option>
                    <option value="diffusion">diffusion (Error Diffusion)</option>
                </select>
            </div>
        </div>

        `;
}

// Function to attach event listeners to the UI elements
function attachEventListeners(containerElement, videoPreviewElement) {
    const advancedButton = containerElement.querySelector('#advancedGifOptionsButton');
    const advancedContainer = containerElement.querySelector('#advancedGifOptionsContainer');

    if (advancedButton && advancedContainer) {
        advancedButton.addEventListener('click', () => {
            // Toggle the display style of the advanced options container
            if (advancedContainer.style.display === 'none') {
                advancedContainer.style.display = 'block'; // Or '' to use default display
            } else {
                advancedContainer.style.display = 'none';
            }
        });
    } else {
         console.warn("CONVERT TO GIF module: Could not find advanced options button or container.");
    }
}

// Function to construct the FFMPEG command for CONVERT TO GIF
// Needs access to the main selected file path and the container element for inputs
function getFFmpegCommand(selectedFilePath, containerElement) {
    // Get input values from the UI
    const startTimeInput = containerElement.querySelector('#startTime');
    const durationInput = containerElement.querySelector('#duration');
    const frameRateInput = containerElement.querySelector('#frameRate');
    const outputWidthInput = containerElement.querySelector('#outputWidth');
    const loopCountInput = containerElement.querySelector('#loopCount');
    const outputFileNameInput = containerElement.querySelector('#outputFileName');
    // These are inside the potentially hidden container, but querySelector finds them regardless
    const paletteStatsModeSelect = containerElement.querySelector('#paletteStatsMode');
    const ditherAlgorithmSelect = containerElement.querySelector('#ditherAlgorithm');

    // Basic validation: Check if required elements exist
    if (!startTimeInput || !durationInput || !frameRateInput || !outputWidthInput || !loopCountInput || !outputFileNameInput || !paletteStatsModeSelect || !ditherAlgorithmSelect) {
        console.error("CONVERT TO GIF module: Could not find all required input elements.");
        alert('Internal error: Missing input fields for Convert to GIF operation.');
        return null; // Indicate validation failure
    }

    // Get values and perform validation
    const startTime = startTimeInput.value;
    const duration = durationInput.value;
    const frameRate = frameRateInput.value;
    const outputWidth = outputWidthInput.value;
    const loopCount = loopCountInput.value;
    const outputFileName = outputFileNameInput.value.trim(); // Trim whitespace

    // Validate required fields are not empty
    if (startTime === '' || duration === '' || frameRate === '' || outputWidth === '' || loopCount === '' || outputFileName === '') {
        alert('Please fill out all fields for the Convert to GIF operation!');
        return null; // Indicate validation failure
    }

    // Validate numeric inputs
    if (isNaN(startTime) || parseFloat(startTime) < 0) {
         alert('Start Time must be a non-negative number.');
         return null;
    }
     if (isNaN(duration) || parseFloat(duration) <= 0) {
         alert('Duration must be a positive number.');
         return null;
    }
     if (isNaN(frameRate) || parseInt(frameRate, 10) <= 0) {
         alert('Frame Rate must be a positive integer.');
         return null;
    }
     if (isNaN(outputWidth) || parseInt(outputWidth, 10) <= 0) {
         alert('Output Width must be a positive integer.');
         return null;
    }
     if (isNaN(loopCount) || parseInt(loopCount, 10) < -1) {
         alert('Loop Count must be -1 or a non-negative integer.');
         return null;
    }


    const paletteStatsMode = paletteStatsModeSelect.value;
    const ditherAlgorithm = ditherAlgorithmSelect.value;

    // Construct the video filter string
    // The scale filter uses -1 for height to maintain aspect ratio
    let vfFilter = `fps=${frameRate},scale=${outputWidth}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=${paletteStatsMode}[p];[s1][p]paletteuse=dither=${ditherAlgorithm}`;

    // Construct the FFMPEG command
    const outputFile = outputFileName + ".gif";
    // Ensure paths are quoted to handle spaces
    const ffmpegCommand = `-y -ss ${startTime} -t ${duration} -i "${selectedFilePath}" -vf "${vfFilter}" -loop ${loopCount} "${outputFile}"`;

    return { command: ffmpegCommand, outputFile: outputFile }; // Return command and output file name
}

// Export the functions
module.exports = {
    getUIHtml,
    attachEventListeners,
    getFFmpegCommand
};
