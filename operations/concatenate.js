const path = require('path');
const fs = require('fs');
const { webUtils } = require('electron');

let extraVideoPaths = []; // All videos after the first one

function getUIHtml() {
    return `
        <p>First video - <strong>(already selected above)</strong></p>
        <br/>
        <p>Additional videos:
            <span class="info-icon">i
                <span class="tooltip">
                    Added videos get connected in top-down order, with the first clip being the one above in the main file upload, and others following.
                </span>
            </span></p>
        <div id="videoInputsContainer"></div>
        <button type="button" id="addVideoBtn">+ Add Video</button>
        <br/><br/>
        <label>Output File Name:</label>
        <div style="display: flex;">
            <input type="text" id="outputFileName">
            <label style="align-content: center;">.mp4</label>
        </div>
    `;
}

function attachEventListeners(containerElement) {
    const videoInputsContainer = containerElement.querySelector('#videoInputsContainer');
    const addBtn = containerElement.querySelector('#addVideoBtn');

    // Add first empty input initially
    addVideoInput(videoInputsContainer);

    // Add button functionality
    addBtn.addEventListener('click', () => {
        addVideoInput(videoInputsContainer);
    });
}

function addVideoInput(container) {
    const index = extraVideoPaths.length;
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.marginBottom = '5px';

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/mp4';
    input.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            extraVideoPaths[index] = webUtils.getPathForFile(file);
        } else {
            extraVideoPaths[index] = null;
        }
    });

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '−';
    removeBtn.style.marginLeft = '5px';
    removeBtn.addEventListener('click', () => {
        container.removeChild(wrapper);
        extraVideoPaths[index] = null; // Clear this slot
    });

    wrapper.appendChild(input);
    wrapper.appendChild(removeBtn);
    container.appendChild(wrapper);

    extraVideoPaths.push(null);
}

function getFFmpegCommand(selectedFilePath, containerElement) {
    const outputFileName = containerElement.querySelector('#outputFileName').value;

    const validExtraPaths = extraVideoPaths.filter(Boolean);

    if (!selectedFilePath || validExtraPaths.length === 0 || !outputFileName) {
        alert('Please select the first video, at least one additional video, and an output file name!');
        return null;
    }

    const outputFile = outputFileName + ".mp4";
    const concatFilePath = path.resolve('concat_list.txt');

    const allVideos = [selectedFilePath, ...validExtraPaths];

    const list = allVideos
        .map(filePath => `file '${filePath.replace(/'/g, "'\\''")}'`)
        .join('\n');

    fs.writeFileSync(concatFilePath, list);

    const ffmpegCommand = `-y -f concat -safe 0 -i "${concatFilePath}" -movflags +faststart -c copy "${outputFile}"`;

    return { command: ffmpegCommand, outputFile, tempFilePath: concatFilePath };
}

module.exports = {
    getUIHtml,
    attachEventListeners,
    getFFmpegCommand
};
