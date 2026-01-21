// -----------------------------
// CONFIG
// -----------------------------
const COIN_DIAMETER_MM = 24.0;

// dynamic minimum area factor
const MIN_AREA_RATIO = 0.001; // 0.1% of image area

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

const tolSlider = document.getElementById("tolerance");
const tolValue = document.getElementById("tolValue");

// -----------------------------
// UI
// -----------------------------
tolValue.textContent = tolSlider.value;
tolSlider.oninput = () => tolValue.textContent = tolSlider.value;

// -----------------------------
cv.onRuntimeInitialized = () => {};

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
      if (isMaster) {
        const result = measureAndAnnotate(src);
        masterPerimeter = result.perimeter;
        productBtn.disabled = false;
        statusText.textContent =
          `MASTER stored: ${masterPerimeter.toFixed(2)} mm`;
      } else {
        const perimeter = measurePerimeter(src);
        const match = computeMatch(perimeter, masterPerimeter);
        const tolerance = parseFloat(tolSlider.value);
        const verdict = match >= (100 - tolerance) ? "PASS" : "FAIL";
        statusText.textContent =
          `${verdict} — ${match.toFixed(2)}% match`;
      }
    } catch (err) {
      console.error(err);
      statusText.textContent =
        "Detection failed. Ensure coin + part are visible.";
    }

    src.delete();
  };

  img.src = URL.createObjectURL(file);
}

// -----------------------------
// CORE MEASUREMENT
// -----------------------------
function circularity(c) {
  const area = cv.contourArea(c);
  const peri = cv.arcLength(c, true);
  return peri === 0 ? 0 : 4 * Math.PI * area / (peri * peri);
}

function measurePerimeter(src) {
  return measureAndAnnotate(src).perimeter;
}

function measureAndAnnotate(src) {

  let gray = new cv.Mat();
  let blurred = new cv.Mat();
  let binary = new cv.Mat();

  // 1️⃣ grayscale
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  // 2️⃣ blur (CRITICAL)
  cv.GaussianBlur(gray, blurred, new cv.Size(7, 7), 0);

  // 3️⃣ adaptive threshold (phone-safe)
  cv.adaptiveThreshold(
    blurred,
    binary,
    255,
    cv.ADAPTIVE_THRESH_GAUSSIAN_C,
    cv.THRESH_BINARY_INV,
    31,
    5
  );

  // 4️⃣ morphology
  let kernel = cv.getStructuringElement(
    cv.MORPH_ELLIPSE,
    new cv.Size(5, 5)
  );

  cv.morphologyEx(binary, binary, cv.MORPH_OPEN, kernel);
  cv.morphologyEx(binary, binary, cv.MORPH_CLOSE, kernel);

  // 5️⃣ contours
  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(
    binary,
    contours,
    hierarchy,
    cv.RETR_EXTERNAL,
    cv.CHAIN_APPROX_NONE
  );

  const imgArea = src.rows * src.cols;
  const minArea = imgArea * MIN_AREA_RATIO;

  let valid = [];
  for (let i = 0; i < contours.size(); i++) {
    let c = contours.get(i);
    if (cv.contourArea(c) > minArea) valid.push(c);
  }

  if (valid.length < 2)
    throw "Contours missing";

  // 6️⃣ coin detection
  let coin = valid
    .map(c => ({
      c,
      score: Math.abs(circularity(c) - 1),
      area: cv.contourArea(c)
    }))
    .sort((a, b) => a.score - b.score || b.area - a.area)[0].c;

  let circle = cv.minEnclosingCircle(coin);
  let pxPerMM = (2 * circle.radius) / COIN_DIAMETER_MM;

  // 7️⃣ object
  let object = valid
    .filter(c => c !== coin)
    .sort((a, b) => cv.contourArea(b) - cv.contourArea(a))[0];

  let periPx = cv.arcLength(object, true);
  let periMM = periPx / pxPerMM;

  // 8️⃣ annotate
  let annotated = src.clone();

  cv.drawContours(
    annotated,
    new cv.MatVector(object),
    -1,
    new cv.Scalar(0, 255, 0, 255),
    3
  );

  cv.circle(
    annotated,
    new cv.Point(circle.center.x, circle.center.y),
    Math.round(circle.radius),
    new cv.Scalar(0, 150, 255, 255),
    3
  );

  cv.putText(
    annotated,
    `Perimeter: ${periMM.toFixed(2)} mm`,
    new cv.Point(20, 40),
    cv.FONT_HERSHEY_SIMPLEX,
    1,
    new cv.Scalar(255, 255, 255, 255),
    2
  );

  cv.imshow(preview, annotated);

  gray.delete();
  blurred.delete();
  binary.delete();
  contours.delete();
  hierarchy.delete();

  return { perimeter: periMM };
}

// -----------------------------
function computeMatch(product, master) {
  const diff = Math.abs(product - master);
  return Math.max(0, 100 - (diff / master) * 100);
}

