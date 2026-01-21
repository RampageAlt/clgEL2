let masterPerimeter = null;
let tolerancePercent = 5;

function setTolerance(val) {
  tolerancePercent = parseFloat(val);
  document.getElementById("tolVal").innerText = val + "%";
}

function preprocess(src) {
  let gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  // Normalize lighting
  cv.equalizeHist(gray, gray);

  // Blur to reduce noise
  cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);

  return gray;
}

function findContoursRobust(src) {
  let gray = preprocess(src);

  let thresh = new cv.Mat();
  cv.adaptiveThreshold(
    gray,
    thresh,
    255,
    cv.ADAPTIVE_THRESH_GAUSSIAN_C,
    cv.THRESH_BINARY_INV,
    11,
    2
  );

  // Morph close to seal edges
  let kernel = cv.Mat.ones(5, 5, cv.CV_8U);
  cv.morphologyEx(thresh, thresh, cv.MORPH_CLOSE, kernel);

  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(
    thresh,
    contours,
    hierarchy,
    cv.RETR_EXTERNAL,
    cv.CHAIN_APPROX_SIMPLE
  );

  gray.delete();
  thresh.delete();
  hierarchy.delete();
  kernel.delete();

  return contours;
}

function detectCoinAndObject(src, draw = false) {
  let contours = findContoursRobust(src);

  if (contours.size() === 0) {
    throw "No contours detected";
  }

  let bestCoin = null;
  let bestCoinScore = 0;
  let objectContour = null;

  for (let i = 0; i < contours.size(); i++) {
    let cnt = contours.get(i);
    let area = cv.contourArea(cnt);

    if (area < 1000) continue;

    let perimeter = cv.arcLength(cnt, true);
    let circularity = 4 * Math.PI * area / (perimeter * perimeter);

    // Browser-safe circularity range
    if (circularity > 0.65 && area > bestCoinScore) {
      bestCoin = cnt;
      bestCoinScore = area;
    }
  }

  if (!bestCoin) {
    throw "Coin not detected";
  }

  // Largest contour other than coin = object
  let maxArea = 0;
  for (let i = 0; i < contours.size(); i++) {
    let cnt = contours.get(i);
    if (cnt === bestCoin) continue;
    let area = cv.contourArea(cnt);
    if (area > maxArea) {
      maxArea = area;
      objectContour = cnt;
    }
  }

  if (!objectContour) {
    throw "Object not detected";
  }

  if (draw) {
    let display = src.clone();
    cv.drawContours(display, new cv.MatVector([bestCoin]), -1, [0, 255, 0, 255], 3);
    cv.drawContours(display, new cv.MatVector([objectContour]), -1, [255, 0, 0, 255], 3);
    cv.imshow("outputCanvas", display);
    display.delete();
  }

  let coinPerimeter = cv.arcLength(bestCoin, true);
  let objPerimeter = cv.arcLength(objectContour, true);

  contours.delete();

  return { coinPerimeter, objPerimeter };
}

function captureMaster(src) {
  try {
    let res = detectCoinAndObject(src, true);
    masterPerimeter = res.objPerimeter;
    alert("Master captured successfully");
  } catch (e) {
    alert(e + ". Retake with coin fully visible.");
  }
}

function inspectSample(src) {
  if (!masterPerimeter) {
    alert("Capture master first");
    return;
  }

  try {
    let res = detectCoinAndObject(src, true);
    let diff = Math.abs(res.objPerimeter - masterPerimeter);
    let percent = (diff / masterPerimeter) * 100;

    if (percent <= tolerancePercent) {
      alert("PASS (" + percent.toFixed(2) + "%)");
    } else {
      alert("FAIL (" + percent.toFixed(2) + "%)");
    }
  } catch (e) {
    alert(e + ". Ensure coin and object are visible.");
  }
}
