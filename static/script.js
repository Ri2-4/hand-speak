
document.addEventListener("DOMContentLoaded", () => {

    // Dashboard elements
    const gestureElement = document.getElementById("current-gesture");
    const gestureStat = document.getElementById("gesture-stat");
    const handCount = document.getElementById("hand-count");
    const fpsElement = document.getElementById("fps");

    const cameraStatus = document.getElementById("camera-status");
    const statusDot = document.getElementById("status-dot");
    const cameraError = document.getElementById("camera-error");

    const cameraFeed = document.getElementById("camera-feed");
    const cameraCanvas = document.getElementById("camera-canvas");

    const startButton = document.getElementById("start-camera");
    const stopButton = document.getElementById("stop-camera");

    const historyList = document.getElementById("history-list");
    const gestureDescription = document.getElementById("gesture-description");

    if (!gestureElement) return;

    const descriptions = {
        "LIKE": "A positive thumbs-up gesture detected.",
        "DISLIKE": "A thumbs-down gesture detected.",
        "OK": "The OK hand gesture was recognized.",
        "PEACE": "A peace sign gesture was recognized.",
        "CALL ME": "A call-me gesture was recognized.",
        "STOP": "A stop gesture was recognized.",
        "FORWARD": "A forward movement gesture was recognized.",
        "LEFT": "A left direction gesture was recognized.",
        "RIGHT": "A right direction gesture was recognized.",
        "I LOVE YOU": "The I Love You gesture was recognized.",
        "NO GESTURE": "Waiting for your next gesture..."
    };

    let cameraStream = null;
    let processing = false;
    let cameraRunning = false;
    let animationFrame = null;
    let lastFrameTime = 0;
    let previousHistory = "";

    const frameInterval = 150;

    // Camera status
    function setCameraStatus(active, message = "") {

        cameraStatus.textContent = active
            ? "Camera active"
            : "Camera offline";

        statusDot.classList.toggle("offline", !active);

        if (active) {
            cameraError.style.display = "none";
        } else {
            cameraError.textContent = message;
            cameraError.style.display = "block";
        }
    }

    // Update gesture history
    function updateHistory(history) {

        const safeHistory = Array.isArray(history) ? history : [];
        const historyKey = JSON.stringify(safeHistory);

        if (historyKey === previousHistory) return;

        previousHistory = historyKey;
        historyList.replaceChildren();

        if (safeHistory.length === 0) {

            const emptyMessage = document.createElement("p");
            emptyMessage.className = "empty-state";
            emptyMessage.textContent =
                "Your detected gestures will appear here.";

            historyList.appendChild(emptyMessage);
            return;
        }

        safeHistory.forEach(item => {

            const row = document.createElement("div");
            row.className = "history-item";

            const gesture = document.createElement("strong");
            gesture.textContent = item.gesture || "Unknown gesture";

            const time = document.createElement("span");
            time.textContent = item.time || "";

            row.appendChild(gesture);
            row.appendChild(time);

            historyList.appendChild(row);
        });
    }

    // Update dashboard
    function updateDashboard(data) {

        const gesture = data.gesture || "NO GESTURE";

        gestureElement.textContent = gesture;
        gestureStat.textContent = gesture;

        gestureDescription.textContent =
            descriptions[gesture] || "Gesture recognized.";

        handCount.textContent = Number(data.hands) || 0;

        fpsElement.textContent =
            (Number(data.fps) || 0).toFixed(1);

        updateHistory(data.history);

        setCameraStatus(true);
    }

    // Send browser frame to Flask
    async function processFrame() {

        if (!cameraRunning || processing) return;

        processing = true;

        try {

            const context = cameraCanvas.getContext("2d");

            context.drawImage(
                cameraFeed,
                0,
                0,
                cameraCanvas.width,
                cameraCanvas.height
            );

            const blob = await new Promise(resolve => {
                cameraCanvas.toBlob(resolve, "image/jpeg", 0.75);
            });

            if (!blob) {
                throw new Error("Could not capture camera frame.");
            }

            const formData = new FormData();

            formData.append("frame", blob, "frame.jpg");

            const response = await fetch("/api/process_frame", {
                method: "POST",
                body: formData
            });

            if (!response.ok) {
                throw new Error("Frame processing failed.");
            }

            const data = await response.json();

            updateDashboard(data);

        } catch (error) {

            console.error("Frame processing error:", error);

            setCameraStatus(false, error.message);

        } finally {

            processing = false;
        }
    }

    // Camera processing loop
    function cameraLoop(timestamp) {

        if (!cameraRunning) return;

        if (timestamp - lastFrameTime >= frameInterval) {

            lastFrameTime = timestamp;

            processFrame();
        }

        animationFrame = requestAnimationFrame(cameraLoop);
    }

    // Start webcam
    async function startCamera() {

        try {

            if (!navigator.mediaDevices ||
                !navigator.mediaDevices.getUserMedia) {

                throw new Error(
                    "Camera access requires HTTPS or localhost."
                );
            }

            cameraError.textContent = "Requesting camera permission...";
            cameraError.style.display = "block";

            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: "user"
                },
                audio: false
            });

            cameraFeed.srcObject = cameraStream;

            await cameraFeed.play();

            cameraCanvas.width = cameraFeed.videoWidth;
            cameraCanvas.height = cameraFeed.videoHeight;

            cameraRunning = true;

            startButton.disabled = true;
            stopButton.disabled = false;

            setCameraStatus(true);

            cameraError.style.display = "none";

            animationFrame = requestAnimationFrame(cameraLoop);

        } catch (error) {

            console.error("Camera startup error:", error);

            setCameraStatus(false, error.message);
        }
    }

    // Stop webcam
    function stopCamera() {

        cameraRunning = false;

        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }

        if (cameraStream) {

            cameraStream.getTracks().forEach(track => track.stop());

            cameraStream = null;
        }

        cameraFeed.srcObject = null;

        startButton.disabled = false;
        stopButton.disabled = true;

        handCount.textContent = "0";
        fpsElement.textContent = "0.0";

        gestureElement.textContent = "NO GESTURE";
        gestureStat.textContent = "NO GESTURE";

        gestureDescription.textContent =
            descriptions["NO GESTURE"];

        setCameraStatus(false, "Camera stopped.");

        // Reset backend camera status
        fetch("/api/camera/stop", {
            method: "POST"
        }).catch(console.error);
    }

    startButton.addEventListener("click", startCamera);
    stopButton.addEventListener("click", stopCamera);

    // Cleanup when leaving dashboard
    window.addEventListener("pagehide", stopCamera);

    stopButton.disabled = true;

    setCameraStatus(false, "Click Start Camera to begin.");

});
