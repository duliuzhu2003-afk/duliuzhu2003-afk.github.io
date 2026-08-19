/* ============================================================
   js/main.js — 全部交互（无依赖，兼容 file:// 协议）
   1. 年份自动更新（data-year）
   2. 移动端汉堡菜单
   3. 灯箱：点击图片浮出完整大图，←/→ 切换、Esc 关闭、
      放大/还原＋拖动画布、点击遮罩关闭、焦点圈定与归还
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 1. 年份自动更新 ---------- */
  var year = new Date().getFullYear();
  Array.prototype.forEach.call(document.querySelectorAll('[data-year]'), function (el) {
    el.textContent = String(year);
  });

  /* ---------- 2. 语言切换（中/EN） ---------- */
  var langSwitch = document.querySelector('.lang-switch');
  if (langSwitch) {
    langSwitch.addEventListener('click', function () {
      var en = document.documentElement.classList.toggle('lang-en');
      langSwitch.setAttribute('aria-checked', en ? 'true' : 'false');
      langSwitch.setAttribute('aria-label', en ? '切换至中文 SWITCH TO CHINESE' : '切换至英文 SWITCH TO ENGLISH');
      var resumeLink = document.querySelector('[data-resume]');
      if (resumeLink) { resumeLink.setAttribute('href', en ? 'resume-en.pdf' : 'resume-zh.pdf'); }
    });
  }

  /* ---------- 3. 移动端汉堡菜单 ---------- */
  var toggle = document.querySelector('.nav-toggle');
  var navList = document.getElementById('site-nav');
  if (toggle && navList) {
    toggle.addEventListener('click', function () {
      var open = navList.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    navList.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        navList.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && navList.classList.contains('is-open')) {
        navList.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus();
      }
    });
  }

  /* ---------- 4. 灯箱 ---------- */
  var links = Array.prototype.slice.call(document.querySelectorAll('a[data-lightbox]'));
  if (!links.length) { return; }

  var lb = null;
  var group = [];
  var index = 0;
  var trigger = null;
  var zoomed = false;
  var panX = 0, panY = 0;
  var dragging = false;
  var startX = 0, startY = 0, baseX = 0, baseY = 0;

  function build() {
    lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.setAttribute('aria-label', '图片查看器 IMAGE VIEWER');
    lb.innerHTML =
      '<p class="lightbox__caption" aria-live="polite"></p>' +
      '<div class="lightbox__stage"><img class="lightbox__img" alt=""></div>' +
      '<div class="lightbox__bar">' +
      '  <button type="button" class="lightbox__btn" data-act="prev" aria-label="上一张 PREVIOUS">←</button>' +
      '  <span class="lightbox__counter"></span>' +
      '  <button type="button" class="lightbox__btn" data-act="next" aria-label="下一张 NEXT">→</button>' +
      '  <button type="button" class="lightbox__btn" data-act="zoom" aria-label="放大或还原 ZOOM">＋</button>' +
      '  <button type="button" class="lightbox__btn" data-act="close" aria-label="关闭 CLOSE (ESC)">✕</button>' +
      '</div>';
    document.body.appendChild(lb);

    lb.addEventListener('click', function (e) {
      if (e.target === lb || e.target === lb.querySelector('.lightbox__stage')) { close(); }
    });
    lb.querySelector('[data-act="prev"]').addEventListener('click', function () { show(index - 1); });
    lb.querySelector('[data-act="next"]').addEventListener('click', function () { show(index + 1); });
    lb.querySelector('[data-act="zoom"]').addEventListener('click', toggleZoom);
    lb.querySelector('[data-act="close"]').addEventListener('click', close);

    var img = lb.querySelector('.lightbox__img');
    img.addEventListener('mousedown', startDrag);
    img.addEventListener('touchstart', startDrag, { passive: false });
    img.addEventListener('dblclick', function (e) { e.preventDefault(); toggleZoom(); });
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('touchmove', onDrag, { passive: false });
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('touchend', endDrag);
    window.addEventListener('touchcancel', endDrag);
  }

  function startDrag(e) {
    if (!zoomed) { return; }
    dragging = true;
    var p = e.touches ? e.touches[0] : e;
    startX = p.clientX; startY = p.clientY;
    baseX = panX; baseY = panY;
    if (e.cancelable) { e.preventDefault(); }
  }

  function onDrag(e) {
    if (!dragging) { return; }
    var p = e.touches ? e.touches[0] : e;
    var img = lb.querySelector('.lightbox__img');
    var maxX = img.offsetWidth * 0.5;
    var maxY = img.offsetHeight * 0.5;
    panX = Math.max(-maxX, Math.min(maxX, baseX + (p.clientX - startX)));
    panY = Math.max(-maxY, Math.min(maxY, baseY + (p.clientY - startY)));
    apply();
    if (e.cancelable) { e.preventDefault(); }
  }

  function endDrag() { dragging = false; }

  function apply() {
    var img = lb.querySelector('.lightbox__img');
    img.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + (zoomed ? 2 : 1) + ')';
    lb.classList.toggle('is-zoomed', zoomed);
  }

  function toggleZoom() {
    zoomed = !zoomed;
    if (!zoomed) { panX = 0; panY = 0; }
    apply();
    var btn = lb.querySelector('[data-act="zoom"]');
    btn.textContent = zoomed ? '－' : '＋';
    btn.setAttribute('aria-label', zoomed ? '还原 ORIGINAL SIZE' : '放大 ZOOM IN');
  }

  function preload(i) {
    var n = group.length;
    var next = group[(i + 1) % n], prev = group[(i - 1 + n) % n];
    var img = new Image();
    img.src = next.href;
    if (prev !== next) { var img2 = new Image(); img2.src = prev.href; }
  }

  function show(i) {
    var n = group.length;
    index = ((i % n) + n) % n;
    var link = group[index];
    var img = lb.querySelector('.lightbox__img');
    img.src = link.href;
    var caption = link.getAttribute('data-caption') || '';
    /* 英文模式下剔除图注中的中文（全角标点与汉字） */
    if (document.documentElement.classList.contains('lang-en')) {
      caption = caption.replace(/[　-〿一-鿿＀-￯]+/g, '')
        .replace(/\s{2,}/g, ' ').replace(/\s+—/g, ' —').trim();
    }
    img.alt = caption;
    lb.querySelector('.lightbox__caption').textContent = caption;
    lb.querySelector('.lightbox__counter').textContent =
      String(index + 1).replace(/^(\d)$/, '0$1') + ' / ' + String(n).replace(/^(\d)$/, '0$1');
    zoomed = false; panX = 0; panY = 0;
    apply();
    preload(index);
  }

  function open(link) {
    group = links.filter(function (l) { return l.getAttribute('data-lightbox') === link.getAttribute('data-lightbox'); });
    index = group.indexOf(link);
    if (!lb) { build(); }
    show(index);
    document.body.classList.add('lb-open');
    lb.classList.add('is-open');
    trigger = link;
    lb.querySelector('[data-act="close"]').focus();
  }

  function close() {
    if (!lb) { return; }
    lb.classList.remove('is-open');
    document.body.classList.remove('lb-open');
    if (trigger) { trigger.focus(); }
  }

  links.forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      open(link);
    });
  });

  document.addEventListener('keydown', function (e) {
    if (!lb || !lb.classList.contains('is-open')) { return; }
    if (e.key === 'Escape') { close(); }
    else if (e.key === 'ArrowLeft') { show(index - 1); }
    else if (e.key === 'ArrowRight') { show(index + 1); }
  });
})();

