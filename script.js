// -----------------------------
// CONFIG
// -----------------------------
const COIN_DIAMETER_MM = 24.0;
const MIN_CONTOUR_AREA = 500;
const PASS_THRESHOLD = 95.0;

let masterPerimeter = null;

// -----------------------------
// CAMERA SETUP
// -----------------------------
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const statusText = document.getElementById("status");

navigator.mediaDevices.getUserMedia({
  video: { facingMode: "environment" },
  audio: false
}).then(stream => {
  video.srcObject = stream;
}).catch(err => {
  statusText.textContent = "❌ Camera access denied";
});

// -----------------------------
// UTILS
// -----------------------------
function circularity(contour) {
  const area = cv.contourArea(contour);
  const peri = cv.arcLength(contour, true);
  if (peri === 0) return 0;
  return 4 * Math.PI * area / (peri * peri);
}

function captureFrame() {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0);
  return cv.imread(canvas);
}

// -----------------------------
// CORE MEASUREMENT
// -----------------------------
function measurePerimeter(src) {
  let gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  let binary = new cv.Mat();
  cv.threshold(gray, binary, 0, 255,
    cv.THRESH_BINARY_INV + cv.THRESH_OTSU
  );

  let kernel = cv.getStructuringElement(
    cv.MORPH_RECT,
    new cv.Size(5, 5)
  );
  cv.morphologyEx(binary, binary, cv.MORPH_CLOSE, kernel);

  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(
    binary,
    contours,
    hierarchy,
    cv.RETR_EXTERNAL,
    cv.CHAIN_APPROX_NONE
  );

  let validContours = [];
  for (let i = 0; i < contours.size(); i++) {
    let c = contours.get(i);
    if (cv.contourArea(c) > MIN_CONTOUR_AREA) {
      validContours.push(c);
    }
  }

  if (validContours.length < 2) {
    throw "Insufficient contours";
  }

  // -----------------------------
  // COIN DETECTION
  // -----------------------------
  let coin = validContours
    .map(c => ({
      c,
      score: Math.abs(circularity(c) - 1),
      area: cv.contourArea(c)
    }))
    .sort((a, b) => a.score - b.score || b.area - a.area)[0].c;

  let circle = cv.minEnclosingCircle(coin);
  let pixelsPerMM = (2 * circle.radius) / COIN_DIAMETER_MM;

  // -----------------------------
  // OBJECT
  // -----------------------------
  let object = validContours
    .filter(c => c !== coin)
    .sort((a, b) => cv.contourArea(b) - cv.contourArea(a))[0];

  let perimeterPx = cv.arcLength(object, true);
  let perimeterMM = perimeterPx / pixelsPerMM;

  gray.delete(); binary.delete(); hierarchy.delete(); contours.delete();
  return perimeterMM;
}

// -----------------------------
// MATCH LOGIC
// -----------------------------
function computeMatch(product, master) {
  let diff = Math.abs(product - master);
  return Math.max(0, 100 - (diff / master) * 100);
}

// -----------------------------
// UI ACTIONS
// -----------------------------
document.getElementById("captureMaster").onclick = () => {
  try {
    let src = captureFrame();
    masterPerimeter = measurePerimeter(src);
    statusText.textContent =
      `✅ MASTER stored: ${masterPerimeter.toFixed(2)} mm`;
    document.getElementById("captureProduct").disabled = false;
    src.delete();
  } catch (e) {
    statusText.textContent = "❌ Failed to detect master";
  }
};

document.getElementById("captureProduct").onclick = () => {
  try {
    let src = captureFrame();
    let product = measurePerimeter(src);
    let match = computeMatch(product, masterPerimeter);
    let verdict = match >= PASS_THRESHOLD ? "PASS ✅" : "FAIL ❌";
    statusText.textContent =
      `${verdict} — ${match.toFixed(2)}% match`;
    src.delete();
  } catch (e) {
    statusText.textContent = "❌ Measurement failed";
  }
};
