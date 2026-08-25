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
    var bgColor = getComputedStyle(document.documentElement).getPropertyValue("--global-bg-color").trim() || "#fff";
    ctx.fillStyle = bgColor;
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

  // --- Topographic contour map ---------------------------------------------
  // Port of the `topo_map` function from the flower-filtering notebook:
  // brightness is treated as "elevation", isolines are traced at evenly spaced
  // levels via marching squares, and each line is colored by sampling the
  // original photo at that point. Every TOPO_INDEX_EVERY-th level is drawn
  // thicker, like index contours on a real topo map.
  var TOPO_LEVELS = 16;
  var TOPO_BLUR_FRACTION = 0.02; // blur radius, relative to canvas width
  var TOPO_STEP = 4; // marching-squares grid step, px
  var TOPO_INDEX_EVERY = 5;
  var TOPO_LINE_WIDTH = 1;
  var TOPO_INDEX_LINE_WIDTH = 2;

  function computeElevationAndColor(img, width, height) {
    var off = document.createElement("canvas");
    off.width = width;
    off.height = height;
    var offCtx = off.getContext("2d");
    drawContainFit(offCtx, img, width, height);
    var colorData = offCtx.getImageData(0, 0, width, height).data;

    var blurOff = document.createElement("canvas");
    blurOff.width = width;
    blurOff.height = height;
    var blurCtx = blurOff.getContext("2d");
    blurCtx.filter = "blur(" + Math.max(1, Math.round(width * TOPO_BLUR_FRACTION)) + "px) grayscale(1)";
    blurCtx.drawImage(off, 0, 0);
    var blurData = blurCtx.getImageData(0, 0, width, height).data;

    var elevation = new Float32Array(width * height);
    for (var p = 0; p < width * height; p++) {
      elevation[p] = blurData[p * 4];
    }

    return { elevation: elevation, colorData: colorData };
  }

  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    var maxC = Math.max(r, g, b);
    var minC = Math.min(r, g, b);
    var l = (maxC + minC) / 2;
    var h = 0;
    var s = 0;
    var d = maxC - minC;
    if (d !== 0) {
      s = d / (1 - Math.abs(2 * l - 1));
      switch (maxC) {
        case r:
          h = ((g - b) / d) % 6;
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        default:
          h = (r - g) / d + 4;
          break;
      }
      h *= 60;
      if (h < 0) h += 360;
    }
    return [h, s, l];
  }

  function hslToRgb(h, s, l) {
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    var m = l - c / 2;
    var r, g, b;
    if (h < 60) {
      r = c;
      g = x;
      b = 0;
    } else if (h < 120) {
      r = x;
      g = c;
      b = 0;
    } else if (h < 180) {
      r = 0;
      g = c;
      b = x;
    } else if (h < 240) {
      r = 0;
      g = x;
      b = c;
    } else if (h < 300) {
      r = x;
      g = 0;
      b = c;
    } else {
      r = c;
      g = 0;
      b = x;
    }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }

  function sampleRgb(colorData, width, height, x, y) {
    var ix = Math.min(width - 1, Math.max(0, Math.round(x)));
    var iy = Math.min(height - 1, Math.max(0, Math.round(y)));
    var idx = (iy * width + ix) * 4;
    return [colorData[idx], colorData[idx + 1], colorData[idx + 2]];
  }

  // Linearly interpolate where `threshold` crosses the edge between two corner
  // values, instead of snapping to the fixed edge midpoint -- this is what makes
  // the contours follow smooth curves rather than a blocky, grid-aligned look.
  function interpEdge(val1, val2, threshold, p1, p2) {
    var t = (threshold - val1) / (val2 - val1);
    t = Math.max(0, Math.min(1, t));
    return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
  }

  // Minimal union-find so segments that touch (share an endpoint) can be grouped
  // into one connected line, even though marching squares naturally produces them
  // as separate per-cell pieces.
  function makeUnionFind(n) {
    var parent = new Array(n);
    for (var i = 0; i < n; i++) parent[i] = i;
    function find(x) {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    }
    function union(a, b) {
      var ra = find(a);
      var rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    }
    return { find: find, union: union };
  }

  function pointKey(pt) {
    return pt[0].toFixed(3) + "," + pt[1].toFixed(3);
  }

  // Standard 16-case marching squares with linear interpolation along crossed edges.
  // A brightness threshold typically produces several visually separate lines
  // scattered across the image (e.g. one loop around a flower petal, another in
  // the background) -- these are grouped into connected components (by shared
  // endpoints) so each is colored independently from the photo underneath *it*,
  // rather than one line's color being outvoted by a larger, unrelated one that
  // just happens to share the same brightness level.
  var TOPO_SATURATION_BOOST = 1.8;

  function drawContourLevel(ctx, elevation, colorData, width, height, threshold, step, lineWidth) {
    var allSegs = [];

    for (var y = 0; y + step < height; y += step) {
      for (var x = 0; x + step < width; x += step) {
        var tlVal = elevation[y * width + x];
        var trVal = elevation[y * width + (x + step)];
        var brVal = elevation[(y + step) * width + (x + step)];
        var blVal = elevation[(y + step) * width + x];
        var tl = tlVal >= threshold;
        var tr = trVal >= threshold;
        var br = brVal >= threshold;
        var bl = blVal >= threshold;
        var caseIdx = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
        if (caseIdx === 0 || caseIdx === 15) continue;

        var tlP = [x, y];
        var trP = [x + step, y];
        var brP = [x + step, y + step];
        var blP = [x, y + step];

        var topMid = interpEdge(tlVal, trVal, threshold, tlP, trP);
        var rightMid = interpEdge(trVal, brVal, threshold, trP, brP);
        var bottomMid = interpEdge(blVal, brVal, threshold, blP, brP);
        var leftMid = interpEdge(tlVal, blVal, threshold, tlP, blP);
        var segs;

        switch (caseIdx) {
          case 1:
            segs = [[leftMid, bottomMid]];
            break;
          case 2:
            segs = [[bottomMid, rightMid]];
            break;
          case 3:
            segs = [[leftMid, rightMid]];
            break;
          case 4:
            segs = [[topMid, rightMid]];
            break;
          case 5:
            segs = [
              [topMid, leftMid],
              [bottomMid, rightMid],
            ];
            break;
          case 6:
            segs = [[topMid, bottomMid]];
            break;
          case 7:
            segs = [[topMid, leftMid]];
            break;
          case 8:
            segs = [[topMid, leftMid]];
            break;
          case 9:
            segs = [[topMid, bottomMid]];
            break;
          case 10:
            segs = [
              [topMid, rightMid],
              [bottomMid, leftMid],
            ];
            break;
          case 11:
            segs = [[topMid, rightMid]];
            break;
          case 12:
            segs = [[leftMid, rightMid]];
            break;
          case 13:
            segs = [[bottomMid, rightMid]];
            break;
          case 14:
            segs = [[leftMid, bottomMid]];
            break;
          default:
            segs = [];
            break;
        }

        for (var s = 0; s < segs.length; s++) {
          var p1 = segs[s][0];
          var p2 = segs[s][1];
          var midX = (p1[0] + p2[0]) / 2;
          var midY = (p1[1] + p2[1]) / 2;
          var rgb = sampleRgb(colorData, width, height, midX, midY);
          var hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
          allSegs.push({ p1: p1, p2: p2, hue: hsl[0], sat: hsl[1], light: hsl[2] });
        }
      }
    }

    if (!allSegs.length) return;

    // Group into connected lines by shared endpoints.
    var uf = makeUnionFind(allSegs.length);
    var firstSegAtPoint = {};
    for (var segIdx = 0; segIdx < allSegs.length; segIdx++) {
      var keys = [pointKey(allSegs[segIdx].p1), pointKey(allSegs[segIdx].p2)];
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k];
        if (firstSegAtPoint[key] !== undefined) {
          uf.union(segIdx, firstSegAtPoint[key]);
        } else {
          firstSegAtPoint[key] = segIdx;
        }
      }
    }

    var groups = {};
    for (var gi = 0; gi < allSegs.length; gi++) {
      var root = uf.find(gi);
      if (!groups[root]) groups[root] = [];
      groups[root].push(allSegs[gi]);
    }

    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";

    Object.keys(groups).forEach(function (root) {
      var group = groups[root];
      drawGroup(ctx, group);
    });
  }

  // Colors one connected line from the mean of its own segments only. Hue is
  // averaged circularly (via sin/cos) rather than averaging raw RGB, since RGB
  // averaging across even a single consistent-hue, varied-brightness line drags
  // toward gray. The circular resultant length (`hueConcentration`, 0-1) says how
  // much this line's own sampled hues agree with each other; saturation is boosted
  // only in proportion to that agreement, so a truly consistent-color line reads
  // vividly correct while a line that (rarely, now that grouping is per-component)
  // still crosses mixed hues falls back toward gray instead of a wrong vivid one.
  function drawGroup(ctx, group) {
    var sumHueSin = 0;
    var sumHueCos = 0;
    var sumSat = 0;
    var sumLight = 0;
    for (var i = 0; i < group.length; i++) {
      var hueRad = (group[i].hue * Math.PI) / 180;
      sumHueSin += Math.sin(hueRad);
      sumHueCos += Math.cos(hueRad);
      sumSat += group[i].sat;
      sumLight += group[i].light;
    }

    var n = group.length;
    var meanSin = sumHueSin / n;
    var meanCos = sumHueCos / n;
    var hueConcentration = Math.sqrt(meanSin * meanSin + meanCos * meanCos);
    var meanHue = (Math.atan2(meanSin, meanCos) * 180) / Math.PI;
    if (meanHue < 0) meanHue += 360;
    var meanSat = sumSat / n;
    var meanLight = sumLight / n;
    var boostedSat = Math.min(1, meanSat * hueConcentration * TOPO_SATURATION_BOOST);
    var avgRgb = hslToRgb(meanHue, boostedSat, meanLight);
    var avgColor = "rgb(" + avgRgb[0] + "," + avgRgb[1] + "," + avgRgb[2] + ")";

    ctx.strokeStyle = avgColor;
    ctx.beginPath();
    for (var s = 0; s < group.length; s++) {
      ctx.moveTo(group[s].p1[0], group[s].p1[1]);
      ctx.lineTo(group[s].p2[0], group[s].p2[1]);
    }
    ctx.stroke();
  }

  function topoMap(canvas, img) {
    var width = canvas.width;
    var height = canvas.height;
    var ctx = canvas.getContext("2d");

    var bgColor = getComputedStyle(document.documentElement).getPropertyValue("--global-bg-color").trim() || "#fff";
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    var data = computeElevationAndColor(img, width, height);

    for (var i = 1; i <= TOPO_LEVELS; i++) {
      var threshold = (255 * i) / (TOPO_LEVELS + 1);
      var isIndex = i % TOPO_INDEX_EVERY === 0;
      drawContourLevel(ctx, data.elevation, data.colorData, width, height, threshold, TOPO_STEP, isIndex ? TOPO_INDEX_LINE_WIDTH : TOPO_LINE_WIDTH);
    }
  }

  function renderInto(containers, img, renderFn) {
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

      renderFn(canvas, img);
    });
  }

  function mountAll() {
    var stippleContainers = document.querySelectorAll(".procedural-icon");
    var topoContainers = document.querySelectorAll(".procedural-icon-topo");
    if (!stippleContainers.length && !topoContainers.length) return;

    // Both renderers share the same randomly picked photo per page load.
    var src = pickImageSrc();
    var img = new Image();
    img.onload = function () {
      renderInto(stippleContainers, img, stipple);
      renderInto(topoContainers, img, topoMap);
    };
    img.onerror = function () {
      console.warn("procedural-icon: failed to load " + src);
    };
    img.src = src;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountAll);
  } else {
    mountAll();
  }
})();
