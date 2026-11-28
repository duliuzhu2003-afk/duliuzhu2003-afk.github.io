(() => {
  'use strict';

  const root = document.documentElement;
  root.classList.add('js');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const isHome = document.body.classList.contains('home-page');
  const isStandalone = document.body.classList.contains('standalone-page');
  const languageButtons = Array.from(document.querySelectorAll('.language-toggle'));
  let english = false;
  let activeProjectId = null;
  let projectOrigin = { y: 0, hash: '', returnFocus: null, pushed: false, depth: 0 };
  let projectCloseTimer = 0;
  let projectBusy = false;
  let projectCleanup = null;
  let lightboxOpener = null;
  const layerOpeners = new WeakMap();

  function setLanguage(next) {
    english = next;
    root.classList.toggle('lang-en', english);
    root.lang = english ? 'en' : 'zh-CN';
    languageButtons.forEach((button) => {
      button.setAttribute('aria-checked', String(english));
      button.setAttribute('aria-label', english ? 'Switch to Chinese' : '切换到英文');
    });
    const caption = document.getElementById('lightbox-caption');
    if (caption && caption.dataset.zh) {
      caption.textContent = english ? caption.dataset.en : caption.dataset.zh;
    }
  }

  languageButtons.forEach((button) => {
    button.addEventListener('click', () => setLanguage(!english));
  });

  const menuButton = document.querySelector('.menu-toggle');
  const mobileMenu = document.getElementById('mobile-menu');
  function closeMenu() {
    if (!menuButton || !mobileMenu) return;
    menuButton.setAttribute('aria-expanded', 'false');
    mobileMenu.hidden = true;
  }
  if (menuButton && mobileMenu) {
    menuButton.addEventListener('click', () => {
      const open = menuButton.getAttribute('aria-expanded') !== 'true';
      menuButton.setAttribute('aria-expanded', String(open));
      mobileMenu.hidden = !open;
    });
    mobileMenu.addEventListener('click', (event) => {
      if (event.target.closest('a')) closeMenu();
    });
  }

  function isVisible(element) {
    return Boolean(element && element.isConnected && element.getClientRects().length
      && !element.closest('dialog:not([open])'));
  }

  function firstVisible(selectors) {
    return Array.from(document.querySelectorAll(selectors)).find(isVisible) || null;
  }

  function projectReturnFocus(id, preferred) {
    const info = preferred?.closest('.info-dialog');
    if (info) {
      const opener = layerOpeners.get(info);
      if (isVisible(opener)) return opener;
    } else if (isVisible(preferred) && preferred !== document.body && preferred !== document.documentElement) {
      return preferred;
    }
    return firstVisible(`.collection-card a.project-link[data-project="${id}"]`)
      || firstVisible('[data-open-layer="index"], .menu-toggle');
  }

  function showInfo(name, trigger) {
    const dialog = document.getElementById(`${name}-dialog`);
    if (!dialog) return;
    const requestedOpener = trigger || document.activeElement;
    const opener = mobileMenu?.contains(requestedOpener) ? menuButton : requestedOpener;
    layerOpeners.set(dialog, opener);
    closeMenu();
    document.querySelectorAll('.info-dialog[open]').forEach((openDialog) => {
      if (openDialog !== dialog) openDialog.close();
    });
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('[data-close-dialog]')?.focus({ preventScroll: true });
  }

  function closeInfo(dialog) {
    if (dialog && dialog.open) dialog.close();
  }

  document.querySelectorAll('.info-dialog').forEach((dialog) => {
    dialog.addEventListener('close', () => {
      const opener = layerOpeners.get(dialog);
      if (!projectDialog?.open && !document.querySelector('.info-dialog[open]') && isVisible(opener)) {
        opener.focus({ preventScroll: true });
      }
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeInfo(dialog);
    });
  });

  const projectDialog = document.getElementById('project-dialog');
  if (projectDialog) {
    projectDialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeProject(false);
    });
  }

  function projectTemplate(id) {
    if (!/^0[1-6]$/.test(id || '')) return null;
    return document.getElementById(`project-${id}-source`);
  }

  function projectFromHash() {
    const match = location.hash.match(/^#project-(0[1-6])$/);
    return match && projectTemplate(match[1]) ? match[1] : null;
  }

  function currentProjectArticle() {
    return projectDialog?.querySelector('[data-project-article]') || null;
  }

  function openProject(id, trigger, options = {}) {
    const template = projectTemplate(id);
    if (!projectDialog || !template) return;
    window.clearTimeout(projectCloseTimer);
    closeLightbox();
    projectDialog.classList.remove('is-closing');
    const alreadyOpen = projectDialog.open;
    if (alreadyOpen && activeProjectId === id) {
      projectBusy = false;
      return;
    }

    if (!options.fromRoute) {
      if (!alreadyOpen) {
        projectOrigin = {
          y: window.scrollY,
          hash: location.hash,
          returnFocus: projectReturnFocus(id, trigger || document.activeElement),
          pushed: true,
          depth: 1
        };
        history.replaceState({
          ...(history.state || {}), home: true, homeY: window.scrollY, homeHash: location.hash
        }, '', location.href);
      } else {
        projectOrigin.depth += 1;
      }
      history.pushState({
        project: id, depth: projectOrigin.depth, homeY: projectOrigin.y, homeHash: projectOrigin.hash
      }, '', `#project-${id}`);
    } else {
      const state = history.state || {};
      const depth = Number.isInteger(state.depth) ? state.depth : 1;
      projectOrigin.depth = depth;
      if (!alreadyOpen) {
        const previousFocus = isVisible(projectOrigin.returnFocus)
          ? projectOrigin.returnFocus : document.activeElement;
        projectOrigin = {
          y: Number.isFinite(state.homeY) ? state.homeY : 0,
          hash: typeof state.homeHash === 'string' ? state.homeHash : '',
          returnFocus: projectReturnFocus(id, previousFocus),
          pushed: depth > 0,
          depth
        };
      }
    }

    document.querySelectorAll('.info-dialog[open]').forEach((dialog) => dialog.close());
    closeMenu();
    if (projectCleanup) {
      projectCleanup();
      projectCleanup = null;
    }
    projectDialog.replaceChildren(template.content.cloneNode(true));
    activeProjectId = id;
    const title = currentProjectArticle()?.querySelector('.project-header h1');
    if (title) {
      title.id = 'project-dialog-title';
      projectDialog.setAttribute('aria-labelledby', title.id);
      projectDialog.removeAttribute('aria-label');
    }
    projectDialog.scrollTop = 0;
    if (!alreadyOpen) {
      projectDialog.showModal();
      document.body.classList.add('has-project');
    }
    window.dispatchEvent(new CustomEvent('portfolio:project', {
      detail: { open: true, id, switched: alreadyOpen }
    }));
    projectCleanup = initProject(projectDialog);
    projectDialog.querySelector('[data-project-close]')?.focus({ preventScroll: true });
    projectBusy = false;
  }

  function finishProjectClose() {
    if (!projectDialog) return;
    const closedId = activeProjectId;
    projectDialog.classList.remove('is-closing');
    closeLightbox();
    if (projectCleanup) {
      projectCleanup();
      projectCleanup = null;
    }
    if (projectDialog.open) projectDialog.close();
    projectDialog.replaceChildren();
    projectDialog.removeAttribute('aria-labelledby');
    activeProjectId = null;
    document.body.classList.remove('has-project');
    window.dispatchEvent(new CustomEvent('portfolio:project', {
      detail: { open: false, id: closedId }
    }));
    window.scrollTo({ top: projectOrigin.y, behavior: 'instant' });
    const returnFocus = isVisible(projectOrigin.returnFocus)
      ? projectOrigin.returnFocus : projectReturnFocus(closedId, null);
    if (isVisible(returnFocus)) returnFocus.focus({ preventScroll: true });
    projectOrigin.pushed = false;
    projectOrigin.depth = 0;
    projectOrigin.returnFocus = null;
    projectBusy = false;
  }

  function closeProject(fromRoute = false) {
    if (!projectDialog || !projectDialog.open || (projectBusy && !fromRoute)) return;
    if (fromRoute && projectDialog.classList.contains('is-closing')) return;
    closeLightbox();
    if (!fromRoute && projectOrigin.pushed && history.state?.project === activeProjectId
      && projectOrigin.depth > 0) {
      projectBusy = true;
      history.go(-projectOrigin.depth);
      return;
    }
    if (!fromRoute) {
      history.replaceState({}, '', `${location.pathname}${location.search}`);
    }
    projectBusy = true;
    projectDialog.classList.add('is-closing');
    projectCloseTimer = window.setTimeout(finishProjectClose, reducedMotion.matches ? 10 : 1200);
  }

  function closeLightbox() {
    const lightbox = document.getElementById('lightbox');
    if (lightbox?.open) lightbox.close();
  }

  function openLightbox(button) {
    const lightbox = document.getElementById('lightbox');
    const image = document.getElementById('lightbox-image');
    const caption = document.getElementById('lightbox-caption');
    if (!lightbox || !image || !caption) return;
    lightboxOpener = button;
    image.src = button.dataset.lightboxSrc;
    image.alt = button.querySelector('img')?.alt || '';
    caption.dataset.zh = button.dataset.captionZh || '';
    caption.dataset.en = button.dataset.captionEn || button.dataset.captionZh || '';
    caption.textContent = english ? caption.dataset.en : caption.dataset.zh;
    if (!lightbox.open) lightbox.showModal();
    lightbox.querySelector('.lightbox-close')?.focus({ preventScroll: true });
  }

  const lightbox = document.getElementById('lightbox');
  if (lightbox) {
    lightbox.addEventListener('close', () => {
      const image = document.getElementById('lightbox-image');
      if (image) image.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
      if (isVisible(lightboxOpener)) lightboxOpener.focus({ preventScroll: true });
    });
    lightbox.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeLightbox();
    });
  }

  function initProject(scope) {
    const article = scope.querySelector('[data-project-article]');
    if (!article || article.dataset.ready === 'true') return () => {};
    article.dataset.ready = 'true';
    const figures = Array.from(article.querySelectorAll('[data-figure]'));
    const figureButtons = Array.from(article.querySelectorAll('[data-figure-target]'));
    let currentFigure = 1;
    let ticking = false;
    let disposed = false;

    function markCurrent(number) {
      currentFigure = Math.max(1, Math.min(figures.length, number));
      figureButtons.forEach((button) => {
        const active = Number(button.dataset.figureTarget) === currentFigure;
        button.classList.toggle('is-current', active);
        if (active) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
      });
    }

    function goToFigure(number) {
      const nextFigure = Math.max(1, Math.min(figures.length, number));
      const target = article.querySelector(`[data-figure="${nextFigure}"]`);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const fullyVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
      markCurrent(nextFigure);
      target.scrollIntoView({
        behavior: reducedMotion.matches ? 'instant' : 'smooth',
        block: fullyVisible ? 'nearest' : 'start'
      });
    }

    const scrollRoot = projectDialog && projectDialog.contains(article) ? projectDialog : window;
    function updateCurrent() {
      ticking = false;
      if (disposed) return;
      const atEnd = scrollRoot === window
        ? window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2
        : scrollRoot.scrollTop + scrollRoot.clientHeight >= scrollRoot.scrollHeight - 2;
      if (atEnd) {
        markCurrent(figures.length);
        return;
      }
      const threshold = 28;
      let best = 1;
      figures.forEach((figure) => {
        if (figure.getBoundingClientRect().top <= threshold) best = Number(figure.dataset.figure);
      });
      markCurrent(best);
    }

    function onScroll() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(updateCurrent);
      }
    }

    function onClick(event) {
      const figureButton = event.target.closest('[data-figure-target]');
      if (figureButton) goToFigure(Number(figureButton.dataset.figureTarget));
      const stepButton = event.target.closest('[data-figure-step]');
      if (stepButton) goToFigure(currentFigure + Number(stepButton.dataset.figureStep));
      const chapter = event.target.closest('[data-chapter]');
      if (chapter && projectDialog && projectDialog.contains(article)) {
        event.preventDefault();
        article.querySelector(`#${chapter.dataset.chapter}`)?.scrollIntoView({
          behavior: reducedMotion.matches ? 'instant' : 'smooth'
        });
      }
    }

    scrollRoot.addEventListener('scroll', onScroll, { passive: true });
    article.addEventListener('click', onClick);
    markCurrent(1);
    return () => {
      disposed = true;
      scrollRoot.removeEventListener('scroll', onScroll);
      article.removeEventListener('click', onClick);
    };
  }

  if (isStandalone) projectCleanup = initProject(document);

  document.addEventListener('click', (event) => {
    const infoButton = event.target.closest('[data-open-layer]');
    if (infoButton) {
      event.preventDefault();
      showInfo(infoButton.dataset.openLayer, infoButton);
      return;
    }
    const closeButton = event.target.closest('[data-close-dialog]');
    if (closeButton) {
      closeInfo(closeButton.closest('dialog'));
      return;
    }
    const projectLink = event.target.closest('a.project-link[data-project]');
    if (projectLink && isHome && !event.defaultPrevented && event.button === 0
      && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
      && !projectLink.target && projectTemplate(projectLink.dataset.project)) {
      event.preventDefault();
      openProject(projectLink.dataset.project, projectLink);
      return;
    }
    const projectClose = event.target.closest('[data-project-close]');
    if (projectClose) {
      event.preventDefault();
      if (isStandalone) location.href = './index.html#works';
      else closeProject(false);
      return;
    }
    const lightboxButton = event.target.closest('[data-lightbox-src]');
    if (lightboxButton && event.button === 0
      && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      openLightbox(lightboxButton);
      return;
    }
    if (event.target.closest('.lightbox-close')) {
      closeLightbox();
      return;
    }
    const targetLink = event.target.closest('[data-close-and-target]');
    if (targetLink) {
      const target = document.getElementById(targetLink.dataset.closeAndTarget);
      if (!target) return;
      event.preventDefault();
      const dialog = targetLink.closest('dialog');
      layerOpeners.delete(dialog);
      closeInfo(dialog);
      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (lightbox?.open) {
      event.preventDefault();
      event.stopPropagation();
      closeLightbox();
      return;
    }
    const info = document.querySelector('.info-dialog[open]');
    if (info) {
      event.preventDefault();
      closeInfo(info);
      return;
    }
    if (projectDialog?.open) {
      event.preventDefault();
      closeProject(false);
      return;
    }
    if (mobileMenu && !mobileMenu.hidden) {
      closeMenu();
      menuButton?.focus({ preventScroll: true });
    }
  });

  if (isHome && 'IntersectionObserver' in window && !reducedMotion.matches) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    document.querySelectorAll('.story-figure, .collection-card, .digital').forEach((element) => observer.observe(element));
  } else {
    document.querySelectorAll('.story-figure, .collection-card, .digital').forEach((element) => element.classList.add('is-visible'));
  }

  if ((isHome || isStandalone) && 'scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (isStandalone) {
    let standaloneScrollFrame = 0;
    const saveStandaloneScroll = () => {
      standaloneScrollFrame = 0;
      history.replaceState({
        ...(history.state || {}), standaloneScrollY: window.scrollY
      }, '', location.href);
    };
    const restoreStandaloneScroll = () => {
      const y = history.state?.standaloneScrollY;
      if (Number.isFinite(y)) window.scrollTo({ top: y, behavior: 'instant' });
    };
    window.addEventListener('scroll', () => {
      if (!standaloneScrollFrame) standaloneScrollFrame = requestAnimationFrame(saveStandaloneScroll);
    }, { passive: true });
    window.addEventListener('pagehide', saveStandaloneScroll);
    window.addEventListener('pageshow', () => {
      restoreStandaloneScroll();
      requestAnimationFrame(restoreStandaloneScroll);
    });
    restoreStandaloneScroll();
    if (document.readyState !== 'complete') {
      window.addEventListener('load', restoreStandaloneScroll, { once: true });
    }
  }
  if (isHome) {
    const initialProject = projectFromHash();
    if (initialProject) {
      const state = history.state || {};
      if (state.project !== initialProject || !Number.isInteger(state.depth)) {
        history.replaceState({ home: true, homeY: 0, homeHash: '' }, '', `${location.pathname}${location.search}`);
        history.pushState({
          project: initialProject, direct: true, depth: 1, homeY: 0, homeHash: ''
        }, '', `#project-${initialProject}`);
      }
      openProject(initialProject, null, { fromRoute: true });
    }
    window.addEventListener('popstate', () => {
      const id = projectFromHash();
      if (id) openProject(id, null, { fromRoute: true });
      else if (projectDialog?.open) closeProject(true);
    });
  }
})();