/* ---------- 5. 主标题背景的横向移动线条（用户 2026-08-20 定稿） ---------- */
(function () {
  var canvas = document.querySelector('.hero__mobius');
  if (!canvas || !canvas.getContext) { return; }
  var ctx = canvas.getContext('2d');
  var t = 0, last = 0; /* 动画始终运行 */
  var segs1 = [], segs2 = [];

  function size() {
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) { return; }
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    segs1 = makeSegs(32, 36, 34, 90);
    segs2 = makeSegs(20, 56, 50, 130);
  }

  /* 预生成横向短线段：行位置/初始偏移/长度（避免逐帧随机抖动） */
  function makeSegs(count, rowH, lenMin, lenMax) {
    var h = canvas.clientHeight, w = canvas.clientWidth;
    var span = w + 140;
    var arr = [];
    var rows = Math.max(3, Math.floor(h / rowH));
    for (var i = 0; i < rows && arr.length < count; i++) {
      var y = rowH / 2 + i * rowH;
      var m = 1 + Math.floor(Math.random() * 2);
      for (var j = 0; j < m && arr.length < count; j++) {
        arr.push({ y: y, x0: Math.random() * span, len: lenMin + Math.random() * (lenMax - lenMin) });
      }
    }
    return arr;
  }

  function drawLayer(segs, speed, color, lw) {
    var w = canvas.clientWidth;
    var span = w + 140;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.beginPath();
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      var x = ((s.x0 + t * speed) % span + span) % span - 80;
      if (x > w + 20 || x + s.len < -20) { continue; }
      ctx.moveTo(x, s.y);
      ctx.lineTo(x + s.len, s.y);
    }
    ctx.stroke();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    drawLayer(segs1, 60, 'rgba(17, 17, 17, 0.38)', 1.6);
    drawLayer(segs2, -36, 'rgba(17, 17, 17, 0.26)', 1.3);
  }

  function loop(ts) {
    if (!last) { last = ts; }
    t += Math.min(0.05, (ts - last) / 1000);
    last = ts;
    draw();
    window.requestAnimationFrame(loop);
  }

  size();
  draw();
  window.requestAnimationFrame(loop);
  window.addEventListener('resize', function () { size(); draw(); });
})();

