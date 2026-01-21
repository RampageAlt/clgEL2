// -----------------------------
// CONFIG
// -----------------------------
const COIN_DIAMETER_MM = 24.0;
const MIN_CONTOUR_AREA = 500;
const PASS_THRESHOLD = 95.0;

let masterPerimeter = null;
let cvReady = false;

// -----------------------------
// ELEMENTS
// -----------------------------
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const statusText = document.getElementById("status");
const masterBtn = document.getElementById("masterBtn");
const productBtn = document.getElementById("productBtn");

// -----------------------------
// CAMERA
// -----------------------------
navigator.mediaDevices.getUserMedia({
  video: { facingMode: "environment" },
  audio: false
})
.then(stream => {
  video.srcObject = stream;
  statusText.textContent = "Camera ready. Capture MASTER sample.";
})
.catch(() => {
  statusText.textContent = "❌ Camera access denied";
});

// -----------------------------
// OPENCV READY CHECK
// -----------------------------
let checkCV = setInterval(() => {
  if (cv && cv.Mat) {
    cvReady = true;
    clearInterval(checkCV);
  }
}, 100);

// -----------------------------
// UTIL FUNCTIONS
// -----------------------------
function freezeFrame() {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0);
  canvas.style.display = "block";
  video.style.display = "none";
  return cv.imread(canvas);
}

function circularity(contour) {
  const area = cv.contourArea(contour);
  const peri = cv.arcLength(contour, true);
  return peri === 0 ? 0 : 4 * Math.PI * area / (peri * peri);
}

// -----------------------------
// MEASUREMENT CORE
// -----------------------------
function measurePerimeter(src) {
  let gray = new cv.Mat();
  let binary = new cv.Mat();

  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.threshold(gray, binary, 0, 255,
    cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

  let kernel = cv.getStructuringElement(
    cv.MORPH_RECT,
    new cv.Size(5, 5)
  );
  cv.morphologyEx(binary, binary, cv.MORPH_CLOSE, kernel);

  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(binary, contours, hierarchy,
    cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);

  let valid = [];
  for (let i = 0; i < contours.size(); i++) {
    let c = contours.get(i);
    if (cv.contourArea(c) > MIN_CONTOUR_AREA) valid.push(c);
  }

  if (valid.length < 2) throw "Not enough contours";

  let coin = valid
    .map(c => ({
      c,
      score: Math.abs(circularity(c) - 1),
      area: cv.contourArea(c)
    }))
    .sort((a, b) => a.score - b.score || b.area - a.area)[0].c;

  let circle = cv.minEnclosingCircle(coin);
  let pixelsPerMM = (2 * circle.radius) / COIN_DIAMETER_MM;

  let object = valid
    .filter(c => c !== coin)
    .sort((a, b) => cv.contourArea(b) - cv.contourArea(a))[0];

  let perimeterPx = cv.arcLength(object, true);
  let perimeterMM = perimeterPx / pixelsPerMM;

  gray.delete(); binary.delete(); contours.delete(); hierarchy.delete();
  return perimeterMM;
}

// -----------------------------
// BUTTON HANDLERS
// -----------------------------
masterBtn.onclick = () => {
  if (!cvReady) {
    statusText.textContent = "Loading OpenCV… wait";
    return;
  }

  try {
    let src = freezeFrame();
    masterPerimeter = measurePerimeter(src);
    statusText.textContent =
      `✅ MASTER stored: ${masterPerimeter.toFixed(2)} mm`;
    productBtn.disabled = false;
    src.delete();
  } catch {
    statusText.textContent = "❌ MASTER detection failed";
  }
};

productBtn.onclick = () => {
  try {
    let src = freezeFrame();
    let product = measurePerimeter(src);
    let match = Math.max(
      0,
      100 - Math.abs(product - masterPerimeter) / masterPerimeter * 100
    );
    let verdict = match >= PASS_THRESHOLD ? "PASS ✅" : "FAIL ❌";
    statusText.textContent =
      `${verdict} — ${match.toFixed(2)}% match`;
    src.delete();
  } catch {
    statusText.textContent = "❌ PRODUCT detection failed";
  }
};
