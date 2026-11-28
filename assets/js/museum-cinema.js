/* Independent museum shot: measurement and drawing only; no event listeners. */
(function () {
  'use strict';

  var story = document.querySelector('[data-museum-story]');
  var cinema = document.querySelector('[data-museum-cinema]');
  if (!story || !cinema) return;

  var copy = story.querySelector('[data-cinema-copy]');
  var flight = cinema.querySelector('[data-cinema-flight]');
  var image = cinema.querySelector('[data-cinema-image]');
  var svg = cinema.querySelector('[data-cinema-svg]');
  var data = window.MUSEUM_CINEMA_FRAMES;
  var paths = [];
  var lineRecords = [];
  var prepared = false;
  var ready = false;
  var failed = false;
  var lastFramePosition = -1;
  var lastDraw = -1;
  var NS = 'http://www.w3.org/2000/svg';

  function clamp(value) {
    return Math.max(0, Math.min(1, value));
  }

  function smoothstep(value) {
    var t = clamp(value);
    return t * t * (3 - 2 * t);
  }

  function easeInOutCubic(value) {
    var t = clamp(value);
    return t < 0.5 ? 4 * t * t * t : 1 - 4 * Math.pow(1 - t, 3);
  }

  function mix(a, b, amount) {
    return a + (b - a) * amount;
  }

  function number(value) {
    return Math.abs(value) < 0.000001 ? 0 : Number(value.toFixed(4));
  }

  function validFrames(value) {
    if (!value || !Array.isArray(value.frames) || value.frames.length !== 17 ||
      !Array.isArray(value.kinds) || !value.kinds.length ||
      !Array.isArray(value.angles) || value.angles.length !== value.frames.length ||
      !value.angles.every(Number.isFinite)) return false;
    var firstFrame = value.frames[0];
    if (!Array.isArray(firstFrame) || firstFrame.length !== value.kinds.length) return false;
    return value.frames.every(function (frame) {
      return Array.isArray(frame) && frame.length === value.kinds.length && frame.every(function (path, index) {
        var firstPath = firstFrame[index];
        return Array.isArray(path) && Array.isArray(firstPath) &&
          path.length >= 4 && path.length % 2 === 0 && path.length === firstPath.length &&
          path.every(Number.isFinite);
      });
    });
  }

  function buildPaths() {
    if (paths.length || !validFrames(data)) return;
    data.kinds.forEach(function (kind, index) {
      var path = document.createElementNS(NS, 'path');
      path.setAttribute('class', 'cinema-path--' + kind);
      path.setAttribute('pathLength', '1');
      path.setAttribute('stroke-dasharray', '1');
      path.setAttribute('stroke-dashoffset', '1');
      path.setAttribute('data-cinema-path', String(index));
      svg.appendChild(path);
      paths.push(path);
    });
  }

  function prepare(onSettled) {
    buildPaths();
    if (ready || failed || !image.dataset.cinemaSrc) return;
    if (prepared) return;
    prepared = true;
    var loader = new Image();
    loader.decoding = 'async';
    loader.onload = function () {
      var decoded = loader.decode ? loader.decode() : Promise.resolve();
      decoded.then(function () {
        image.removeAttribute('srcset');
        image.removeAttribute('sizes');
        image.src = image.dataset.cinemaSrc;
        var displayed = image.decode ? image.decode() : Promise.resolve();
        displayed.then(function () {
          ready = true;
          if (onSettled) onSettled();
        }, function () {
          failed = true;
          if (onSettled) onSettled();
        });
      }, function () {
        failed = true;
        if (onSettled) onSettled();
      });
    };
    loader.onerror = function () {
      failed = true;
      if (onSettled) onSettled();
    };
    loader.src = image.dataset.cinemaSrc;
  }

  function measure() {
    lineRecords = [];
    if (!copy) return;
    var previousDisplay = copy.style.display;
    /* Inactive fixed copy is display:none; reveal it synchronously only for measurement. */
    copy.style.display = 'block';
    var lines = copy.querySelectorAll('[data-cinema-line]');
    Array.prototype.forEach.call(lines, function (line) {
      var left = line.querySelector('.cinema-half--left');
      var right = line.querySelector('.cinema-half--right');
      if (!left || !right) return;
      left.style.transform = 'none';
      right.style.transform = 'none';
    });
    Array.prototype.forEach.call(lines, function (line) {
      var left = line.querySelector('.cinema-half--left');
      var right = line.querySelector('.cinema-half--right');
      if (!left || !right) return;
      var lineRect = line.getBoundingClientRect();
      var leftRect = left.getBoundingClientRect();
      var rightRect = right.getBoundingClientRect();
      if (lineRect.width <= 0 || lineRect.height <= 0) return;
      lineRecords.push({
        left: left,
        right: right,
        whole: line.hasAttribute('data-cinema-whole'),
        top: lineRect.top,
        bottom: lineRect.bottom,
        leftLeft: leftRect.left,
        leftRight: leftRect.right,
        rightLeft: rightRect.left,
        rightRight: rightRect.right
      });
    });
    if (previousDisplay) copy.style.display = previousDisplay;
    else copy.style.removeProperty('display');
    lastFramePosition = -1;
    lastDraw = -1;
  }

  function pathData(first, second, amount) {
    var result = '';
    for (var index = 0; index < first.length; index += 2) {
      var x = second ? mix(first[index], second[index], amount) : first[index];
      var y = second ? mix(first[index + 1], second[index + 1], amount) : first[index + 1];
      result += (index === 0 ? 'M' : 'L') + number(x) + ' ' + number(y);
    }
    return result;
  }

  function drawFrame(progress, draw) {
    if (!paths.length || !validFrames(data)) return;
    var framePosition = clamp((progress - 0.20) / 0.62) * (data.frames.length - 1);
    if (Math.abs(framePosition - lastFramePosition) > 0.00001) {
      var firstIndex = Math.min(data.frames.length - 1, Math.floor(framePosition));
      var secondIndex = Math.min(data.frames.length - 1, firstIndex + 1);
      var amount = framePosition - firstIndex;
      paths.forEach(function (path, index) {
        path.setAttribute('d', pathData(data.frames[firstIndex][index], data.frames[secondIndex][index], amount));
      });
      svg.setAttribute('data-cinema-frame', framePosition.toFixed(4));
      svg.setAttribute('data-cinema-angle', number(mix(data.angles[firstIndex], data.angles[secondIndex], amount)) + 'deg');
      lastFramePosition = framePosition;
    }
    if (Math.abs(draw - lastDraw) > 0.00001) {
      paths.forEach(function (path, index) {
        var stagger = index / Math.max(1, paths.length - 1) * 0.24;
        var localDraw = clamp(draw * 1.24 - stagger);
        path.setAttribute('stroke-dashoffset', number(1 - localDraw));
      });
      lastDraw = draw;
    }
  }

  function avoidText(box, width) {
    var gap = Math.max(18, width * 0.012);
    var edge = 20;
    lineRecords.forEach(function (record) {
      var intersects = record.bottom > box.top && record.top < box.bottom;
      if (!intersects) {
        record.left.style.transform = 'none';
        record.right.style.transform = 'none';
        return;
      }
      if (record.whole) {
        var wholeCenter = (record.leftLeft + record.rightRight) * 0.5;
        var boxCenter = (box.left + box.right) * 0.5;
        var wholeShift = wholeCenter < boxCenter ?
          Math.min(0, box.left - gap - record.rightRight) :
          Math.max(0, box.right + gap - record.leftLeft);
        wholeShift = Math.max(wholeShift, edge - record.leftLeft);
        wholeShift = Math.min(wholeShift, width - edge - record.rightRight);
        var wholeTransform = Math.abs(wholeShift) < 0.000001 ? 'none' :
          'translate3d(' + number(wholeShift) + 'px,0,0)';
        record.left.style.transform = wholeTransform;
        record.right.style.transform = wholeTransform;
        return;
      }
      var leftShift = Math.min(0, box.left - gap - record.leftRight);
      var rightShift = Math.max(0, box.right + gap - record.rightLeft);
      leftShift = Math.max(leftShift, edge - record.leftLeft);
      rightShift = Math.min(rightShift, width - edge - record.rightRight);
      record.left.style.transform = Math.abs(leftShift) < 0.000001 ? 'none' :
        'translate3d(' + number(leftShift) + 'px,0,0)';
      record.right.style.transform = Math.abs(rightShift) < 0.000001 ? 'none' :
        'translate3d(' + number(rightShift) + 'px,0,0)';
    });
  }

  function render(progress, width, height) {
    if (!flight || !image || !svg) return;
    var p = clamp(progress);
    var fly = easeInOutCubic(p / 0.20);
    var handoff = smoothstep((p - 0.82) / 0.18);
    var handoffFade = smoothstep((p - 0.90) / 0.10);
    var initialWidth = width * 0.30;
    var landedWidth = width * 0.54;
    var targetWidth = width * 0.47917;
    var targetHeight = height * 0.48;
    var flightWidth = mix(initialWidth, landedWidth, fly);
    var flightHeight = flightWidth * (848 / 1600);
    var centerX = width * 0.5;
    var centerY = mix(height * 0.82, height * 0.50, fly);
    flightWidth = mix(flightWidth, targetWidth, handoff);
    flightHeight = mix(flightHeight, targetHeight, handoff);
    centerY = mix(centerY, height * 0.511, handoff);

    var left = centerX - flightWidth / 2;
    var top = centerY - flightHeight / 2;
    flight.style.width = number(flightWidth) + 'px';
    flight.style.height = number(flightHeight) + 'px';
    flight.style.transform = 'translate3d(' + number(left) + 'px,' + number(top) + 'px,0)';

    var draw = smoothstep((p - 0.20) / 0.09);
    var photoOpacity = (1 - smoothstep((p - 0.20) / 0.07)) * (1 - handoffFade);
    var drawingOpacity = smoothstep((p - 0.20) / 0.045) * (1 - handoffFade);
    image.style.opacity = String(number(photoOpacity));
    svg.style.opacity = String(number(drawingOpacity));
    drawFrame(p, draw);
    avoidText({ left: left, right: left + flightWidth, top: top, bottom: top + flightHeight }, width);

    if (copy) {
      var copyOpacity = 1 - smoothstep((p - 0.22) / 0.12);
      copy.style.opacity = String(number(copyOpacity));
      copy.style.visibility = copyOpacity <= 0.001 ? 'hidden' : 'visible';
      copy.style.pointerEvents = copyOpacity > 0.2 ? 'auto' : 'none';
    }
    story.setAttribute('data-cinema-progress', p.toFixed(5));
    story.setAttribute('data-cinema-flight-box', [left, top, flightWidth, flightHeight].map(number).join(','));
    cinema.setAttribute('data-cinema-asset', ready ? 'cutout' : (failed ? 'fallback' : 'loading'));
  }

  function reset() {
    lineRecords.forEach(function (record) {
      record.left.style.removeProperty('transform');
      record.right.style.removeProperty('transform');
    });
    lineRecords = [];
    if (copy) {
      copy.style.removeProperty('opacity');
      copy.style.removeProperty('visibility');
      copy.style.removeProperty('pointer-events');
    }
    if (flight) {
      flight.style.removeProperty('width');
      flight.style.removeProperty('height');
      flight.style.removeProperty('transform');
    }
    if (image) image.style.removeProperty('opacity');
    if (svg) svg.style.removeProperty('opacity');
    story.removeAttribute('data-cinema-progress');
    story.removeAttribute('data-cinema-flight-box');
    lastFramePosition = -1;
    lastDraw = -1;
  }

  window.MuseumCinema = {
    available: Boolean(flight && image && svg && validFrames(data)),
    prepare: prepare,
    measure: measure,
    render: render,
    reset: reset
  };
}());