/* ---------- 6. 主标题关键词悬停 → 下方简介对应段落放大（用户 2026-08-20） ---------- */
(function () {
  var kws = Array.prototype.slice.call(document.querySelectorAll('.hero__kw'));
  if (!kws.length) { return; }
  kws.forEach(function (kw) {
    function set(on) {
      var key = kw.getAttribute('data-kw');
      Array.prototype.forEach.call(document.querySelectorAll('.intro-kw[data-kw="' + key + '"]'), function (el) {
        el.classList.toggle('is-hl', on);
      });
    }
    kw.addEventListener('mouseenter', function () { set(true); });
    kw.addEventListener('mouseleave', function () { set(false); });
    kw.addEventListener('focus', function () { set(true); });
    kw.addEventListener('blur', function () { set(false); });
  });
})();

/* ---------- 7. 作品目录封面悬停幻灯（用户 2026-08-20：悬停 0.5s 后开始卡片模式，每 1s 闪出一张该项目小图） ---------- */
(function () {
  var cards = Array.prototype.slice.call(document.querySelectorAll('.card-project'));
  if (!cards.length) { return; }
  cards.forEach(function (card) {
    var img = card.querySelector('.card-project__img img');
    var slides = (card.getAttribute('data-slides') || '').split(',').filter(Boolean);
    if (!img || !slides.length) { return; }
    var cover = img.src;
    var timer = null, interval = null, i = 0;

    function stop() {
      if (timer) { clearTimeout(timer); timer = null; }
      if (interval) { clearInterval(interval); interval = null; }
      img.src = cover;
      i = 0;
    }

    card.addEventListener('mouseenter', function () {
      timer = setTimeout(function () {
        /* 预热剩余图片，保证闪图节奏 */
        slides.forEach(function (s) { var p = new Image(); p.src = s; });
        interval = setInterval(function () {
          img.src = slides[i % slides.length];
          i++;
        }, 1000);
      }, 500);
    });
    card.addEventListener('mouseleave', stop);
    card.addEventListener('focusin', stop);
  });
})();
