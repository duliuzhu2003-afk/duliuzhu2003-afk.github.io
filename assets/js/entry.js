(() => {
  'use strict';

  const root = document.documentElement;
  const body = document.body;
  const entry = document.querySelector('.entry-screen');
  const home = body.classList.contains('home-page');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = window.matchMedia('(pointer: coarse)');
  if (!entry) return;
  if (!home || body.classList.contains('has-project')) {
    entry.remove();
    root.classList.add('is-entered');
    window.dispatchEvent(new CustomEvent('portfolio:hero-enter'));
    return;
  }

  const count = entry.querySelector('.entry-count');
  const startedAt = performance.now();
  let countFrame = 0;
  let markFrame = 0;
  let leaving = false;

  function removeImmediately() {
    cancelAnimationFrame(countFrame);
    cancelAnimationFrame(markFrame);
    entry.remove();
    body.classList.remove('is-entering');
    root.classList.add('is-entered');
    window.dispatchEvent(new CustomEvent('portfolio:hero-enter'));
  }

  if (coarse.matches) {
    removeImmediately();
    return;
  }

  body.classList.add('is-entering');
  window.scrollTo(0, 0);

  function waitForHero() {
    return new Promise((resolve) => {
      let attempts = 0;
      const check = () => {
        attempts += 1;
        const state = document.querySelector('.hero-canvas')?.dataset.webgl;
        if (['ready', 'static', 'unavailable', 'lost'].includes(state)) resolve(state);
        else if (attempts >= 220) resolve('timeout');
        else setTimeout(check, 50);
      };
      check();
    });
  }

  function timeout(promise, milliseconds) {
    return Promise.race([
      promise.catch(() => 'failed'),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), milliseconds))
    ]);
  }

  async function resourcesReady() {
    const loaded = document.readyState === 'complete'
      ? Promise.resolve()
      : new Promise((resolve) => window.addEventListener('load', resolve, { once: true }));
    const image = document.querySelector('.hero-visual img');
    const decoded = image?.complete
      ? Promise.resolve()
      : new Promise((resolve) => {
        image?.addEventListener('load', resolve, { once: true });
        image?.addEventListener('error', resolve, { once: true });
      });
    await Promise.all([
      timeout(loaded, 10000),
      timeout(document.fonts.ready, 10000),
      timeout(decoded, 10000),
      timeout(waitForHero(), 10000)
    ]);
  }

  function stableFrames() {
    return new Promise((resolve) => {
      let previous = 0;
      let stable = 0;
      let frameRequest = 0;
      let finished = false;
      const fallback = setTimeout(finish, 2500);
      function finish() {
        if (finished) return;
        finished = true;
        clearTimeout(fallback);
        cancelAnimationFrame(frameRequest);
        resolve();
      }
      function frame(now) {
        if (finished) return;
        if (previous && now - previous < 34) stable += 1;
        else stable = 0;
        previous = now;
        if (stable >= 12) finish();
        else frameRequest = requestAnimationFrame(frame);
      }
      frameRequest = requestAnimationFrame(frame);
    });
  }

  function updateCount() {
    if (leaving) return;
    const elapsed = performance.now() - startedAt;
    const shown = Math.min(97, Math.floor(97 * (1 - Math.exp(-elapsed / 950))));
    count.textContent = `${shown}%`;
    countFrame = requestAnimationFrame(updateCount);
  }

  function leave() {
    if (leaving) return;
    leaving = true;
    cancelAnimationFrame(countFrame);
    count.textContent = '100%';
    window.scrollTo(0, 0);
    root.classList.add('is-entered');
    entry.classList.add('is-leaving');
    entry.dataset.stage = 'opening';

    // Independent implementation of the measured growing-plate entrance.
    const mark = entry.querySelector('.entry-mark');
    const markSize = mark.offsetWidth || 88;
    const target = ((Math.hypot(window.innerWidth, window.innerHeight) / 2 + 40) * 1.35)
      / (7.2 * (markSize / 18));
    const openingAt = performance.now();
    const sine = (value) => {
      const x = Math.max(0, Math.min(1, value));
      return 0.5 - 0.5 * Math.cos(Math.PI * x);
    };
    const growMark = (now) => {
      const seconds = (now - openingAt) / 1000;
      const breathe = 1 + 0.16 * sine(seconds / 1.3);
      const expansion = Math.exp(Math.log(target) * sine((seconds - 0.45) / 1.5));
      const scale = breathe * expansion;
      mark.style.transform = `translate(-50%, -50%) scale(${scale})`;
      entry.style.setProperty('--entry-hole', `${Math.max(0, 40 * (scale - 1.1))}px`);
      if (seconds < 2.3) markFrame = requestAnimationFrame(growMark);
    };
    mark.style.transform = 'translate(-50%, -50%) scale(1)';
    entry.style.setProperty('--entry-hole', '0px');
    markFrame = requestAnimationFrame(growMark);

    setTimeout(() => window.dispatchEvent(new CustomEvent('portfolio:hero-enter')), 500);
    setTimeout(() => body.classList.remove('is-entering'), 1150);
    setTimeout(() => {
      entry.remove();
      root.dataset.entry = 'complete';
    }, 2300);
  }

  async function start() {
    if (reduced.matches) {
      removeImmediately();
      return;
    }
    entry.classList.add('is-in');
    updateCount();
    const overall = new Promise((resolve) => setTimeout(resolve, 15000));
    await Promise.race([
      (async () => {
        await resourcesReady();
        const remaining = Math.max(0, 2700 - (performance.now() - startedAt));
        if (remaining) await new Promise((resolve) => setTimeout(resolve, remaining));
        count.textContent = '100%';
        await stableFrames();
      })(),
      overall
    ]);
    leave();
  }

  reduced.addEventListener('change', () => {
    if (reduced.matches && !leaving) removeImmediately();
  });
  start().catch(removeImmediately);
})();
