// operations/crop.js
const path = require('path');
const fs = require('fs');

// Function to provide the HTML for the CROP operation UI
function getUIHtml() {
    return `
    <div style="margin-bottom: 12px; font-size: 13px; opacity: 0.85;">
    Original Resolution: <span id="origResolution" style="font-weight: bold; color: #cc52ff;">Detecting...</span>
    </div>

    <label>Width:</label>
    <div style="margin-bottom: 10px;">
    <input type="text" id="width" class="border p-2 rounded w-full" placeholder="e.g. 1920 or 50%">
    </div>
    <label>Height:</label>
    <div style="margin-bottom: 10px;">
    <input type="text" id="height" class="border p-2 rounded w-full" placeholder="e.g. 1080 or 50%">
    </div>
    <label>X Offset (Left):</label>
    <div style="margin-bottom: 10px;">
    <input type="number" id="xOffset" class="border p-2 rounded w-full" value="0">
    </div>
    <label>Y Offset (Top):</label>
    <div style="margin-bottom: 10px;">
    <input type="number" id="yOffset" class="border p-2 rounded w-full" value="0">
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

// Helper to compute the exact display boundaries of an object-fit: contain video element
function getVideoRenderedMetrics(video) {
    const videoRatio = video.videoWidth / video.videoHeight;
    const elementWidth = video.clientWidth;
    const elementHeight = video.clientHeight;
    const elementRatio = elementWidth / elementHeight;

    let width, height, left, top;

    if (videoRatio > elementRatio) {
        width = elementWidth;
        height = elementWidth / videoRatio;
        left = 0;
        top = (elementHeight - height) / 2;
    } else {
        height = elementHeight;
        width = elementHeight * videoRatio;
        top = 0;
        left = (elementWidth - width) / 2;
    }

    return { width, height, left, top };
}

// Helper to intelligently parse dimensions as pixels or percentages
function parseDimension(valStr, maxVal) {
    if (!valStr) return maxVal;
    const trimmed = valStr.toString().trim();
    if (trimmed.endsWith('%')) {
        const pct = parseFloat(trimmed);
        if (!isNaN(pct) && pct >= 0 && pct <= 100) {
            return Math.round((pct / 100) * maxVal);
        }
    }
    const num = parseInt(trimmed);
    return isNaN(num) ? maxVal : num;
}

function attachEventListeners(containerElement, videoPreviewElement) {
    const widthInput = containerElement.querySelector('#width');
    const heightInput = containerElement.querySelector('#height');
    const xInput = containerElement.querySelector('#xOffset');
    const yInput = containerElement.querySelector('#yOffset');
    const origResSpan = containerElement.querySelector('#origResolution');

    // Clean up any old overlay to prevent duplication artifacts
    const oldOverlay = document.getElementById('toastcut-crop-overlay');
    if (oldOverlay) oldOverlay.remove();

    const dropZone = document.getElementById('dropZone');
    if (!dropZone || !widthInput || !heightInput || !xInput || !yInput) return;

    // 1. Create a bounded overlay panel matching the true video surface aspect box
    const overlay = document.createElement('div');
    overlay.id = 'toastcut-crop-overlay';
    overlay.style.position = 'absolute';
    overlay.style.zIndex = '10';
    overlay.style.pointerEvents = 'none';

    // Intercept event listeners completely so they never bubble up to index.html's dropZone
    overlay.addEventListener('click', (e) => e.stopPropagation());
    overlay.addEventListener('mousedown', (e) => e.stopPropagation());

    // 1b. Create an inner mask wrapper container that cleanly clips the wide backdrop shadow
    const maskWrapper = document.createElement('div');
    maskWrapper.style.position = 'absolute';
    maskWrapper.style.top = '0';
    maskWrapper.style.left = '0';
    maskWrapper.style.width = '100%';
    maskWrapper.style.height = '100%';
    maskWrapper.style.overflow = 'hidden';
    overlay.appendChild(maskWrapper);

    // 1c. Create the shadow box wrapper inside the mask layer
    const shadowBox = document.createElement('div');
    shadowBox.style.position = 'absolute';
    shadowBox.style.boxShadow = '0 0 0 9999px rgba(0, 0, 0, 0.6)';
    shadowBox.style.boxSizing = 'border-box';
    maskWrapper.appendChild(shadowBox);

    // 2. Create the visual crop boundary selection container
    const cropBox = document.createElement('div');
    cropBox.id = 'toastcut-crop-box';
    cropBox.style.position = 'absolute';
    cropBox.style.border = '2px dashed #ff3333';
    cropBox.style.boxSizing = 'border-box';
    cropBox.style.cursor = 'move';
    cropBox.style.pointerEvents = 'auto';

    // 3. Mount 4 explicit interactive corner handles onto the box border
    const corners = ['tl', 'tr', 'bl', 'br'];
    const handleElements = {};
    corners.forEach(corner => {
        const handle = document.createElement('div');
        handle.className = `crop-handle crop-handle-${corner}`;
        handle.style.position = 'absolute';
        handle.style.width = '10px';
        handle.style.height = '10px';
        handle.style.background = '#ffffff';
        handle.style.border = '1px solid #ff3333';
        handle.style.zIndex = '25';

        if (corner === 'tl') {
            handle.style.top = '-5px';
            handle.style.left = '-5px';
            handle.style.cursor = 'nwse-resize';
        } else if (corner === 'tr') {
            handle.style.top = '-5px';
            handle.style.right = '-5px';
            handle.style.cursor = 'nesw-resize';
        } else if (corner === 'bl') {
            handle.style.bottom = '-5px';
            handle.style.left = '-5px';
            handle.style.cursor = 'nesw-resize';
        } else if (corner === 'br') {
            handle.style.bottom = '-5px';
            handle.style.right = '-5px';
            handle.style.cursor = 'nwse-resize';
        }

        cropBox.appendChild(handle);
        handleElements[corner] = handle;
    });

    overlay.appendChild(cropBox);
    dropZone.appendChild(overlay);

    // Sync UI elements to match visual coordinates
    function syncOverlaySize() {
        if (!videoPreviewElement.videoWidth || !videoPreviewElement.videoHeight) {
            overlay.style.display = 'none';
            return;
        }
        overlay.style.display = 'block';

        if (origResSpan) {
            origResSpan.textContent = `${videoPreviewElement.videoWidth}x${videoPreviewElement.videoHeight}`;
        }

        const metrics = getVideoRenderedMetrics(videoPreviewElement);
        overlay.style.left = `${metrics.left}px`;
        overlay.style.top = `${metrics.top}px`;
        overlay.style.width = `${metrics.width}px`;
        overlay.style.height = `${metrics.height}px`;

        const vW = videoPreviewElement.videoWidth;
        const vH = videoPreviewElement.videoHeight;

        let cW = parseDimension(widthInput.value, vW);
        let cH = parseDimension(heightInput.value, vH);

        if (cW > vW) { cW = vW; widthInput.value = vW; }
        if (cH > vH) { cH = vH; heightInput.value = vH; }

        let cX = parseInt(xInput.value) || 0;
        let cY = parseInt(yInput.value) || 0;

        if (cX + cW > vW) { cX = vW - cW; xInput.value = cX; }
        if (cY + cH > vH) { cY = vH - cH; yInput.value = cY; }
        if (cX < 0) { cX = 0; xInput.value = 0; }
        if (cY < 0) { cY = 0; yInput.value = 0; }

        const boxLeft = (cX / vW) * metrics.width;
        const boxTop = (cY / vH) * metrics.height;
        const boxWidth = (cW / vW) * metrics.width;
        const boxHeight = (cH / vH) * metrics.height;

        // Synchronize dark mask and visible interactive box layouts simultaneously
        shadowBox.style.left = `${boxLeft}px`;
        shadowBox.style.top = `${boxTop}px`;
        shadowBox.style.width = `${boxWidth}px`;
        shadowBox.style.height = `${boxHeight}px`;

        cropBox.style.left = `${boxLeft}px`;
        cropBox.style.top = `${boxTop}px`;
        cropBox.style.width = `${boxWidth}px`;
        cropBox.style.height = `${boxHeight}px`;
    }

    // Auto-populate inputs to the full native resolution if left empty
    function autoPopulateFields() {
        if (videoPreviewElement.videoWidth && videoPreviewElement.videoHeight) {
            if (!widthInput.value) widthInput.value = videoPreviewElement.videoWidth;
            if (!heightInput.value) heightInput.value = videoPreviewElement.videoHeight;
            if (!xInput.value) xInput.value = 0;
            if (!yInput.value) yInput.value = 0;
            syncOverlaySize();
        }
    }

    // Interactive element event hooks
    [widthInput, heightInput, xInput, yInput].forEach(inp => {
        inp.addEventListener('input', syncOverlaySize);
    });

    videoPreviewElement.addEventListener('loadedmetadata', autoPopulateFields);
    autoPopulateFields();

    const layoutObserver = new ResizeObserver(() => syncOverlaySize());
    layoutObserver.observe(videoPreviewElement);

    // --- Corner Resizing Implementation Logic ---
    let activeHandle = null;
    let startResizeMouseX, startResizeMouseY;
    let startResizeX, startResizeY, startResizeW, startResizeH;

    Object.keys(handleElements).forEach(corner => {
        const handle = handleElements[corner];

        handle.addEventListener('click', (e) => e.stopPropagation());
        handle.addEventListener('mousedown', (e) => e.stopPropagation());

        handle.addEventListener('pointerdown', (e) => {
            if (!videoPreviewElement.videoWidth) return;
            activeHandle = corner;
            startResizeMouseX = e.clientX;
            startResizeMouseY = e.clientY;

            const vW = videoPreviewElement.videoWidth;
            const vH = videoPreviewElement.videoHeight;

            startResizeW = parseDimension(widthInput.value, vW);
            startResizeH = parseDimension(heightInput.value, vH);
            startResizeX = parseInt(xInput.value) || 0;
            startResizeY = parseInt(yInput.value) || 0;

            handle.setPointerCapture(e.pointerId);
            e.stopPropagation();
            e.preventDefault();
        });

        handle.addEventListener('pointermove', (e) => {
            if (activeHandle !== corner) return;

            const metrics = getVideoRenderedMetrics(videoPreviewElement);
            const scaleFactorX = videoPreviewElement.videoWidth / metrics.width;
            const scaleFactorY = videoPreviewElement.videoHeight / metrics.height;

            const deltaX = (e.clientX - startResizeMouseX) * scaleFactorX;
            const deltaY = (e.clientY - startResizeMouseY) * scaleFactorY;

            const vW = videoPreviewElement.videoWidth;
            const vH = videoPreviewElement.videoHeight;

            let newX = startResizeX;
            let newY = startResizeY;
            let newW = startResizeW;
            let newH = startResizeH;

            // Handle Horizontal adjustments
            if (corner.includes('l')) {
                const targetX = Math.round(startResizeX + deltaX);
                const maxLeftX = startResizeX + startResizeW - 10; // clamp min-width to 10px
                newX = Math.max(0, Math.min(maxLeftX, targetX));
                newW = (startResizeX + startResizeW) - newX;
            } else if (corner.includes('r')) {
                const targetW = Math.round(startResizeW + deltaX);
                newW = Math.max(10, Math.min(vW - startResizeX, targetW));
            }

            // Handle Vertical adjustments
            if (corner.includes('t')) {
                const targetY = Math.round(startResizeY + deltaY);
                const maxTopY = startResizeY + startResizeH - 10; // clamp min-height to 10px
                newY = Math.max(0, Math.min(maxTopY, targetY));
                newH = (startResizeY + startResizeH) - newY;
            } else if (corner.includes('b')) {
                const targetH = Math.round(startResizeH + deltaY);
                newH = Math.max(10, Math.min(vH - startResizeY, targetH));
            }

            widthInput.value = newW;
            heightInput.value = newH;
            xInput.value = newX;
            yInput.value = newY;

            syncOverlaySize();
            e.stopPropagation();
        });

        handle.addEventListener('pointerup', (e) => {
            if (activeHandle === corner) {
                activeHandle = null;
                handle.releasePointerCapture(e.pointerId);
                e.stopPropagation();
            }
        });
    });

    // --- Full Box Translation Move Logic ---
    let isDragging = false;
    let startMouseX, startMouseY, startCropX, startCropY;

    cropBox.addEventListener('pointerdown', (e) => {
        // Skip translating if targeting a resizing handle
        if (e.target.classList.contains('crop-handle')) return;

        if (!videoPreviewElement.videoWidth) return;
        isDragging = true;
        startMouseX = e.clientX;
        startMouseY = e.clientY;
        startCropX = parseInt(xInput.value) || 0;
        startCropY = parseInt(yInput.value) || 0;
        cropBox.setPointerCapture(e.pointerId);
        e.stopPropagation();
    });

    cropBox.addEventListener('pointermove', (e) => {
        if (!isDragging) return;

        const metrics = getVideoRenderedMetrics(videoPreviewElement);
        const scaleFactorX = videoPreviewElement.videoWidth / metrics.width;
        const scaleFactorY = videoPreviewElement.videoHeight / metrics.height;

        const deltaX = (e.clientX - startMouseX) * scaleFactorX;
        const deltaY = (e.clientY - startMouseY) * scaleFactorY;

        let targetX = Math.round(startCropX + deltaX);
        let targetY = Math.round(startCropY + deltaY);

        const vW = videoPreviewElement.videoWidth;
        const vH = videoPreviewElement.videoHeight;
        const currentW = parseDimension(widthInput.value, vW);
        const currentH = parseDimension(heightInput.value, vH);

        targetX = Math.max(0, Math.min(vW - currentW, targetX));
        targetY = Math.max(0, Math.min(vH - currentH, targetY));

        xInput.value = targetX;
        yInput.value = targetY;

        syncOverlaySize();
    });

    cropBox.addEventListener('pointerup', (e) => {
        if (isDragging) {
            isDragging = false;
            cropBox.releasePointerCapture(e.pointerId);
        }
    });

    // Tear-down logic, triggered either by switching operations or by the
    // crop UI being removed/replaced from the DOM.
    const selectElement = document.getElementById('operation');

    function teardown() {
        const runtimeOverlay = document.getElementById('toastcut-crop-overlay');
        if (runtimeOverlay) runtimeOverlay.remove();
        layoutObserver.disconnect();
        detachmentObserver.disconnect();
        if (selectElement) selectElement.removeEventListener('change', onOperationChange);
    }

    function onOperationChange() {
        if (selectElement.value !== 'CROP') teardown();
    }

    if (selectElement) selectElement.addEventListener('change', onOperationChange);

    // Fallback/robust check: previously this only checked whether
    // containerElement itself was detached, which never happens if the host
    // app swaps #operationDetails' innerHTML instead of replacing the whole
    // node. Checking whether our own inputs are still inside containerElement
    // catches that case too, regardless of how the switch happened.
    const detachmentObserver = new MutationObserver(() => {
        const stillMounted = document.body.contains(containerElement) && containerElement.contains(widthInput);
        if (!stillMounted) teardown();
    });
        detachmentObserver.observe(containerElement.parentElement || document.body, { childList: true, subtree: true });
}

// Function to construct the FFMPEG command for CROP
function getFFmpegCommand(selectedFilePath, containerElement) {
    const widthInput = containerElement.querySelector('#width');
    const heightInput = containerElement.querySelector('#height');
    const xInput = containerElement.querySelector('#xOffset');
    const yInput = containerElement.querySelector('#yOffset');
    const outputFileNameInput = containerElement.querySelector('#outputFileName');
    const cudaBox = containerElement.querySelector('#useaccel');

    if (!widthInput || !heightInput || !xInput || !yInput || !outputFileNameInput) {
        console.error("CROP module: Could not find all required input elements.");
        alert('Internal error: Missing input fields for Crop operation.');
        return null;
    }

    const videoPreviewElement = document.getElementById('videoPreview');
    const vW = videoPreviewElement ? videoPreviewElement.videoWidth : 1920;
    const vH = videoPreviewElement ? videoPreviewElement.videoHeight : 1080;

    const width = parseDimension(widthInput.value, vW);
    const height = parseDimension(heightInput.value, vH);
    const x = parseInt(xInput.value) || 0;
    const y = parseInt(yInput.value) || 0;
    const outputFileName = outputFileNameInput.value;

    if (!width || !height || !outputFileName) {
        alert('Please fill out all fields for the Crop operation!');
        return null;
    }

    let usecuda = '';
    if (cudaBox && cudaBox.checked) {
        usecuda = "-hwaccel cuda";
    }

    const outputFile = outputFileName + ".mp4";
    const ffmpegCommand = `-y ${usecuda} -i "${selectedFilePath}" -movflags +faststart -filter:v "crop=${width}:${height}:${x}:${y}" "${outputFile}"`;

    return { command: ffmpegCommand, outputFile: outputFile };
}

module.exports = {
    getUIHtml,
    attachEventListeners,
    getFFmpegCommand
};
