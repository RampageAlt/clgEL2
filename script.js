// -----------------------------
// CONFIG
// -----------------------------
const COIN_DIAMETER_MM = 24.0;
const MIN_CONTOUR_AREA = 500;
const PASS_THRESHOLD = 95.0;

// -----------------------------
// STATE
// -----------------------------
let masterPerimeter = null;

// -----------------------------
// ELEMENTS
// -----------------------------
const masterBtn = document.getElementById("masterBtn");
const productBtn = document.getElementById("productBtn");
const masterInput = document.getElementById("masterInput");
const productInput = document.getElementById("productInput");
const preview = document.getElementById("preview");
const statusText = document.getElementById("status");

// -----------------------------
// OPENCV READY
// -----------------------------
cv.onRuntimeInitialized = () => {
  statusText.textContent = "Ready. Capture MASTER sample.";
};

// -----------------------------
// UI EVENTS
// -----------------------------
masterBtn.onclick = () => masterInput.click();
productBtn.onclick = () => productInput.click();

masterInput.onchange = e => handleImage(e, true);
productInput.onchange = e => handleImage(e, false);

// -----------------------------
// IMAGE HANDLING
// -----------------------------
function handleImage(e, isMaster) {
  const file = e.target.files[0];
  if (!file) return;

  const img = new Image();
  img.onload = () => {
    preview.src = img.src;
    preview.classList.remove("hidden");

    const src = cv.imread(preview);

    try {
      const result = measurePerimeter(src);

      // DRAW OVERLAYS
      if (isMaster) {
        drawOverlay(
          src,
          result.coin,
          result.object,
          result.circle,
          new cv.Scalar(255, 0, 0, 255),   // coin RED
          new cv.Scalar(0, 255, 0, 255)    // object GREEN
        );

        masterPerimeter = result.periMM;
        productBtn.disabled = false;
        statusText.textContent =
          `✅ MASTER stored: ${result.periMM.toFixed(2)} mm`;

      } else {
        drawOverlay(
          src,
          result.coin,
          result.object,
          result.circle,
          new cv.Scalar(255, 165, 0, 255), // coin ORANGE
          new cv.Scalar(0, 150, 255, 255)  // object BLUE
        );

        const match = computeMatch(result.periMM, masterPerimeter);
        const verdict =
          match >= PASS_THRESHOLD ? "PASS ✅" : "FAIL ❌";
        statusText.textContent =
          `${verdict} — ${match.toFixed(2)}% match`;
      }

      cv.imshow(preview, src);

    } catch (err) {
      console.error(err);
      statusText.textContent = "❌ Detection failed. Retake photo.";
    }

    src.delete();
  };

  img.src = URL.createObjectURL(file);
}

// -----------------------------
// DRAWING (VISUAL ONLY)
// -----------------------------
function drawOverlay(src, coinContour, objectContour, coinCircle, coinColor, objColor) {
  // draw object contour
  let v = new cv.MatVector();
  v.push_back(objectContour);
  cv.drawContours(src, v, -1, objColor, 3);
  v.delete();

  // draw coin circle
  cv.circle(
    src,
    new cv.Point(coinCircle.center.x, coinCircle.center.y),
    Math.round(coinCircle.radius),
    coinColor,
    3
  );
}

// -----------------------------
// CORE LOGIC (UNCHANGED)
// -----------------------------
function circularity(c) {
  const area = cv.contourArea(c);
  const peri = cv.arcLength(c, true);
  return peri === 0 ? 0 : 4 * Math.PI * area / (peri * peri);
}

function measurePerimeter(src) {
  let gray = new cv.Mat();
  let binary = new cv.Mat();

  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.threshold(
    gray, binary, 0, 255,
    cv.THRESH_BINARY_INV + cv.THRESH_OTSU
  );

  let kernel = cv.getStructuringElement(
    cv.MORPH_RECT, new cv.Size(5, 5)
  );
  cv.morphologyEx(binary, binary, cv.MORPH_CLOSE, kernel);

  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(
    binary, contours, hierarchy,
    cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE
  );

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
  let pxPerMM = (2 * circle.radius) / COIN_DIAMETER_MM;

  let object = valid
    .filter(c => c !== coin)
    .sort((a, b) => cv.contourArea(b) - cv.contourArea(a))[0];

  let periPx = cv.arcLength(object, true);
  let periMM = periPx / pxPerMM;

  gray.delete();
  binary.delete();
  contours.delete();
  hierarchy.delete();

  return {
    periMM,
    coin,
    object,
    circle
  };
}

function computeMatch(product, master) {
  const diff = Math.abs(product - master);
  return Math.max(0, 100 - (diff / master) * 100);
}
