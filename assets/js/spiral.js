/* TRACES OF LIN - one bounded scheduler for the museum shot and CSS 3D gallery. */
(function () {
  'use strict';

  var root = document.querySelector('[data-spiral-gallery]');
  if (!root) return;

  var stage = root.querySelector('[data-spiral-stage]');
  var world = root.querySelector('[data-spiral-world]');
  var tiles = Array.prototype.slice.call(root.querySelectorAll('[data-spiral-tile]'));
  var story = document.querySelector('[data-museum-story]');
  var cinema = window.MuseumCinema;
  if (!stage || !world || tiles.length !== 6) return;
  var lastIndex = tiles.length - 1;

  var mobileQuery = window.matchMedia('(max-width: 767px), (pointer: coarse)');
  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var enhanced = false;
  var storyInView = true;
  var galleryInView = true;
  var projectOpen = document.body.classList.contains('has-project');
  var suspended = false;
  var frame = 0;
  var needsMeasure = true;
  var width = 0;
  var height = 0;
  var start = 0;
  var range = 1;
  var cinemaStart = 0;
  var cinemaRange = 1;
  var lastProgress = -1;
  var lastCinemaProgress = -1;
  var resizeProgress = null;
  var resizeCinemaProgress = null;
  var projectProgress = null;
  var projectCinemaProgress = null;
  var staticReturnPending = false;
  var staticReturnTarget = root;
  var cinemaWasActive = false;
  var initialized = false;
  var observer = null;
  var languageObserver = null;

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

  function number(value) {
    return Math.abs(value) < 0.000001 ? 0 : Number(value.toFixed(5));
  }

  function canEnhance() {
    return !mobileQuery.matches && !motionQuery.matches &&
      window.CSS && CSS.supports('transform-style', 'preserve-3d') &&
      CSS.supports('perspective', '1000px');
  }

  function cinemaEnabled() {
    return Boolean(enhanced && story && cinema && cinema.available);
  }

  function measurePositions() {
    var rootRect = root.getBoundingClientRect();
    var scrollY = window.scrollY;
    start = rootRect.top + scrollY - height * 0.6;
    range = Math.max(1, root.offsetHeight);
    if (story) {
      var storyRect = story.getBoundingClientRect();
      cinemaStart = storyRect.top + scrollY - height * 0.6;
      cinemaRange = Math.max(1, start - cinemaStart);
    }
  }

  function measure() {
    if (!enhanced) return;
    width = document.documentElement.clientWidth;
    height = window.innerHeight;
    measurePositions();
    stage.style.perspective = (width * 1.6) + 'px';

    tiles.forEach(function (tile, index) {
      var image = tile.querySelector('img');
      var ratio = Number(image.getAttribute('width')) / Number(image.getAttribute('height'));
      var cardWidth = width * (ratio < 0.85 ? 0.24446 : 0.45235);
      if (index === 0 || index === lastIndex) cardWidth = width * 0.47917;
      tile.style.width = cardWidth + 'px';
      tile.style.height = height * 0.48 + 'px';
    });

    if (cinemaEnabled()) cinema.measure();
    needsMeasure = false;
    lastProgress = -1;
    lastCinemaProgress = -1;
  }

  function clearCinema() {
    if (cinemaWasActive && cinema) {
      cinema.reset();
      needsMeasure = true;
    }
    cinemaWasActive = false;
    if (story) story.classList.remove('is-cinema-active');
  }

  function render() {
    frame = 0;
    if (suspended || projectOpen || document.hidden) return;
    if (!enhanced) {
      restoreStaticPosition();
      return;
    }
    if (document.documentElement.clientWidth !== width || window.innerHeight !== height) needsMeasure = true;
    if (needsMeasure) measure();
    measurePositions();

    if (resizeCinemaProgress !== null) {
      var resizedCinemaTop = cinemaStart + cinemaRange * resizeCinemaProgress;
      resizeCinemaProgress = null;
      resizeProgress = null;
      if (Math.abs(window.scrollY - resizedCinemaTop) > 0.5) {
        window.scrollTo({ top: resizedCinemaTop, behavior: 'instant' });
      }
    } else if (resizeProgress !== null) {
      var resizedTop = start + range * resizeProgress;
      resizeProgress = null;
      if (Math.abs(window.scrollY - resizedTop) > 0.5) {
        window.scrollTo({ top: resizedTop, behavior: 'instant' });
      }
    }

    if (cinemaEnabled()) {
      var approachRect = story.getBoundingClientRect();
      if (approachRect.top < height * 2.2 && approachRect.bottom > -height) {
        cinema.prepare(function () {
          needsMeasure = true;
          schedule();
        });
      }
    }

    var cinemaRaw = (window.scrollY - cinemaStart) / cinemaRange;
    var cinemaProgress = clamp(cinemaRaw);
    var rawProgress = (window.scrollY - start) / range;
    var progress = clamp(rawProgress);
    var cinemaActive = cinemaEnabled() && storyInView && cinemaRaw >= -0.0001 && cinemaRaw < 1;
    var sceneActive = galleryInView && rawProgress >= -1 / range && rawProgress < 0.999;
    var handoffActive = cinemaActive && cinemaProgress >= 0.82;
    var sharedActive = cinemaActive || sceneActive;
    var handoffBlend = handoffActive ? smoothstep((cinemaProgress - 0.90) / 0.10) : 0;

    root.classList.toggle('is-shared-active', sharedActive);
    root.classList.toggle('is-cinema-active', cinemaActive);
    root.classList.toggle('is-handoff-active', handoffActive);
    root.classList.toggle('is-scene-active', sceneActive);
    root.setAttribute('data-spiral-progress', progress.toFixed(5));
    if (story) story.classList.toggle('is-cinema-active', cinemaActive);

    if (cinemaActive) {
      cinema.render(cinemaProgress, width, height);
      cinemaWasActive = true;
      lastCinemaProgress = cinemaProgress;
    } else {
      clearCinema();
      lastCinemaProgress = -1;
    }

    if (!sharedActive) {
      lastProgress = -1;
      return;
    }
    if (sceneActive && !cinemaActive && progress === lastProgress) return;
    lastProgress = sceneActive ? progress : -1;

    if (!sceneActive && !handoffActive) return;

    var enter = smoothstep(progress / 0.22);
    var intro = easeInOutCubic(progress / 0.36);
    var turn = easeInOutCubic((progress - 0.28) / 0.58);
    var exitLinear = clamp((progress - 0.74) / 0.26);
    var exit = easeInOutCubic(exitLinear);
    var exitTilt = smoothstep(exitLinear);
    var radius = width * 0.26;
    var step = height * 0.1;
    var spread = 1 + exit * 0.6;

    world.style.transform = 'translate3d(' + number(width * 0.5) + 'px, ' +
      number(height * 0.511) + 'px, 0px) rotateX(' +
      number(8 * enter * (1 - exitTilt)) + 'deg) rotateZ(' +
      number(-16 * enter * (1 - exitTilt)) + 'deg)';

    tiles.forEach(function (tile, index) {
      var offset = index - turn * lastIndex;
      var angle = offset * 45;
      var radians = angle * Math.PI / 180;
      var x = radius * Math.sin(radians);
      var y = step * offset;
      var z = radius * Math.cos(radians) - radius;
      var appear = index === 0 ? 1 : easeInOutCubic((progress - 0.16 - 0.012 * index) / 0.2);
      var depth = 0.35 + 0.65 * Math.max(0, Math.cos(radians));
      var endFade = 1 - clamp((Math.abs(offset) - 4.5) / 1.5);
      var opacity = depth * endFade * appear * (1 - exit);
      var scale = 0.36 * (0.2 + 0.8 * appear);

      if (index === 0) {
        scale = 1 + (0.36 - 1) * intro;
        opacity = depth * endFade * (1 - exit);
      }

      x *= spread;
      y *= spread;

      if (index === lastIndex) {
        var finalFade = 1 - smoothstep((progress - 0.985) / 0.015);
        scale = 0.36 + 0.64 * exit;
        opacity = depth * endFade * appear * finalFade;
        x *= 1 - exit;
        y *= 1 - exit;
        z *= 1 - exit;
        angle *= 1 - exit;
      }

      if (handoffActive) opacity = index === 0 ? handoffBlend : 0;

      var tileWidth = parseFloat(tile.style.width);
      var tileHeight = parseFloat(tile.style.height);
      tile.style.transform = 'translate3d(' + number(x - tileWidth / 2) + 'px, ' +
        number(y - tileHeight / 2) + 'px, ' + number(z) +
        'px) rotateZ(0deg) rotateX(0deg) rotateY(' + number(angle) +
        'deg) scale(' + number(scale) + ')';
      tile.style.opacity = String(number(opacity));
      tile.style.visibility = opacity <= 0.001 ? 'hidden' : 'visible';
    });
  }

  function schedule() {
    if (!frame && (enhanced || staticReturnPending) && !suspended && !projectOpen && !document.hidden) {
      frame = window.requestAnimationFrame(render);
    }
  }

  function cancel() {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
  }

  function restoreStaticPosition() {
    if (!staticReturnPending || enhanced || projectOpen) return;
    staticReturnPending = false;
    var target = staticReturnTarget || root;
    staticReturnTarget = root;
    window.scrollTo({
      top: target.getBoundingClientRect().top + window.scrollY,
      behavior: 'instant'
    });
  }

  function teardown() {
    var cinemaReturn = Boolean(story && story.classList.contains('is-cinema-active')) || projectCinemaProgress !== null;
    var returnToStatic = root.classList.contains('is-scene-active') || root.classList.contains('is-shared-active') || projectProgress !== null || projectCinemaProgress !== null;
    staticReturnTarget = cinemaReturn && story ? story : root;
    resizeProgress = null;
    resizeCinemaProgress = null;
    cancel();
    enhanced = false;
    root.classList.remove('is-enhanced', 'is-scene-active', 'is-shared-active', 'is-cinema-active', 'is-handoff-active');
    root.removeAttribute('data-spiral-progress');
    if (story) story.classList.remove('is-enhanced', 'is-cinema-active');
    if (cinema) cinema.reset();
    cinemaWasActive = false;
    stage.style.removeProperty('perspective');
    world.style.removeProperty('transform');
    tiles.forEach(function (tile) {
      tile.style.removeProperty('width');
      tile.style.removeProperty('height');
      tile.style.removeProperty('transform');
      tile.style.removeProperty('opacity');
      tile.style.removeProperty('visibility');
    });
    lastProgress = -1;
    lastCinemaProgress = -1;
    if (returnToStatic) {
      staticReturnPending = true;
      schedule();
    }
  }

  function preserveStaticPosition() {
    var viewportHeight = window.innerHeight;
    var center = viewportHeight * 0.5;
    var storyRect = story ? story.getBoundingClientRect() : null;
    var galleryRect = root.getBoundingClientRect();
    var galleryContains = galleryRect.top <= center && galleryRect.bottom >= center;
    var storyContains = storyRect && storyRect.top <= center && storyRect.bottom >= center;
    var target = galleryContains ? root : (storyContains ? story : null);
    if (!target) return;
    var rect = target.getBoundingClientRect();
    var targetHeight = target.offsetHeight;
    /* A short static section has no viewport-sized scroll track; use its own height. */
    var readingRange = Math.max(1, targetHeight > viewportHeight ?
      targetHeight - viewportHeight : targetHeight);
    var staticProgress = clamp(-rect.top / readingRange);
    if (target === story) {
      resizeCinemaProgress = staticProgress;
      resizeProgress = null;
    } else {
      resizeProgress = staticProgress;
      resizeCinemaProgress = null;
    }
  }

  function reconcile() {
    if (canEnhance()) {
      if (!enhanced && initialized) preserveStaticPosition();
      staticReturnPending = false;
      if (!enhanced) {
        enhanced = true;
        root.classList.add('is-enhanced');
        if (story && cinema && cinema.available) story.classList.add('is-enhanced');
      }
      needsMeasure = true;
      schedule();
    } else if (enhanced) {
      teardown();
    }
    initialized = true;
  }

  function onResize() {
    if (!enhanced) return;
    if (!canEnhance()) {
      reconcile();
      return;
    }
    if (story && story.classList.contains('is-cinema-active') && lastCinemaProgress >= 0) {
      resizeCinemaProgress = lastCinemaProgress;
      resizeProgress = null;
    } else if (root.classList.contains('is-scene-active') && lastProgress >= 0) {
      resizeProgress = lastProgress;
      resizeCinemaProgress = null;
    }
    needsMeasure = true;
    schedule();
  }

  function onVisibility() {
    if (document.hidden) cancel();
    else schedule();
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', function () {
    suspended = true;
    cancel();
  });
  window.addEventListener('pageshow', function () {
    suspended = false;
    needsMeasure = true;
    schedule();
  });
  window.addEventListener('portfolio:project', function (event) {
    projectOpen = Boolean(event.detail && event.detail.open);
    if (projectOpen) {
      if (story && story.classList.contains('is-cinema-active') && lastCinemaProgress >= 0) {
        if (projectCinemaProgress === null) projectCinemaProgress = lastCinemaProgress;
        projectProgress = null;
      } else if (projectProgress === null && root.classList.contains('is-scene-active') && lastProgress >= 0) {
        projectProgress = lastProgress;
      }
      cancel();
      root.classList.remove('is-scene-active', 'is-shared-active', 'is-cinema-active', 'is-handoff-active');
      clearCinema();
    } else {
      if (enhanced && projectCinemaProgress !== null) {
        resizeCinemaProgress = projectCinemaProgress;
        resizeProgress = null;
      } else if (enhanced && projectProgress !== null) {
        resizeProgress = projectProgress;
        resizeCinemaProgress = null;
      }
      projectProgress = null;
      projectCinemaProgress = null;
      needsMeasure = true;
      schedule();
    }
  });

  function onMediaChange() {
    reconcile();
  }
  if (mobileQuery.addEventListener) {
    mobileQuery.addEventListener('change', onMediaChange);
    motionQuery.addEventListener('change', onMediaChange);
  } else {
    mobileQuery.addListener(onMediaChange);
    motionQuery.addListener(onMediaChange);
  }

  if ('MutationObserver' in window) {
    languageObserver = new MutationObserver(function () {
      if (!enhanced) return;
      needsMeasure = true;
      schedule();
    });
    languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      needsMeasure = true;
      schedule();
    });
  }

  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.target === story) storyInView = entry.isIntersecting;
        if (entry.target === root) galleryInView = entry.isIntersecting;
      });
      if (storyInView || galleryInView) schedule();
      else {
        if (!staticReturnPending) cancel();
        root.classList.remove('is-scene-active', 'is-shared-active', 'is-cinema-active', 'is-handoff-active');
        clearCinema();
      }
    }, { rootMargin: '60% 0px 60% 0px', threshold: 0 });
    observer.observe(root);
    if (story) observer.observe(story);
  }

  reconcile();
}());
