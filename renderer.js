const { ipcRenderer } = require('electron');
const { webUtils } = require('electron');
const fs = require('fs');
const path = require('path');

// Get DOM elements
const videoPreview = document.getElementById('videoPreview');
const inputFile = document.getElementById('inputFile');
const progressElement = document.getElementById('ffmpegProgress');
const operationDetailsDiv = document.getElementById('operationDetails');
const runButton = document.getElementById('runButton');
const outputElement = document.getElementById('output');
const operationSelect = document.getElementById('operation');

let selectedFilePath = null; // Path of the first selected video file
let secondFilePath = null; // Path of the second video file (for concatenate)
let tempConcatFilePath = null; // Variable to store the temporary file path for concatenation

// Keep track of the currently loaded operation module
let currentOperationModule = null;

// --- Event Listeners ---

// Listen for file selection in the input element
if (inputFile) {
    inputFile.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            selectedFilePath = webUtils.getPathForFile(file);
            loadVideo(file);
            // Notify the current operation module about the file change
            if (currentOperationModule && typeof currentOperationModule.handleFileChange === 'function') {
                currentOperationModule.handleFileChange(selectedFilePath, operationDetailsDiv); // Pass file path and container
            }
        } else {
            selectedFilePath = null;
            if (videoPreview) {
                videoPreview.style.display = 'none';
            }
             // Notify the current operation module that the file was cleared
             if (currentOperationModule && typeof currentOperationModule.handleFileChange === 'function') {
                 currentOperationModule.handleFileChange(null, operationDetailsDiv); // Pass null for cleared file
             }
        }
    });
}

// Listen for video time updates
if (videoPreview) {
    videoPreview.addEventListener('timeupdate', () => {
        // Handled by operation modules if needed (e.g., TRIM)
    });
}

// Listen for window close to terminate FFMPEG process
window.addEventListener('beforeunload', () => {
    ipcRenderer.send('terminate-ffmpeg');
});

// Listen for changes in the operation dropdown
if (operationSelect) {
    operationSelect.addEventListener('change', updateOperationUI);
}

// Listen for click on the Run button
if (runButton) {
    runButton.addEventListener('click', runFFMPEG);
}

// --- Helper functions ---

// Load video into the preview element from a File object
function loadVideo(file) {
    if (!videoPreview) return;
    const fileURL = URL.createObjectURL(file);
    videoPreview.src = fileURL;
    videoPreview.style.display = 'block';
    videoPreview.load();
}

// Handle file selection for the second video in concatenation (called by concatenate.js)
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        secondFilePath = webUtils.getPathForFile(file);
        console.log("Selected second file:", secondFilePath);
    } else {
        secondFilePath = null;
        console.log("Second file selection cleared.");
    }
}

// Function to delete the temporary concat file if it exists
function deleteTempConcatFile() {
    if (tempConcatFilePath && fs.existsSync(tempConcatFilePath)) {
        try {
            fs.unlinkSync(tempConcatFilePath);
            console.log(`Deleted temporary file: ${tempConcatFilePath}`);
            tempConcatFilePath = null; // Reset the variable
        } catch (error) {
            console.error(`Failed to delete temporary file ${tempConcatFilePath}:`, error);
        }
    }
}


// --- Dynamic UI and Command Logic ---

