/* morogaro v4 / top-only sticky header. No dependencies.
 * Rule: expanded iff the clamped document scroll offset is exactly zero.
 * No direction, travel threshold, focus override or manual mid-page expansion.
 * Fixed reserved slot + transforms prevent scroll-position feedback loops.
 */
(() => {
  'use strict';
  const root = document.documentElement;
  const shell = document.getElementById('site-header');
  const nav = document.getElementById('header-nav');
  const search = document.getElementById('header-search');
  const brand = document.getElementById('header-brand');
  const returnLink = document.getElementById('header-return');
  const art = document.querySelector('.header-art-window');
  if (!shell || !nav || !search || !brand || !returnLink || !art) return;

  const narrow = matchMedia('(max-width: 1023px)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const stage = document.querySelector('.stage');
  const glowTop = document.querySelector('.glow-top');
  const glowBottom = document.querySelector('.glow-bottom');
  const originalTabIndexes = new WeakMap();
  let compact = null;
  let scrollFrame = 0;
  let resizeFrame = 0;
  let focusMenuAtTop = false;

  function getY() {
    // Clamp negative elastic bounce and overscroll beyond the document bottom.
    const maximum = Math.max(0, root.scrollHeight - root.clientHeight);
    return Math.min(maximum, Math.max(0, window.scrollY));
  }

  function setInert(node, value) {
    node.setAttribute('aria-hidden', String(value));
    if ('inert' in node) { node.inert = value; return; }
    const targets = [...node.querySelectorAll('a,button,input,[tabindex]')];
    if (node.matches('a,button,input,[tabindex]')) targets.unshift(node);
    targets.forEach((el) => {
      if (value) {
        if (!originalTabIndexes.has(el)) originalTabIndexes.set(el, el.getAttribute('tabindex'));
        el.setAttribute('tabindex', '-1');
      } else if (originalTabIndexes.has(el)) {
        const previous = originalTabIndexes.get(el);
        if (previous === null) el.removeAttribute('tabindex');
        else el.setAttribute('tabindex', previous);
        originalTabIndexes.delete(el);
      }
    });
  }

  function render() {
    const active = document.activeElement;
    const hiddenGroups = compact ? (narrow.matches ? [nav] : [nav, search, brand]) : [];
    // Never leave focus inside a region that becomes inert. Keyboard users get
    // a visible-on-focus link back to the top; mouse/touch focus is just blurred.
    if (active instanceof HTMLElement && hiddenGroups.some((node) => node.contains(active))) {
      if (active.matches(':focus-visible')) returnLink.focus({ preventScroll: true });
      else active.blur();
    }
    shell.dataset.state = compact ? 'compact' : 'expanded';
    root.dataset.headerState = shell.dataset.state;
    const unit = parseFloat(getComputedStyle(root).fontSize) / 16;
    const fullHeight = (narrow.matches ? 124 : 156) * unit;
    const compactHeight = (narrow.matches ? 64 : 76) * unit;
    root.style.setProperty('--header-visible-height', `${compact ? compactHeight : fullHeight}px`);
    returnLink.tabIndex = compact ? 0 : -1;
    setInert(nav, compact);
    setInert(search, compact && !narrow.matches);
    setInert(brand, compact && !narrow.matches);
    if (!compact && focusMenuAtTop) {
      focusMenuAtTop = false;
      nav.querySelector('button')?.focus({ preventScroll: true });
    }
  }

  function synchronize(force = false) {
    const next = getY() > 0;
    if (compact === next && !force) return;
    const changed = compact !== next;
    compact = next;
    render();
    if (changed) shell.dispatchEvent(new CustomEvent('morogaro:headerchange', {
      bubbles: true, detail: { state: compact ? 'compact' : 'expanded' },
    }));
  }

  function processScroll() {
    scrollFrame = 0;
    synchronize();
  }

  function measure() {
    resizeFrame = 0;
    const unit = parseFloat(getComputedStyle(root).fontSize) / 16;
    root.style.setProperty('--asset-scale', String(unit));
    // Preserve the v3 body/background responsiveness without enlarging the UI.
    if (stage && glowTop && glowBottom) {
      const height = stage.getBoundingClientRect().height;
      const bottomTop = parseFloat(getComputedStyle(glowBottom).top) || 0;
      const topScale = Math.max(unit, height / (glowTop.naturalHeight || 1024));
      const bottomScale = Math.max(unit, (height - bottomTop) / (glowBottom.naturalHeight || 958));
      root.style.setProperty('--glow-top-scale', String(topScale));
      root.style.setProperty('--glow-bottom-scale', String(bottomScale));
      root.style.setProperty('--glow-right-offset', `${(glowBottom.naturalWidth || 865) * (bottomScale - 1)}px`);
    }
    const width = art.getBoundingClientRect().width;
    if (width > 0) shell.style.setProperty('--header-art-scale', String(width / 1440));
    synchronize(true);
  }

  function scheduleMeasure() {
    if (!resizeFrame) resizeFrame = requestAnimationFrame(measure);
  }

  function scrollToTop(focusMenu = false) {
    focusMenuAtTop = focusMenu;
    // Do not expand at the start of the animation. Only reaching y=0 expands.
    window.scrollTo({ top: 0, behavior: reduced.matches ? 'auto' : 'smooth' });
    synchronize(true);
  }

  window.addEventListener('scroll', () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(processScroll);
  }, { passive: true });
  window.addEventListener('resize', scheduleMeasure, { passive: true });
  window.addEventListener('pageshow', scheduleMeasure);
  window.addEventListener('hashchange', scheduleMeasure);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleMeasure();
  });
  if (narrow.addEventListener) narrow.addEventListener('change', scheduleMeasure);
  else narrow.addListener(scheduleMeasure);
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(art);
    if (stage) observer.observe(stage);
  }
  glowTop?.addEventListener('load', scheduleMeasure);
  glowBottom?.addEventListener('load', scheduleMeasure);
  brand.addEventListener('click', (event) => {
    event.preventDefault();
    scrollToTop();
  });
  returnLink.addEventListener('click', (event) => {
    event.preventDefault();
    scrollToTop(true);
  });
  search.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = document.getElementById('search-input');
    const query = input.value.trim();
    if (!query) { input.focus(); return; }
    const request = new CustomEvent('morogaro:search', { detail: { query }, cancelable: true });
    if (document.dispatchEvent(request)) document.dispatchEvent(new CustomEvent('morogaro:feedback', {
      detail: { message: '검색어를 입력했어요. 검색 결과 화면과 검색 서버는 아직 연결하지 않았어요.' },
    }));
  });

  Object.defineProperty(window, 'MorogaroHeader', {
    value: Object.freeze({
      scrollToTop: () => scrollToTop(),
      // Legacy expansion requests now navigate to the top, not override state.
      expand: () => scrollToTop(),
      sync: () => synchronize(true),
      getState: () => ({
        state: compact ? 'compact' : 'expanded',
        layout: narrow.matches ? 'compact-layout' : 'desktop',
        visibleHeight: parseFloat(getComputedStyle(root).getPropertyValue('--header-visible-height')),
        scrollY: getY(),
      }),
    }),
  });
  measure();
})();
