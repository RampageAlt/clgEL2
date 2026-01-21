let video = document.getElementById("video");
let canvas = document.getElementById("canvas");
let ctx = canvas.getContext("2d");

let masterPerimeter = null;
let tolerance = 5;

const COIN_DIAMETER_MM = 24.0;

function onOpenCvReady() {
  document.getElementById("status").innerText = "OpenCV Ready";
  startCamera();

  document.getElementById("captureMaster").disabled = false;
  document.getElementById("captureProduct").disabled = false;
}

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" }
  });
  video.srcObject = stream;
}

document.getElementById("tolerance").oninput = e => {
  tolerance = Number(e.target.value);
  document.getElementById("tolVal").innerText = tolerance;
};

document.getElementById("captureMaster").onclick = () => {
  masterPerimeter = captureAndMeasure(true);
};

document.getElementById("captureProduct").onclick = () => {
  if (!masterPerimeter) {
    alert("Capture master first");
    return;
  }
  captureAndMeasure(false);
};

function captureAndMeasure(isMaster) {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0);

  let src = cv.imread(canvas);
  let gray = new cv.Mat();
  let binary = new cv.Mat();

  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, gray, new cv.Size(5,5), 0);
  cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);

  if (contours.size() < 2) {
    document.getElementById("result").innerText = "Detection failed – ensure coin & object visible";
    return null;
  }

  let bestCoin = null;
  let bestScore = 999;

  for (let i = 0; i < contours.size(); i++) {
    let c = contours.get(i);
    let area = cv.contourArea(c);
    if (area < 500) continue;

    let peri = cv.arcLength(c, true);
    let circ = (4 * Math.PI * area) / (peri * peri);
    let score = Math.abs(circ - 1);

    if (score < bestScore) {
      bestScore = score;
      bestCoin = c;
    }
  }

  if (!bestCoin) {
    document.getElementById("result").innerText = "Coin not detected";
    return null;
  }

  let circle = cv.minEnclosingCircle(bestCoin);
  let pixelsPerMM = (2 * circle.radius) / COIN_DIAMETER_MM;

  let objectContour = null;
  let maxArea = 0;

  for (let i = 0; i < contours.size(); i++) {
    let c = contours.get(i);
    let area = cv.contourArea(c);
    if (area > maxArea && c !== bestCoin) {
      maxArea = area;
      objectContour = c;
    }
  }

  let perimeterPX = cv.arcLength(objectContour, true);
  let perimeterMM = perimeterPX / pixelsPerMM;

  cv.drawContours(src, contours, -1, new cv.Scalar(0,255,0,255), 2);
  cv.imshow(canvas, src);

  src.delete(); gray.delete(); binary.delete(); contours.delete(); hierarchy.delete();

  if (isMaster) {
    document.getElementById("result").innerText =
      `Master stored: ${perimeterMM.toFixed(2)} mm`;
    return perimeterMM;
  } else {
    let diff = Math.abs(perimeterMM - masterPerimeter);
    let match = 100 - (diff / masterPerimeter) * 100;
    let pass = match >= (100 - tolerance);

    document.getElementById("result").innerText =
      `${pass ? "PASS" : "FAIL"} — ${match.toFixed(2)}%`;

    return perimeterMM;
  }
}