// Update the UI based on the selected operation
function updateOperationUI() {
    // Ensure the required elements exist
    if (!operationDetailsDiv || !runButton || !operationSelect) return;

    const operation = operationSelect.value;

    // --- Start Fade Out ---
    // Set opacity to 0 to begin the fade out transition of the current content.
    // The CSS transition will handle the animation.
    operationDetailsDiv.style.opacity = '0';
    // --- End Fade Out ---

    // The duration below (200ms) should ideally be less than or equal to the CSS transition duration (0.5s = 500ms).
    const fadeDelay = 200; // Adjust delay if needed

    setTimeout(() => {
        // Clear the content *after* the fade out has had time to start
        operationDetailsDiv.innerHTML = '';

        // Reset the current operation module when changing operations
        currentOperationModule = null;

        // Reset temporary file path when operation changes
        // Keep this if you still have the concatenate logic
        if (typeof deleteTempConcatFile === 'function') {
             deleteTempConcatFile();
        }


        if (!operation) {
            runButton.disabled = true;
            // If no operation is selected, the div is already at opacity 0, just return.
            return;
        }

        try {
            // Require and store the new operation module
            const operationModule = require(`./operations/${operation.toLowerCase()}`);
            currentOperationModule = operationModule;

            // --- Insert New Content ---
            // Insert the new HTML content into the div
            operationDetailsDiv.innerHTML = operationModule.getUIHtml();
            // --- End Insert New Content ---


            // Attach event listeners for the new UI elements
            if (typeof operationModule.attachEventListeners === 'function') {
                // Pass operationDetailsDiv and videoPreview
                // The bitrate module will access selectedFilePath from the outer scope
                operationModule.attachEventListeners(operationDetailsDiv, videoPreview);
            }

            // Enable the run button now that UI is loaded (assuming attachEventListeners doesn't disable it)
            runButton.disabled = false;


            // --- Start Fade In ---
            // After inserting the new content, use requestAnimationFrame to
            // wait for the browser to be ready to render the new state.
            // Then set opacity to 1 to trigger the fade-in transition.
            requestAnimationFrame(() => {
                // A second requestAnimationFrame can sometimes help ensure the transition is registered
                requestAnimationFrame(() => {
                    operationDetailsDiv.style.opacity = '1'; // Trigger fade in transition
                });
            });
            // --- End Fade In ---


        } catch (error) {
            console.error(`Failed to load or initialize operation module for "${operation}":`, error);
            // Display an error message
            operationDetailsDiv.innerHTML = `<p style="color: red;">Error loading operation UI. Check console for details.</p>`;
            runButton.disabled = true;

            // --- Fade In Error Message ---
            // Also fade in the error message itself
             requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    operationDetailsDiv.style.opacity = '1';
                });
            });
            // --- End Fade In Error Message ---
        }
    }, fadeDelay); // End of setTimeout
}

// Run the FFMPEG process based on the selected operation and inputs
async function runFFMPEG() {
    if (!outputElement || !runButton || !operationSelect) return;

    if (!selectedFilePath) {
        alert('Please select the first video above!');
        return;
    }

    const operation = operationSelect.value;
    if (!operation) {
        alert('Please select an operation!');
        return;
    }

    // Ensure any previous temporary file is cleaned up before starting a new operation
    deleteTempConcatFile();

    let commandResult;
    let operationModule;

    try {
        // Use the currentOperationModule if available, otherwise require it
        operationModule = currentOperationModule || require(`./operations/${operation.toLowerCase()}`);

        commandResult = operationModule.getFFmpegCommand(selectedFilePath, operationDetailsDiv, secondFilePath);

        if (!commandResult || !commandResult.command || !commandResult.outputFile) {
            outputElement.innerText = 'Operation cancelled due to validation errors or incomplete setup.';
            runButton.disabled = false;
            return;
        }

        // Store the temporary file path if the operation is CONCATENATE
        if (operation.toLowerCase() === 'concatenate' && commandResult.tempFilePath) {
            tempConcatFilePath = commandResult.tempFilePath;
        }

    } catch (error) {
        console.error(`Failed to get FFMPEG command for "${operation}":`, error);
        outputElement.innerText = `❌ Error preparing command: ${error.message}`;
        runButton.disabled = false;
        return;
    }

    const outputFile = commandResult.outputFile;
    const ffmpegCommand = commandResult.command;
    const fullOutputPath = path.resolve(outputFile);

    if (fs.existsSync(fullOutputPath)) {
        const overwrite = confirm(`File "${outputFile}" already exists. Overwrite?`);
        if (!overwrite) {
            outputElement.innerText = 'Operation cancelled by user.';
            runButton.disabled = false;
            return;
        }
    }

    outputElement.innerText = 'Running FFMPEG...';
    runButton.disabled = true;

    ipcRenderer.send('run-ffmpeg', ffmpegCommand);
}

// --- IPC Listeners ---

// Handle FFMPEG progress updates
ipcRenderer.on('ffmpeg-progress', (event, message) => {
    if (outputElement) {
       outputElement.innerText = 'Processing...';
       // Progress parsing logic can be added here if needed, using progressElement
    }
});

// Handle FFMPEG success message
ipcRenderer.on('ffmpeg-success', (event, message) => {
    if (outputElement) {
        outputElement.innerText = `✅ Success:\n${message}`;
        if (runButton) runButton.disabled = false;
        // Delete the temporary file after success
        deleteTempConcatFile();
    }
});

// Handle FFMPEG error message
ipcRenderer.on('ffmpeg-error', (event, message) => {
    if (outputElement) {
        outputElement.innerText = `❌ Error:\n${message}`;
        if (runButton) runButton.disabled = false;
        // Delete the temporary file even if there's an error
        deleteTempConcatFile();
    }
});

// Make handleFileSelect globally accessible for the concatenate module
global.handleFileSelect = handleFileSelect;

// Trigger initial UI update for the default selected option on page load
updateOperationUI();
