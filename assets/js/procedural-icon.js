(function () {
  var FALLBACK_IMAGE = "/assets/img/prof_pic.jpg";
  var CELL_SIZE = 4; // px per stippling cell, at output canvas resolution
  var MAX_DOTS_PER_CELL = 5;
  var DOT_RADIUS = 0.6;

  function pickImageSrc() {
    var images = window.PROCEDURAL_FLOWER_IMAGES;
    if (images && images.length) {
      return images[Math.floor(Math.random() * images.length)];
    }
    return FALLBACK_IMAGE;
  }

  // "Contain" fit: show the whole image, preserving its aspect ratio, letterboxed
  // (not cropped) within the canvas bounds.
  function getContainRect(img, width, height) {
    var imgRatio = img.naturalWidth / img.naturalHeight;
    var canvasRatio = width / height;
    var dw, dh, dx, dy;
    if (imgRatio > canvasRatio) {
      dw = width;
      dh = width / imgRatio;
      dx = 0;
      dy = (height - dh) / 2;
    } else {
      dh = height;
      dw = height * imgRatio;
      dy = 0;
      dx = (width - dw) / 2;
    }
    return { dx: dx, dy: dy, dw: dw, dh: dh };
  }

  function drawContainFit(ctx, img, width, height) {
    var rect = getContainRect(img, width, height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, rect.dx, rect.dy, rect.dw, rect.dh);
  }

  // A faint, blurred version of the photo behind the dots, for a soft backdrop hue.
  function drawBlurredBackdrop(ctx, img, width, height) {
    var rect = getContainRect(img, width, height);
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.filter = "blur(" + Math.round(width * 0.03) + "px)";
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, rect.dx, rect.dy, rect.dw, rect.dh);
    ctx.restore();
  }

  function stipple(canvas, img) {
    var width = canvas.width;
    var height = canvas.height;
    var ctx = canvas.getContext("2d");

    var off = document.createElement("canvas");
    off.width = width;
    off.height = height;
    var offCtx = off.getContext("2d");
    drawContainFit(offCtx, img, width, height);

    var imageData = offCtx.getImageData(0, 0, width, height).data;

    // First pass: average color per cell, plus its saturation (vividness). Flowers
    // are almost always more saturated than their backgrounds (leaves/soil/sky),
    // regardless of which is lighter or darker, so saturation is a more reliable
    // way to make the subject itself the dense/visible part than brightness is.
    var cols = Math.ceil(width / CELL_SIZE);
    var rows = Math.ceil(height / CELL_SIZE);
    var cellSaturation = new Array(cols * rows);
    var cellColor = new Array(cols * rows);
    var minS = 1;
    var maxS = 0;

    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        var cellX = col * CELL_SIZE;
        var cellY = row * CELL_SIZE;
        var cellW = Math.min(CELL_SIZE, width - cellX);
        var cellH = Math.min(CELL_SIZE, height - cellY);
        var sumR = 0;
        var sumG = 0;
        var sumBl = 0;
        var count = 0;
        for (var yy = 0; yy < cellH; yy++) {
          for (var xx = 0; xx < cellW; xx++) {
            var idx = ((cellY + yy) * width + (cellX + xx)) * 4;
            sumR += imageData[idx];
            sumG += imageData[idx + 1];
            sumBl += imageData[idx + 2];
            count++;
          }
        }
        var avgR = sumR / count / 255;
        var avgG = sumG / count / 255;
        var avgB = sumBl / count / 255;
        var maxC = Math.max(avgR, avgG, avgB);
        var minC = Math.min(avgR, avgG, avgB);
        var lightness = (maxC + minC) / 2;
        var delta = maxC - minC;
        var saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

        if (saturation < minS) minS = saturation;
        if (saturation > maxS) maxS = saturation;
        var cellIdx = row * cols + col;
        cellSaturation[cellIdx] = saturation;
        cellColor[cellIdx] = "rgb(" + Math.round(sumR / count) + "," + Math.round(sumG / count) + "," + Math.round(sumBl / count) + ")";
      }
    }

    var range = Math.max(maxS - minS, 0.05);

    var bgColor = getComputedStyle(document.documentElement).getPropertyValue("--global-bg-color").trim() || "#fff";

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);
    drawBlurredBackdrop(ctx, img, width, height);

    for (var r2 = 0; r2 < rows; r2++) {
      for (var c2 = 0; c2 < cols; c2++) {
        var cellIdx2 = r2 * cols + c2;
        var saturation2 = cellSaturation[cellIdx2];
        var stretched = (saturation2 - minS) / range; // 0 (dull) - 1 (vivid), contrast-stretched
        var prominence = Math.pow(stretched, 0.8); // gamma so mid saturations still show up
        var dotCount = Math.round(prominence * MAX_DOTS_PER_CELL);

        ctx.fillStyle = cellColor[cellIdx2];

        var x0 = c2 * CELL_SIZE;
        var y0 = r2 * CELL_SIZE;
        for (var i = 0; i < dotCount; i++) {
          var dx = x0 + Math.random() * CELL_SIZE;
          var dy = y0 + Math.random() * CELL_SIZE;
          ctx.beginPath();
          ctx.arc(dx, dy, DOT_RADIUS, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function mountIcons() {
    var containers = document.querySelectorAll(".procedural-icon");
    if (!containers.length) return;

    var src = pickImageSrc();
    var img = new Image();
    img.onload = function () {
      containers.forEach(function (container) {
        container.innerHTML = "";
        var width = Math.max(container.offsetWidth, 1);
        var height = Math.max(container.offsetHeight, width);
        var dpr = window.devicePixelRatio || 1;

        var canvas = document.createElement("canvas");
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.classList.add("procedural-icon-canvas");
        container.appendChild(canvas);

        stipple(canvas, img);
      });
    };
    img.onerror = function () {
      console.warn("procedural-icon: failed to load " + src);
    };
    img.src = src;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountIcons);
  } else {
    mountIcons();
  }
})();
