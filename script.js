// =============================
// CONFIG (MATCH PYTHON)
// =============================
const COIN_DIAMETER_MM = 24.0;
const MIN_CONTOUR_AREA = 500;
const WINDOW_W = 900;
const WINDOW_H = 700;

// =============================
let masterPerimeter = null;

// =============================
const masterBtn = document.getElementById("masterBtn");
const productBtn = document.getElementById("productBtn");
const masterInput = document.getElementById("masterInput");
const productInput = document.getElementById("productInput");
const preview = document.getElementById("preview");
const statusText = document.getElementById("status");

// =============================
masterBtn.onclick = () => masterInput.click();
productBtn.onclick = () => productInput.click();

masterInput.onchange = e => handleImage(e, true);
productInput.onchange = e => handleImage(e, false);

// =============================
function handleImage(e, isMaster) {
  const file = e.target.files[0];
  if (!file) return;

  const img = new Image();
  img.onload = () => {
    preview.src = img.src;

    let src = cv.imread(img);

    try {
      if (isMaster) {
        masterPerimeter = measurePerimeter(src);
        productBtn.disabled = false;
        statusText.textContent =
          `MASTER stored: ${masterPerimeter.toFixed(2)} mm`;
      } else {
        const productPerimeter = measurePerimeter(src);
        const match = computeMatch(productPerimeter, masterPerimeter);
        statusText.textContent =
          `${match >= 95 ? "PASS" : "FAIL"} — ${match.toFixed(2)}%`;
      }
    } catch (err) {
      console.error(err);
      statusText.textContent =
        "Detection failed. Retake photo.";
    }

    src.delete();
  };

  img.src = URL.createObjectURL(file);
}

// =============================
// CORE LOGIC — EXACT PYTHON PORT
// =============================
function circularity(contour) {
  const area = cv.contourArea(contour);
  const peri = cv.arcLength(contour, true);
  if (peri === 0) return 0;
  return 4 * Math.PI * area / (peri * peri);
}

function measurePerimeter(image) {

  // Resize (CRITICAL)
  let resized = new cv.Mat();
  const scale = Math.min(
    WINDOW_W / image.cols,
    WINDOW_H / image.rows
  );
  cv.resize(image, resized, new cv.Size(0, 0), scale, scale);

  // Grayscale
  let gray = new cv.Mat();
  cv.cvtColor(resized, gray, cv.COLOR_RGBA2GRAY);

  // OTSU + INV
  let binary = new cv.Mat();
  cv.threshold(
    gray,
    binary,
    0,
    255,
    cv.THRESH_BINARY_INV | cv.THRESH_OTSU
  );

  // Morph close
  let kernel = cv.getStructuringElement(
    cv.MORPH_RECT,
    new cv.Size(5, 5)
  );
  cv.morphologyEx(binary, binary, cv.MORPH_CLOSE, kernel);

  // Contours
  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(
    binary,
    contours,
    hierarchy,
    cv.RETR_EXTERNAL,
    cv.CHAIN_APPROX_NONE
  );

  let valid = [];
  for (let i = 0; i < contours.size(); i++) {
    let c = contours.get(i);
    if (cv.contourArea(c) > MIN_CONTOUR_AREA) {
      valid.push(c);
    }
  }

  if (valid.length < 2)
    throw "Insufficient contours";

  // Coin detection
  let coinCandidates = valid.map(c => ({
    c,
    diff: Math.abs(circularity(c) - 1.0),
    area: cv.contourArea(c)
  }));

  coinCandidates.sort(
    (a, b) => a.diff - b.diff || b.area - a.area
  );

  let coin = coinCandidates[0].c;
  let circle = cv.minEnclosingCircle(coin);
  let pixelsPerMM = (2 * circle.radius) / COIN_DIAMETER_MM;

  // Object contour
  let object = valid
    .filter(c => c !== coin)
    .reduce((a, b) =>
      cv.contourArea(a) > cv.contourArea(b) ? a : b
    );

  let perimeterPx = cv.arcLength(object, true);
  let perimeterMM = perimeterPx / pixelsPerMM;

  // Cleanup
  resized.delete();
  gray.delete();
  binary.delete();
  contours.delete();
  hierarchy.delete();

  return perimeterMM;
}

// =============================
function computeMatch(product, master) {
  const diff = Math.abs(product - master);
  return Math.max(0, 100 - (diff / master) * 100);
}

