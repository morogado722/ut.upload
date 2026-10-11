/* morogaro — framework-free desktop prototype.
 * The geometry and colors come from the two attached SVG files.
 * v9: finite, interruptible carousel motion and continuous proximity geometry.
 * Navigation preserves velocity/acceleration when retargeted; no per-notch
 * spring restart or inter-event magnetic correction. The original SVG assets
 * use a fixed 228px render surface, only scaled DOWN by the compositor.
 * The approved 3000ms entry and 900ms page transitions are unchanged.
 * Transition timing is a tunable prototype value; gesture bindings follow the revision;
 * tune CONFIG without changing the source-frame coordinates.
 * There is intentionally no invented backend, download file, reward balance,
 * subscription gate, or automatic node creation from comments.
 */
(() => {
  'use strict';
  const asset = path => window.__MOROGARO_ASSETS?.[path] || path;
  // 바톤 메이커에서 열렸을 때만 있는 값(baton-render.js). 없으면 v10 시안 그대로 동작해요.
  const live = window.MorogaroLive || null;
  // 화면 너비 맞춤 배율(baton-render.js). 레이아웃 좌표(px) ↔ 실제 화면 좌표 변환에 써요.
  const S = () => window.MorogaroFit?.scale() || 1;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const CONFIG = Object.freeze({
    width: 1440, logWidth: 1224, logHeight: 350,
    rootX: 60, rootY: 99, rootSize: 152,
    firstNodeX: 224, step: 78, nodeSize: 66, neighborSize: 78,
    selectedSize: 114, selectedCenterX: 716, centerY: 175,
    branchSize: 44, branchGap: 12,
    introDuration: 3000, introDurationRatio: 0.84, introFadeFraction: 0.1,
    tutorialFade: 220, introPause: 60,
    // Navigation only. Source geometry, page transitions, and intro are independent.
    transitionDuration: 720, transitionMin: 140, transitionMax: 920,
    trackFrequency: 26, settleFrequency: 13, focusFrequency: 11,
    branchRevealFrequency: 14, wheelPixels: 150, wheelIdle: 220,
    wheelProjection: 0.065, wheelMaxCoast: 0.42,
    dragProjection: 0.13, dragMaxCoast: 0.85,
    dragThreshold: 5, dragStep: 100,
    renderSurface: 228,
    hoverVisibleRatio: 0.75, hoverScrollIdle: 140,
    logScrollInset: 60, pageDuration: 900, pageMomentumGuard: 220,
  });
  document.documentElement.style.setProperty('--log-duration', `${CONFIG.introDuration}ms`);
  const page = $('#page');
  const memory = {
    read(key, fallback) { try { const data = localStorage.getItem(`morogaro:${key}`); return data === null ? fallback : JSON.parse(data); } catch { return fallback; } },
    write(key, value) { try { localStorage.setItem(`morogaro:${key}`, JSON.stringify(value)); } catch { /* File URLs/private mode may block storage. UI still works. */ } },
  };
  let toastTimer;
  function toast(message) {
    const el = $('#toast');
    clearTimeout(toastTimer); el.textContent = message; el.classList.add('is-visible');
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 3800);
  }
  function announce(message) { $('#log-announcement').textContent = message; }
  function emit(name, detail) { document.dispatchEvent(new CustomEvent(`morogaro:${name}`, { detail })); }

  /* ───────── 두 페이지: 상세(detail) ↔ 바톤로그(log) ─────────
   * 한 문서 안에서 스크롤로 이어지지 않고, 진짜로 페이지를 나눠요.
   *   - 상세 페이지에선 바톤로그가 문서에 없어요(display:none). 그래서 B 상태에서 스크롤이 '탁' 멈춰요.
   *   - 바톤로그 페이지에선 상세가 문서에 없어요.
   *   - 끝에서 한 번 멈춘 뒤(HOLD_MIN) 새로 스크롤하면 슬라이드로 넘어가요.
   *     상세 → 로그: 상세가 위로 슬라이드 아웃, 로그가 아래에서 슬라이드 인.
   *     로그 → 상세: 로그가 아래로 슬라이드 아웃, 상세가 위에서 슬라이드 인(B 상태로 돌아와요). */
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reducePrimaryMotion = new URLSearchParams(location.search).get('motion') === 'reduce';
  const logView = $('#log-view');
  let lastPageScroll = -Infinity;
  let pageAnimating = false;
  let pageDestination = 'detail';
  let swapTimer = 0, guardUntil = 0, guardDir = 0;
  const SWAP_OUT = 420, SWAP_IN = 900, GUARD = 300;
  const QUIET = 450, HOLD_MIN = 500;   // 끝에서 0.5초 멈춘 뒤 안내가 뜨고, 그때부터 넘어가요
  let edgeHold = 0, edgeArmed = false, lastNavInput = -Infinity, lastNavAbs = 0, freshInput = true;
  /* 새 손짓인지 판단해요. 세게 밀면 트랙패드 관성이 1~3초 이어지고 끝에선 띄엄띄엄 와요.
   * 그 꼬리가 '새 스크롤'로 읽히지 않게, 휠 입력이 QUIET 동안 완전히 멈췄거나
   * 줄어들던 값이 갑자기 크게 다시 커졌을 때(손가락을 새로 댐)만 새 손짓으로 봐요. */
  function isFreshWheel(now, abs) {
    const fresh = now - lastNavInput > QUIET || (abs >= 30 && abs >= lastNavAbs * 3);
    lastNavInput = now; lastNavAbs = abs;
    return fresh;
  }
  const maxScroll = () => Math.max(0, document.documentElement.scrollHeight - innerHeight);
  /* ── '다음이 있어요' 안내 ──
   * B 상태(상세 끝)에서 0.5초 머물면 '바톤 너머' 글자가 같은 톤의 안내 문구로 바뀌고 화살표가 아래로 톡톡 움직여요.
   * 그때부터 스크롤하면 릴레이 로그로 넘어가요. 그 전에 스크롤하면 화면이 살짝 밀렸다 돌아와요. */
  const beyondButton = $('#show-log');
  const beyondLabel = beyondButton?.querySelector('span:not(.chevron-down)');
  if (beyondLabel) {
    // 두 글자를 같은 자리에 겹쳐 두고, 안내가 뜰 때 서로 바꿔요.
    beyondLabel.classList.add('beyond-stack');
    beyondLabel.innerHTML = '<span class="beyond-label">바톤 너머</span><span class="beyond-hint" aria-hidden="true">아래로 스크롤해서 릴레이 로그 보기</span>';
  }
  let hintTimer = 0, tugAt = 0;
  const detailView = $('.detail-view');
  function showNextHint() {
    clearTimeout(hintTimer);
    if (pageAnimating || page.dataset.view !== 'detail' || window.scrollY < maxScroll() - 2 || $('dialog[open]')) return;
    const wait = edgeHold - performance.now();
    if (wait > 0) { hintTimer = setTimeout(showNextHint, wait + 20); return; }
    document.documentElement.classList.add('has-next-hint');
  }
  function hideNextHint() {
    clearTimeout(hintTimer);
    document.documentElement.classList.remove('has-next-hint');
  }
  function tug() {
    const now = performance.now();
    if (now - tugAt < 520 || motionPreference.matches || !detailView) return;
    tugAt = now;
    detailView.classList.remove('is-tug'); void detailView.offsetWidth; detailView.classList.add('is-tug');
  }
  detailView?.addEventListener('animationend', e => { if (e.animationName === 'detail-tug') detailView.classList.remove('is-tug'); });
  function applyView(view) {
    const isLog = view === 'log';
    page.dataset.view = view;
    page.dataset.lowerOpen = String(isLog);
    logView.inert = !isLog;
    $('#back-button').setAttribute('aria-label', isLog ? '바톤 상세정보로 돌아가기' : '이전 화면');
    window.MorogaroFit?.refresh();
  }
  function go(view, {instant = false, focus = false, updateHash = true} = {}) {
    const toLog = view === 'log';
    if (updateHash) { try { history.replaceState({view}, '', `#${toLog ? 'log' : 'detail'}`); } catch { /* embedded */ } }
    if (pageAnimating) return;
    if (instant || reducePrimaryMotion || page.dataset.view === view) {
      applyView(view);
      window.scrollTo({ top: toLog || page.dataset.view !== view ? 0 : window.scrollY, behavior: 'instant' });
      if (focus) (toLog ? $('#log-canvas') : $('#show-log')).focus({preventScroll:true});
      return;
    }
    pageAnimating = true; pageDestination = view; hideNextHint();
    page.dataset.transitioning = 'true';
    page.dataset.swap = toLog ? 'to-log' : 'to-detail';
    emit('page-transition-start', { view, duration: SWAP_OUT + SWAP_IN });
    clearTimeout(swapTimer);
    swapTimer = setTimeout(() => {
      applyView(view);
      window.scrollTo({ top: toLog ? 0 : maxScroll(), behavior: 'instant' });   // 상세로 돌아오면 B 상태(맨 아래)
      page.dataset.swap = toLog ? 'to-log-in' : 'to-detail-in';
      swapTimer = setTimeout(() => {
        pageAnimating = false;
        page.dataset.transitioning = 'false';
        delete page.dataset.swap;
        const now = performance.now();
        guardUntil = now + GUARD; guardDir = toLog ? 1 : -1;
        edgeHold = now + HOLD_MIN; freshInput = false; edgeArmed = true;
        if (!toLog) showNextHint();
        if (focus) (toLog ? $('#log-canvas') : $('#show-log')).focus({preventScroll:true});
        emit('page-transition-end', { view, duration: SWAP_OUT + SWAP_IN });
      }, SWAP_IN);
    }, SWAP_OUT);
  }
  // 이전 이름을 쓰는 코드(개발용 훅, 메이커 연동)를 위해 남겨 둬요.
  function setView(view, {updateHash = true, focus = false, behavior = 'smooth'} = {}) {
    go(view, {updateHash, focus, instant: behavior === 'instant' || behavior === 'auto'});
  }
  window.addEventListener('scroll', () => {
    lastPageScroll = performance.now();
    if (pageAnimating) return;
    // 보통 스크롤로 페이지 끝(상세 B) · 로그 맨 위에 닿은 순간에도 한 번 멈춤을 시작해요.
    const atEdge = page.dataset.view === 'detail' ? window.scrollY >= maxScroll() - 2 : window.scrollY <= 2;
    if (atEdge && !edgeArmed) { edgeArmed = true; edgeHold = performance.now() + HOLD_MIN; }
    else if (!atEdge) edgeArmed = false;
    if (atEdge && page.dataset.view === 'detail') showNextHint(); else hideNextHint();
  }, {passive:true});
  function scrollablePanelCanConsume(target, delta) {
    const panel = target.closest?.('.folder-scroll');
    return panel && ((delta > 0 && panel.scrollTop < panel.scrollHeight - panel.clientHeight - 1) ||
      (delta < 0 && panel.scrollTop > 1));
  }
  function navigatePage(delta) {
    if (!Number.isFinite(delta) || delta === 0) return false;
    if (pageAnimating) return true;
    const now = performance.now(), y = window.scrollY, max = maxScroll();
    // 같은 손짓의 관성은 손짓이 완전히 끝날 때까지 삼켜요.
    if (guardDir && Math.sign(delta) === guardDir) { if (!freshInput || now < guardUntil) return true; }
    guardDir = 0;
    const waiting = () => now < edgeHold || !freshInput;
    if (page.dataset.view === 'detail' && delta > 0) {
      if (y < max - 2) {
        if (y + delta > max) { window.scrollTo({top: max, behavior: 'instant'}); edgeHold = now + HOLD_MIN; edgeArmed = true; showNextHint(); return true; }
        return false;
      }
      if (waiting()) { if (freshInput) tug(); return true; }   // 페이지 끝에서 멈춘 채로
      go('log'); return true;
    }
    if (page.dataset.view === 'log' && delta < 0) {
      if (y > 2) {
        if (y + delta < 0) { window.scrollTo({top: 0, behavior: 'instant'}); edgeHold = now + HOLD_MIN; edgeArmed = true; return true; }
        return false;
      }
      if (waiting()) return true;
      go('detail'); return true;
    }
    return false;
  }
  window.addEventListener('wheel', event => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || $('dialog[open]')) return;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.deltaY === 0) return;
    const unit = event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? innerHeight : 1;
    const delta = event.deltaY * unit;
    freshInput = isFreshWheel(performance.now(), Math.abs(delta));
    if (pageAnimating) { event.preventDefault(); return; }
    if (scrollablePanelCanConsume(event.target, delta)) return;
    if (navigatePage(delta)) event.preventDefault();
  }, {passive:false});
  window.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || $('dialog[open]')) return;
    if (event.target.closest?.('input,textarea,select,button,a,[contenteditable="true"],.log-canvas,.folder-scroll')) return;
    const down = event.key === 'PageDown' || event.key === 'ArrowDown' || (event.key === ' ' && !event.shiftKey);
    const up = event.key === 'PageUp' || event.key === 'ArrowUp' || (event.key === ' ' && event.shiftKey);
    freshInput = !event.repeat;
    if ((down || up) && navigatePage((down ? 1 : -1) * innerHeight)) event.preventDefault();
  });
  let touchY = null, touchUsed = false;
  window.addEventListener('touchstart', e => { touchY = e.touches[0]?.clientY ?? null; touchUsed = false; freshInput = true; }, {passive:true});
  window.addEventListener('touchmove', e => {
    if (touchY === null) return;
    if (touchUsed || pageAnimating) { if (e.cancelable) e.preventDefault(); return; }
    const y = e.touches[0].clientY, delta = touchY - y; touchY = y;
    if (navigatePage(delta)) { touchUsed = true; freshInput = false; if (e.cancelable) e.preventDefault(); }
  }, {passive:false});
  $('#show-log').addEventListener('click', () => go('log', {focus:true}));
  $('#back-button').addEventListener('click', () => {
    if (page.dataset.view === 'log') go('detail', {focus:true});
    else if (live) live.edit();
    else toast('탐색 화면은 이번 상세페이지 구현에 포함되어 있지 않아요.');
  });
  $('.brand').addEventListener('click', e => { e.preventDefault(); go('detail'); });
  window.addEventListener('hashchange', () => {
    if (location.hash === '#log' || location.hash === '#detail') go(location.hash.slice(1), {updateHash:false});
  });

  // Gallery: working thumbnails and an accessible native dialog.
  const gallery = live ? live.gallery : [
    { src: 'assets/detail-image-0.png', title: '참외 달력', alt: '노란색 바탕과 크림색 참외 모양으로 구성한 참외 달력' },
    { src: 'assets/detail-image-2.png', title: '자두 달력', alt: '자두색 바탕과 빨간 자두 모양으로 구성한 달력' },
    { src: 'assets/detail-image-3.png', title: '복숭아 달력', alt: '복숭아색 바탕과 크림색 과일 모양으로 구성한 달력' },
  ];
  let galleryIndex = 0;
  function selectGallery(index, focus = false) {
    if (!gallery.length) return;
    galleryIndex = (index + gallery.length) % gallery.length;
    const data = gallery[galleryIndex];
    if (live?.thumbRatio && galleryIndex === 0) Object.assign($('#main-artwork').style, { aspectRatio: live.thumbRatio, objectFit: 'cover', height: 'auto' }); else Object.assign($('#main-artwork').style, { aspectRatio: '', objectFit: '', height: '' });
    $('#main-artwork').src = asset(data.src); $('#main-artwork').alt = data.alt;
    $('#open-artwork').setAttribute('aria-label', `${data.title} 크게 보기`);
    $$('.thumbnail').forEach((button, i) => {
      button.classList.toggle('is-active', i === galleryIndex);
      button.setAttribute('aria-selected', String(i === galleryIndex));
      button.tabIndex = i === galleryIndex ? 0 : -1;
    });
    if (focus) $$('.thumbnail')[galleryIndex].focus();
  }
  $$('.thumbnail').forEach(button => button.addEventListener('click', () => selectGallery(Number(button.dataset.image))));
  $('.thumbnails').addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); selectGallery(galleryIndex + (e.key === 'ArrowRight' ? 1 : -1), true); }
    if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); selectGallery(e.key === 'Home' ? 0 : gallery.length - 1, true); }
  });
  const lightbox = $('#lightbox');
  function showImages(title, entries, className = '') {
    $('#lightbox-title').textContent = title;
    const content = $('#lightbox-content'); content.className = `lightbox-content ${className}`; content.replaceChildren();
    for (const item of entries) { const img = new Image(); img.src = asset(item.src); img.alt = item.alt || title; content.append(img); }
    if (!lightbox.open) lightbox.showModal();
  }
  $('#open-artwork').addEventListener('click', () => gallery.length && showImages(gallery[galleryIndex].title, [gallery[galleryIndex]]));
  $('.close-dialog', lightbox).addEventListener('click', () => lightbox.close());
  lightbox.addEventListener('click', e => { if (e.target !== lightbox) return; const b = lightbox.getBoundingClientRect(); if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) lightbox.close(); });
  $('#open-references').addEventListener('click', () => showImages('레퍼런스 이미지', live ? live.references : [
    { src: 'assets/detail-image-4.png', alt: '컬러 패키지 레퍼런스' },
    { src: 'assets/detail-image-5.png', alt: '과일 패키지 레퍼런스' },
    { src: 'assets/detail-image-6.png', alt: '과일 그래픽 레퍼런스' },
  ], 'reference-gallery'));

  function setTab(tab, focus = false) {
    const info = tab === 'info'; $('#baton-folder').dataset.tab = info ? 'info' : 'files';
    $('#info-panel').hidden = !info; $('#files-panel').hidden = info;
    for (const [id, selected] of [['info-tab', info], ['files-tab', !info]]) {
      const el = document.getElementById(id); el.setAttribute('aria-selected', String(selected)); el.tabIndex = selected ? 0 : -1;
    }
    updateFolderScrollbar();
    if (focus) (info ? $('#info-tab') : $('#files-tab')).focus();
  }
  function updateFolderScrollbar() {
    const panel = $('#baton-folder').dataset.tab === 'info' ? $('#info-panel') : $('#files-panel');
    const max = Math.max(0, panel.scrollHeight - panel.clientHeight);
    $('#folder-scroll-thumb').style.transform = `translateY(${max ? panel.scrollTop / max * (322 - (window.MorogaroFit?.shift() || 0)) : 0}px)`;
  }
  let scrollGesture = null;
  $('#folder-scrollbar').addEventListener('pointerdown', e => {
    const panel = $('#baton-folder').dataset.tab === 'info' ? $('#info-panel') : $('#files-panel');
    scrollGesture = { y: e.clientY, scroll: panel.scrollTop, panel };
    e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault();
  });
  $('#folder-scrollbar').addEventListener('pointermove', e => {
    if (!scrollGesture) return;
    const { y, scroll, panel } = scrollGesture;
    panel.scrollTop = scroll + (e.clientY-y) / S() / (322 - (window.MorogaroFit?.shift() || 0)) * (panel.scrollHeight-panel.clientHeight);
  });
  $('#folder-scrollbar').addEventListener('pointerup', () => { scrollGesture = null; });
  $('#folder-scrollbar').addEventListener('pointercancel', () => { scrollGesture = null; });
  $$('.folder-scroll').forEach(panel => panel.addEventListener('scroll', updateFolderScrollbar, { passive: true }));
  $('#info-tab').addEventListener('click', () => setTab('info'));
  $('#files-tab').addEventListener('click', () => setTab('files'));
  $('.folder-tabs').addEventListener('keydown', e => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      e.preventDefault(); setTab(e.key === 'Home' ? 'info' : e.key === 'End' ? 'files' : $('#baton-folder').dataset.tab === 'info' ? 'files' : 'info', true);
    }
  });
  $$('.save-baton').forEach(button => {
    let saved = live ? live.bookmarked : memory.read('saved:current', false) === true; button.setAttribute('aria-pressed', String(saved));
    button.addEventListener('click', () => { saved = !saved; button.setAttribute('aria-pressed', String(saved)); button.setAttribute('aria-label', saved ? '바톤 저장 취소' : '바톤 저장'); if (live) live.setBookmark(saved); else memory.write('saved:current', saved); toast(saved ? '이 브라우저에 바톤을 저장했어요.' : '바톤 저장을 취소했어요.'); });
  });
  async function copyText(value, success) {
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) await navigator.clipboard.writeText(value);
      else {
        const area = document.createElement('textarea'); area.value = value; area.style.cssText = 'position:fixed;left:-10000px;top:0'; document.body.append(area); area.select(); const copied = document.execCommand('copy'); area.remove(); if (!copied) throw new Error('Clipboard unavailable');
      }
      toast(success);
    } catch { toast(`클립보드 권한을 확인해주세요. ${value}`); }
  }
  $('#share-baton').addEventListener('click', () => {
    if (live) { toast(live.shareMessage); return; }
    if (location.protocol === 'file:' || location.protocol === 'about:') { toast('로컬 HTML은 공개 주소가 없어요. 호스팅 후 공유 링크가 작동해요.'); return; }
    copyText(location.href.split('#')[0] + '#detail', '바톤 링크를 복사했어요.');
  });
  $$('[data-color]').forEach(button => button.addEventListener('click', () => copyText(button.dataset.color, `${button.dataset.color} 색상 코드를 복사했어요.`)));
  $$('[data-source-download]').forEach(button => button.addEventListener('click', () => {
    emit('download-request', { name: button.dataset.sourceDownload, connected: false });
    toast('SVG에는 파일명만 있고 실제 AI·DOCX 파일은 없어 다운로드 연결이 필요해요.');
  }));
  $$('[data-inherit]').forEach(button => button.addEventListener('click', () => {
    emit('inherit', { sourceBaton: 'fruit-calendar', idea: button.dataset.inherit, stage: 'Planting' });
    toast(live ? live.inheritMessage : '계승 시작 버튼까지 연결했어요. 바톤 메이커 연결 전에는 새 바톤이 생성되지 않아요.');
  }));
  $$('[data-unwired]').forEach(button => button.addEventListener('click', () => toast(`${button.dataset.unwired} 기능은 이번 상세페이지에 아직 연결되지 않았어요.`)));
  $('#search-form').addEventListener('submit', e => { e.preventDefault(); toast('검색은 탐색 페이지와 연결할 예정이에요.'); });

  // waiting → revealing (the guidance fades, nodes stay still) → intro → ready.
  // Every node is persistent. Wheel/drag retarget a continuous coordinate, not
  // a succession of blocked CSS transitions. Position and velocity are retained.
  const canvas = $('#log-canvas');
  const nodesHost = $('#log-nodes');
  const branchHost = $('#branch-nodes');
  const tutorial = $('#log-tutorial');
  const preview = $('#log-preview');
  const kindList = ['duo','duo','green','green','red','yellow','duo','green','green','green','yellow','duo','red'];
  const kindNames = {duo:'과일 달력 묶음', green:'초록색 달력', red:'빨간색 달력', yellow:'참외 달력'};
  // The main baton's actual left inset defines the mirrored RIGHT entry gate.
  // A queued card is outside this gate; its leading edge becomes visible as it
  // moves left through the gate. No card first appears in the canvas centre.
  // The original final rail coordinates remain untouched, including its tail.
  const introInset = $('#log-root').offsetLeft;
  const introLaunchX = canvas.clientWidth - introInset;
  canvas.style.setProperty('--intro-inset', `${introInset}px`);
  const introStartX = kindList.map(() => introLaunchX);
  const introPrelude = CONFIG.tutorialFade + CONFIG.introPause;
  const introTotalDuration = CONFIG.introDuration;
  const introMovementDuration = introTotalDuration - introPrelude;
  // Geometrically shorter, non-overlapping slots: later cards attach faster.
  // Normalize their sum to ONE deadline, rather than starting another timer
  // for each card (which used to accumulate 13 seconds and frame delays).
  const introWeights = kindList.map((_, i) => CONFIG.introDurationRatio ** i);
  const introWeightTotal = introWeights.reduce((sum, weight) => sum + weight, 0);
  let introCursor = 0;
  const introPlan = introWeights.map((weight, index) => {
    const start = introCursor;
    const duration = introMovementDuration * weight / introWeightTotal;
    introCursor += duration;
    const end = index === kindList.length - 1 ? introMovementDuration : introCursor;
    return Object.freeze({index, start, end, duration: end - start,
      from: introLaunchX, to: CONFIG.firstNodeX + index * CONFIG.step});
  });
  Object.freeze(introPlan);
  const state = {phase:'waiting', compact:false, selected:-1, branches:false,
    branch:0, rail:-1, branchProgress:0, pan:0, tutorial:true, preview:false};
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const mix = (a,b,t) => a+(b-a)*t;
  let hoverTimer = 0, introTimer = 0, introFrame = 0, introEpoch = 0;
  let animationFrame = 0, animationLast = 0, wheelSettleTimer = 0;
  let wheelSession = null, gesture = null, suppressClickUntil = 0;
  let pointerPosition = {x:NaN, y:NaN, moved:false};
  document.addEventListener('pointermove', event => {
    pointerPosition = {x:event.clientX, y:event.clientY,
      moved:event.clientX !== pointerPosition.x || event.clientY !== pointerPosition.y};
  }, {capture:true, passive:true});

  function nodeAsset(kind,size) {
    const exact = {'duo:114':'node-duo-active','green:114':'node-green-active',
      'yellow:78':'node-yellow-neighbor','green:78':'node-green-neighbor',
      'green:44':'node-green-small','duo:44':'node-duo-small'};
    return `assets/${exact[`${kind}:${size}`] || `node-${kind}`}.svg`;
  }
  const sizes = [44,66,78,114];
  function makeVisual(button, kind, base, initial) {
    // Pre-mount exact source variants: scaling never changes an image src during
    // a gesture. A continuous crossfade preserves the original endpoint artwork.
    const surface = CONFIG.renderSurface;
    button.style.width = button.style.height = `${surface}px`;
    button.style.setProperty('--node-render-scale', (surface/base).toFixed(6));
    // 실제 바톤: 시안 그림 대신 사용자가 올린 이미지를 노드마다 돌아가며 보여줘요.
    const liveGallery = [...(window.MorogaroLive?.gallery || []), ...(window.MorogaroLive?.references || [])];
    const liveSrc = liveGallery.length ? liveGallery[(makeVisual.count = (makeVisual.count || 0) + 1) % liveGallery.length].src : null;
    if (liveSrc) button.classList.add('has-live-art');
    const art = sizes.map(size => {
      const img = new Image(); img.src = liveSrc || asset(nodeAsset(kind,size)); img.alt = '';
      img.width = base; img.height = base; img.className = 'node-art' + (liveSrc ? ' is-live-art' : ''); img.draggable = false;
      button.append(img); return img;
    });
    const visual = {button, base, surface, art, value:{...initial}, target:{...initial},
      velocity:{x:0,y:0,size:0,alpha:0}};
    paint(visual); return visual;
  }
  function paint(visual) {
    const {button,surface,value,art} = visual;
    // Full original SVGs, pre-sized ABOVE the maximum 114px display size.
    // Width/height and shadows never change during navigation; only transform
    // and opacity are composited. Never magnify a 44/66px cached surface.
    const last=visual.painted||(visual.painted={art:[]});
    const transform=`translate3d(${value.x.toFixed(5)}px,${value.y.toFixed(5)}px,0) scale(${(value.size/surface).toFixed(9)})`;
    if(last.transform!==transform){button.style.transform=transform;last.transform=transform;}
    const opacity=String(clamp(value.alpha,0,1));
    if(last.opacity!==opacity){button.style.opacity=opacity;last.opacity=opacity;}
    let lower = 0;
    while (lower < sizes.length-2 && value.size > sizes[lower+1]) lower++;
    const blend = clamp((value.size-sizes[lower])/(sizes[lower+1]-sizes[lower]),0,1);
    art.forEach((img,i)=>{
      const opacity=String(i===lower?1:i===lower+1?blend:0);
      if(last.art[i]!==opacity){img.style.opacity=opacity;last.art[i]=opacity;}
    });
  }
  const nodes = kindList.map((kind,i) => {
    const button = document.createElement('button'); button.type = 'button';
    button.className = 'log-node'; button.dataset.node = String(i);
    button.setAttribute('aria-label', `${i+1}번째 바톤, ${kindNames[kind]}. 선택하면 계승 분기 표시`);
    button.setAttribute('aria-pressed','false'); nodesHost.append(button);
    button.addEventListener('click', () => {
      if (performance.now() < suppressClickUntil || state.phase !== 'ready') return;
      if (state.selected === i && state.branches) {
        if (state.branchProgress > .01) selectBranch(0,'click'); else openPreview();
      } else selectNode(i,true,'click');
    });
    button.dataset.introPhase = 'queued'; button.dataset.introProgress = '0';
    return makeVisual(button,kind,66,{x:introStartX[i],y:142,size:66,alpha:0});
  });
  // Branch 0 is the real main-row node, not an instant replacement. It moves
  // up/shrinks as its own descendants rise into the exact selection anchor.
  const branchVisuals = [1,2].map(i => {
    const button = document.createElement('button'); button.type = 'button';
    button.className = 'branch-node'; button.dataset.branch = String(i);
    branchHost.append(button);
    button.addEventListener('click', event => {
      event.stopPropagation(); if (performance.now() < suppressClickUntil) return;
      if (state.branch === i) openPreview(); else selectBranch(i,'click');
    });
    return makeVisual(button,'green',44,{x:694,y:350+(i-1)*56,size:44,alpha:0});
  });
  const visuals = [...nodes,...branchVisuals];

  // Navigation is solved in *one logical coordinate per axis*, not in 15
  // independent card animations. Retargeting retains both position and velocity.
  const channel = value => ({value,target:value,velocity:0,acceleration:0,curve:null});
  const navigation = {
    rail:channel(centerNodeIndex()), branch:channel(0), focus:channel(0),
    descendants:channel(0), owner:-1, source:'api', mode:'idle', activeAxis:null,
    lastInputAt:-Infinity, inputVelocity:0, lastDelta:0, pendingAnnouncement:false,
  };
  const bottomFade = $('#branch-fade');
  const topFade = bottomFade.cloneNode(false);
  topFade.id = 'branch-fade-top'; topFade.classList.add('is-top');
  topFade.hidden = true; bottomFade.after(topFade);

  function advanceChannel(c,dt,omega) {
    const offset = c.value-c.target, term = c.velocity+omega*offset;
    const decay = Math.exp(-omega*dt);
    c.value = c.target+(offset+term*dt)*decay;
    c.velocity = (c.velocity-omega*term*dt)*decay;
    c.acceleration=-2*omega*c.velocity-omega*omega*(c.value-c.target);
    if (Math.abs(c.value-c.target)<0.00008 && Math.abs(c.velocity)<0.001) {
      c.value=c.target; c.velocity=0; c.acceleration=0; return false;
    }
    return true;
  }
  function jumpChannel(c,value) { c.value=c.target=value; c.velocity=c.acceleration=0; c.curve=null; }
  function smooth01(t) { t=clamp(t,0,1);return t*t*(3-2*t); }
  // Quintic Hermite travel preserves position, velocity AND acceleration when
  // an incoming notch/click changes the destination. It has a finite end rather
  // than an exponential tail followed by a second snap.
  function coefficients(from,to,velocity,acceleration,seconds) {
    const v=velocity*seconds,a=acceleration*seconds*seconds,d=to-from;
    return [from,v,a/2,10*d-6*v-1.5*a,-15*d+8*v+1.5*a,6*d-3*v-.5*a];
  }
  function evaluateCurve(k,t,T) {
    const p=((((k[5]*t+k[4])*t+k[3])*t+k[2])*t+k[1])*t+k[0];
    const v=((((5*k[5]*t+4*k[4])*t+3*k[3])*t+2*k[2])*t+k[1])/T;
    const a=(((20*k[5]*t+12*k[4])*t+6*k[3])*t+2*k[2])/(T*T);
    return {p,v,a};
  }
  function retargetCurve(c,to) {
    if(c.curve && Math.abs(c.target-to)<1e-9)return;
    const distance=to-c.value,abs=Math.abs(distance),direction=Math.sign(distance);
    if(abs<.00005 && Math.abs(c.velocity)<.001){jumpChannel(c,to);return;}
    let duration=clamp(CONFIG.transitionDuration+90*Math.log2(Math.max(1,abs)),
      CONFIG.transitionMin,CONFIG.transitionMax)/1000;
    // Avoid a stop past the requested item. Already moving toward a nearby
    // destination needs less time; reversal remains a continuous deceleration.
    if(c.velocity*direction>0 && abs>1e-6)duration=Math.min(duration,2.1*abs/Math.abs(c.velocity));
    duration=Math.max(.07,duration);
    let k=coefficients(c.value,to,c.velocity,c.acceleration,duration);
    if(c.velocity*direction>=0 && abs>1e-6) {
      for(let attempt=0;attempt<10;attempt++) {
        let monotone=true;
        for(let i=1;i<32;i++)if(evaluateCurve(k,i/32,duration).v*direction < -0.0001){monotone=false;break;}
        if(monotone)break;
        duration*=.8;k=coefficients(c.value,to,c.velocity,c.acceleration,duration);
      }
    }
    c.target=to;c.curve={elapsed:0,duration,coefficients:k};
  }
  function driveChannel(c,to,immediate=false) {
    if(immediate){jumpChannel(c,to);return;}
    const direct=navigation.mode==='tracking' && c===navigation[navigation.activeAxis];
    if(direct){c.target=to;c.curve=null;return;}
    if(Math.abs(c.target-to)>1e-9 || (!c.curve&&Math.abs(c.value-to)>.00005))retargetCurve(c,to);
  }
  function advanceTravel(c,dt) {
    if(!c.curve)return advanceChannel(c,dt,CONFIG.trackFrequency);
    const curve=c.curve;
    curve.elapsed=Math.min(curve.duration,curve.elapsed+dt);
    const sample=evaluateCurve(curve.coefficients,curve.elapsed/curve.duration,curve.duration);
    c.value=sample.p;c.velocity=sample.v;c.acceleration=sample.a;
    if(curve.elapsed>=curve.duration){jumpChannel(c,c.target);return false;}
    return true;
  }

  // The row is one continuous, linear carousel with a stationary focus lens.
  // No selected/unselected layout swap occurs at an integer index. Expansion
  // around the focus is C2-continuous and all original integer endpoints match.
  const focusExponent=Math.log(.25)/Math.log(.75);
  function railLens(relative) {
    const d=Math.abs(relative),sign=Math.sign(relative);
    let expansion;
    if(d<=1)expansion=48*d-36*d*d*d+18*d*d*d*d;
    else if(d<2){const t=d-1;expansion=30+12*t-12*t*t*t+6*t*t*t*t;}
    else expansion=36;
    const size=66+48*Math.pow(Math.max(0,1-d*d/4),focusExponent);
    return {center:CONFIG.selectedCenterX+78*relative+sign*expansion,size};
  }
  function interpolateGeometry(a,b,t) {return {x:mix(a.x,b.x,t),y:mix(a.y,b.y,t),size:mix(a.size,b.size,t)};}
  function rowGeometry(index) {
    const compact={x:CONFIG.firstNodeX+index*CONFIG.step,y:142,size:66};
    const lens=railLens(index-navigation.rail.value);
    const selected={x:lens.center-lens.size/2,y:CONFIG.centerY-lens.size/2,size:lens.size};
    return interpolateGeometry(compact,selected,clamp(navigation.focus.value,0,1));
  }
  function branchGeometry(index,progress) {
    const d=index-progress,a=Math.abs(d),t=Math.min(a,1);
    const expansion=70*t-70*t*t*t+35*t*t*t*t;
    const size=44+70*Math.pow(Math.max(0,1-a*a),3);
    const center=CONFIG.centerY+56*d+Math.sign(d)*expansion;
    return {x:CONFIG.selectedCenterX-size/2,y:center-size/2,size};
  }
  function commitVisibleSelection() {
    const selected=navigation.focus.target>0?clamp(Math.round(navigation.rail.value),0,nodes.length-1):-1;
    if (state.selected!==selected) {
      state.selected=selected;
      if(selected>=0) {
        navigation.pendingAnnouncement=true;
        emit('log-selection',{index:selected,kind:kindList[selected],source:navigation.source});
      }
    }
    const branch=navigation.owner===selected?clamp(Math.round(navigation.branch.value),0,2):0;
    if(state.branch!==branch) {
      state.branch=branch;navigation.pendingAnnouncement=true;
      if(selected>=0) emit('log-branch-selection',{parent:selected,index:branch,source:navigation.source});
    }
  }
  function announceSettledSelection() {
    if(!navigation.pendingAnnouncement || state.selected<0)return;
    navigation.pendingAnnouncement=false;
    announce(state.branch>0 ? `${state.selected+1}번째 바톤의 계승 분기 ${state.branch}를 선택했어요.` :
      `${state.selected+1}번째 바톤. 선택한 바톤 위에서 스크롤하면 하위 계승을 볼 수 있어요.`);
  }
  function updateDescendantTarget() {
    const nearest=clamp(Math.round(navigation.rail.value),0,nodes.length-1);
    const railInput=navigation.activeAxis==='rail' &&
      (navigation.mode==='tracking'||(gesture&&gesture.moved));
    const railStable=Math.abs(navigation.rail.value-nearest)<0.055 &&
      Math.abs(navigation.rail.velocity)<0.5 && Math.abs(navigation.rail.target-nearest)<0.01;
    // Outgoing descendants fade back into their parent before ownership changes.
    // Reusing a visible branch column for each newly rounded target caused pops.
    if(navigation.owner!==nearest && navigation.descendants.value<0.015) {
      navigation.owner=nearest;
      jumpChannel(navigation.branch,0);
    }
    navigation.descendants.target=state.branches && !state.preview &&
      navigation.focus.target===1 && navigation.owner===nearest && !railInput && railStable ? 1:0;
  }
  function paintReadyFrame() {
    commitVisibleSelection();
    const reveal=clamp(navigation.descendants.value,0,1)*clamp(navigation.focus.value,0,1);
    const owner=navigation.owner;
    const parentRow=owner>=0?rowGeometry(owner):null;
    const columnShift=parentRow?parentRow.x+parentRow.size/2-CONFIG.selectedCenterX:0;
    canvas.dataset.phase=state.phase; canvas.dataset.selected=String(state.selected);
    canvas.dataset.branch=String(state.branch);
    canvas.dataset.railPosition=navigation.rail.value.toFixed(5);
    canvas.dataset.branchPosition=navigation.branch.value.toFixed(5);
    canvas.classList.toggle('has-selection',navigation.focus.target>0);
    nodes.forEach((visual,i)=>{
      let geometry=rowGeometry(i);
      if(i===owner && reveal>0 && navigation.branch.value>0) {
        const branch=branchGeometry(0,navigation.branch.value); branch.x+=columnShift;
        geometry=interpolateGeometry(geometry,branch,reveal);
      }
      const isParent=i===state.selected;
      visual.value={...geometry,alpha:isParent&&state.preview?0:1};
      visual.target={...visual.value};paint(visual);
      const offscreen=geometry.x+geometry.size<=212 || geometry.x>=CONFIG.logWidth;
      const active=!offscreen && !(isParent&&state.preview);
      visual.button.style.pointerEvents=active?'auto':'none'; visual.button.tabIndex=active?0:-1;
      visual.button.classList.toggle('is-selected',isParent);
      visual.button.setAttribute('aria-pressed',String(isParent&&state.branch===0));
      visual.button.dataset.branchOwner=String(isParent);
      visual.button.dataset.introPhase='docked';visual.button.dataset.introProgress='1';
    });
    branchVisuals.forEach((visual,k)=>{
      const i=k+1,geometry=branchGeometry(i,navigation.branch.value);
      geometry.x+=columnShift; geometry.y+=(1-reveal)*24;
      visual.value={...geometry,alpha:state.preview?0:reveal};visual.target={...visual.value};paint(visual);
      const active=reveal>0.6 && !state.preview && state.selected===owner;
      visual.button.style.pointerEvents=active?'auto':'none';visual.button.tabIndex=active?0:-1;
      visual.button.setAttribute('aria-hidden',String(!active));
      visual.button.classList.toggle('is-current',state.branch===i);
      visual.button.setAttribute('aria-pressed',String(active&&state.branch===i));
      visual.button.setAttribute('aria-label',`${owner+1}번째 바톤의 계승 분기 ${i}${state.branch===i?', 선택됨. 다시 누르면 미리보기':', 선택'}`);
    });
    // Two existing-orientation fades blend rather than flipping at branch 2.
    const top=smooth01(navigation.branch.value-1);
    bottomFade.hidden=topFade.hidden=reveal<0.001 || state.preview;
    bottomFade.classList.remove('is-top');
    bottomFade.style.opacity=String(reveal*(1-top));topFade.style.opacity=String(reveal*top);
    preview.hidden=!state.preview;preview.style.left=`${CONFIG.selectedCenterX-57}px`;
  }
  function animate(now) {
    if(state.phase!=='ready') {animationFrame=0;return;}
    const dt=Math.min(.05,Math.max(.001,(now-animationLast)/1000));animationLast=now;
    const tracking=navigation.mode==='tracking'||(gesture&&gesture.moved);
    // No mid-gesture magnet. Detented input already owns a finite destination;
    // pixel streams stay fractional until release. Every visual uses this phase.
    let moving=advanceTravel(navigation.rail,dt);
    moving=advanceTravel(navigation.branch,dt)||moving;
    moving=advanceChannel(navigation.focus,dt,CONFIG.focusFrequency)||moving;
    updateDescendantTarget();
    moving=advanceChannel(navigation.descendants,dt,CONFIG.branchRevealFrequency)||moving;
    paintReadyFrame();
    if(moving) animationFrame=requestAnimationFrame(animate);
    else {animationFrame=0;canvas.dataset.moving='false';if(!tracking){navigation.mode='idle';announceSettledSelection();}}
  }
  function runMotion(immediate=false) {
    if(state.phase!=='ready')return;
    if(immediate||motionPreference.matches||reducePrimaryMotion) {
      cancelAnimationFrame(animationFrame);animationFrame=0;
      for(const name of ['rail','branch','focus'])jumpChannel(navigation[name],navigation[name].target);
      navigation.owner=clamp(Math.round(navigation.rail.value),0,nodes.length-1);
      navigation.descendants.target=state.branches&&!state.preview&&navigation.focus.target===1?1:0;
      jumpChannel(navigation.descendants,navigation.descendants.target);
      paintReadyFrame();canvas.dataset.moving='false';announceSettledSelection();return;
    }
    canvas.dataset.moving='true';
    if(!animationFrame){animationLast=performance.now();animationFrame=requestAnimationFrame(animate);}
  }
  function renderLog(immediate=false) {
    if(state.phase==='waiting'||state.phase==='revealing') {
      cancelAnimationFrame(animationFrame);animationFrame=0;
      jumpChannel(navigation.focus,0);jumpChannel(navigation.descendants,0);jumpChannel(navigation.branch,0);
      jumpChannel(navigation.rail,centerNodeIndex());navigation.owner=-1;navigation.mode='idle';
      canvas.dataset.phase=state.phase;canvas.dataset.selected='-1';canvas.dataset.branch='0';canvas.dataset.moving='false';
      canvas.classList.remove('has-selection');bottomFade.hidden=topFade.hidden=preview.hidden=true;
      nodes.forEach((visual,i)=>{
        visual.value={x:introStartX[i],y:142,size:66,alpha:0};visual.target={...visual.value};paint(visual);
        visual.button.dataset.introPhase='queued';visual.button.dataset.introProgress='0';
        visual.button.style.pointerEvents='none';visual.button.tabIndex=-1;
      });
      branchVisuals.forEach(visual=>{visual.value.alpha=0;paint(visual);visual.button.style.pointerEvents='none';visual.button.tabIndex=-1;});
      return;
    }
    if(state.phase!=='ready')return;
    navigation.focus.target=state.rail>=0?1:0;
    if(state.rail>=0)driveChannel(navigation.rail,state.rail,immediate);
    driveChannel(navigation.branch,state.branchProgress,immediate);
    if(state.rail<0 && immediate) {
      jumpChannel(navigation.rail,centerNodeIndex());jumpChannel(navigation.branch,0);navigation.owner=-1;
    }
    runMotion(immediate);
  }
  function logIsVisible() {
    const rect = canvas.getBoundingClientRect();
    const height = Math.max(0,Math.min(rect.bottom,innerHeight)-Math.max(0,rect.top));
    return !logView.inert && rect.right > 0 && rect.left < innerWidth && height/Math.min(CONFIG.logHeight*S(),innerHeight) >= CONFIG.hoverVisibleRatio;
  }
  function hideTutorial() {
    state.tutorial = false; tutorial.classList.add('is-dismissed'); tutorial.setAttribute('aria-hidden','true');
  }
  // Decode before entry so slow image loading cannot consume the visible
  // motion interval. Failed assets do not deadlock the interaction.
  const logAssetsReady = Promise.all(nodes.flatMap(visual => visual.art).map(img =>
    typeof img.decode === 'function' ? img.decode().catch(() => {}) : Promise.resolve()));
  function finishIntro() {
    if (!['intro','revealing'].includes(state.phase)) return;
    cancelAnimationFrame(introFrame); introFrame = 0;
    state.phase = 'ready'; state.compact = true;
    canvas.dataset.introProgress = '1'; canvas.dataset.introIndex = '-1';
    canvas.dataset.introElapsed = String(reducePrimaryMotion ? 0 : introTotalDuration);
    canvas.dataset.introDocked = String(nodes.length); canvas.setAttribute('aria-busy','false');
    renderLog(true);
    announce('왼쪽 정렬이 끝났어요. 일반 영역에서는 관련 바톤을, 선택한 바톤 위에서는 그 바톤의 계승 분기를 스크롤로 탐색해요.');
    emit('log-intro-end', {duration: reducePrimaryMotion ? 0 : introMovementDuration,
      totalDuration: reducePrimaryMotion ? 0 : introTotalDuration,
      nodeDurations: introPlan.map(slot => slot.duration), count: nodes.length,
      mode: 'accelerating-serial'});
  }
  function beginIntro() {
    if (state.phase !== 'waiting' || pageAnimating || !logIsVisible()) return false;
    clearTimeout(hoverTimer); clearTimeout(introTimer); const epoch = ++introEpoch;
    cancelAnimationFrame(animationFrame); animationFrame = 0;
    state.phase = 'revealing'; renderLog(true);
    canvas.dataset.introProgress = '0'; canvas.dataset.introIndex = '-1';
    canvas.dataset.introElapsed = '0'; canvas.dataset.introDocked = '0';
    canvas.setAttribute('aria-busy','true');
    if (reducePrimaryMotion) { hideTutorial(); finishIntro(); return true; }
    // Decode BEFORE starting the common clock. Network/image loading is not
    // charged against the visible animation. No per-card timers or frame gaps.
    logAssetsReady.then(() => {
      if (epoch !== introEpoch || state.phase !== 'revealing') return;
      let elapsed = 0, previous = null, clockStarted = false, movementStarted = false;
      let index = 0, nodeStarted = false;
      function frame(now) {
        if (epoch !== introEpoch) return;
        // Tab suspension / an off-screen section must not consume the sequence.
        if (document.hidden || pageAnimating || !logIsVisible()) {
          previous = null; introFrame = requestAnimationFrame(frame); return;
        }
        if (!clockStarted) {
          clockStarted = true; hideTutorial();
          emit('log-intro-sequence-start', {duration: introTotalDuration,
            prelude: introPrelude, movementDuration: introMovementDuration,
            inset: introInset, origin: introLaunchX, count: nodes.length});
        }
        if (previous !== null) elapsed += now - previous;
        previous = now;
        canvas.dataset.introElapsed = Math.min(elapsed,introTotalDuration).toFixed(3);
        canvas.dataset.introProgress = clamp(elapsed/introTotalDuration,0,1).toFixed(4);
        if (elapsed < introPrelude) {
          introFrame = requestAnimationFrame(frame); return;
        }
        if (!movementStarted) {
          movementStarted = true; state.phase = 'intro'; canvas.dataset.phase = 'intro';
          emit('log-intro-start', {duration: introMovementDuration,
            totalDuration: introTotalDuration, nodeDurations: introPlan.map(slot => slot.duration),
            count: nodes.length, mode: 'accelerating-serial'});
        }
        const movementElapsed = Math.min(elapsed-introPrelude, introMovementDuration);
        // Carry the same frame's elapsed remainder into the next slot. Already
        // docked cards stay fixed; at most ONE card is in flight on this timeline.
        // A slow frame can cross several boundaries, but cannot extend the end.
        while (index < nodes.length) {
          const slot = introPlan[index], visual = nodes[index];
          if (!nodeStarted) {
            nodeStarted = true; visual.button.dataset.introPhase = 'moving';
            canvas.dataset.introIndex = String(index);
            emit('log-intro-node-start', {...slot, scheduledAt: introPrelude+slot.start});
          }
          const progress = clamp((movementElapsed-slot.start)/slot.duration,0,1);
          const eased = progress*progress*(3-2*progress);
          visual.value.x = mix(slot.from,slot.to,eased);
          visual.value.y = 142; visual.value.size = CONFIG.nodeSize;
          visual.value.alpha = clamp(progress/CONFIG.introFadeFraction,0,1);
          visual.button.dataset.introProgress = progress.toFixed(4);
          paint(visual);
          if (progress < 1) break;
          visual.button.dataset.introPhase = 'docked';
          canvas.dataset.introDocked = String(index+1);
          emit('log-intro-node-end', {index, duration: slot.duration,
            scheduledAt: introPrelude+slot.end, elapsed});
          index++; nodeStarted = false;
        }
        if (index === nodes.length) { finishIntro(); return; }
        introFrame = requestAnimationFrame(frame);
      }
      introFrame = requestAnimationFrame(frame);
    });
    return true;
  }
  function pointerInCanvas() {
    const rect = canvas.getBoundingClientRect();
    return canvas.matches(':hover') ||
      (pointerPosition.x >= rect.left && pointerPosition.x < rect.right &&
       pointerPosition.y >= rect.top && pointerPosition.y < rect.bottom);
  }
  function beginAfterPageSettles() {
    clearTimeout(hoverTimer);
    if (state.phase !== 'waiting' || !pointerInCanvas() || !logIsVisible()) return;
    if (pageAnimating || performance.now() - lastPageScroll < CONFIG.hoverScrollIdle) {
      hoverTimer = setTimeout(beginAfterPageSettles, CONFIG.hoverScrollIdle); return;
    }
    beginIntro();
  }
  function hoverToBegin(event) {
    if (event.pointerType === 'touch' || state.phase !== 'waiting') return;
    pointerPosition = {x:event.clientX, y:event.clientY, moved:true};
    beginAfterPageSettles();
  }
  canvas.addEventListener('pointerenter', hoverToBegin);
  canvas.addEventListener('pointermove', hoverToBegin);
  document.addEventListener('morogaro:page-transition-start', () => {
    clearTimeout(hoverTimer); clearWheelGesture();
    // Never finish the intro out of sight while returning to the first page.
    if (state.phase === 'intro' || state.phase === 'revealing') showTutorial();
  });
  document.addEventListener('morogaro:page-transition-end', event => {
    if (event.detail.view === 'log') {
      // A cursor already inside the arriving log is a hover too. There is no
      // fragile 'must move again after scrolling' gate.
      hoverTimer = setTimeout(beginAfterPageSettles, CONFIG.hoverScrollIdle);
    }
  });

  function centerNodeIndex() { return clamp(Math.round((CONFIG.selectedCenterX-CONFIG.firstNodeX-33)/CONFIG.step),0,nodes.length-1); }
  function nextNodeIndex(direction) { return state.selected < 0 ? centerNodeIndex() : clamp(Math.round(state.rail)+direction,0,nodes.length-1); }
  function updateRail(progress,source) {
    if(state.phase!=='ready'||!Number.isFinite(progress))return false;
    const previous=Math.round(state.rail),next=clamp(progress,0,nodes.length-1);
    if(state.rail<0 && navigation.focus.value<.0001)jumpChannel(navigation.rail,next);
    state.rail=next;state.branches=true;state.branchProgress=0;state.preview=false;
    navigation.source=source;navigation.activeAxis='rail';renderLog();
    return previous!==Math.round(next);
  }
  function selectNode(index,branches=true,source='api') {
    if(!Number.isInteger(index)||index<0||index>=nodes.length||state.phase!=='ready')return false;
    clearWheelGesture();navigation.mode='settling';
    const changed=updateRail(index,source);
    if(!branches){state.branches=false;renderLog();}
    return changed;
  }
  function updateBranch(progress,source) {
    if(state.selected<0||state.phase!=='ready'||!Number.isFinite(progress))return false;
    const previous=Math.round(state.branchProgress);
    state.branches=true;state.preview=false;state.branchProgress=clamp(progress,0,2);
    navigation.source=source;navigation.activeAxis='branch';renderLog();
    return previous!==Math.round(state.branchProgress);
  }
  function selectBranch(index,source='api') {
    if(!Number.isInteger(index)||state.phase!=='ready'||state.selected<0)return false;
    clearWheelGesture();navigation.mode='settling';return updateBranch(clamp(index,0,2),source);
  }
  function openPreview() {
    if (state.selected < 0 || state.phase !== 'ready') return;
    state.preview = true; renderLog(); announce('바톤 미리보기가 열렸어요. Escape로 닫을 수 있어요.');
  }
  function clearWheelGesture() {
    clearTimeout(wheelSettleTimer);wheelSettleTimer=0;wheelSession=null;
    navigation.mode='settling';navigation.lastInputAt=-Infinity;navigation.inputVelocity=0;
  }
  function cancelIntro() {
    ++introEpoch; clearTimeout(introTimer); clearTimeout(hoverTimer); cancelAnimationFrame(introFrame); introFrame = 0;
    canvas.setAttribute('aria-busy','false'); canvas.dataset.introIndex = '-1';
  }
  function resetLog() {
    cancelIntro(); clearWheelGesture(); hideTutorial();
    Object.assign(state,{phase:'ready',compact:true,selected:-1,rail:-1,branches:false,branch:0,branchProgress:0,preview:false});
    renderLog(); announce('현재 바톤을 왼쪽에 고정한 처음 위치로 돌아왔어요.');
  }
  function showTutorial() {
    cancelIntro(); clearWheelGesture();
    Object.assign(state,{phase:'waiting',compact:false,selected:-1,rail:-1,branches:false,branch:0,branchProgress:0,preview:false,tutorial:true});
    tutorial.classList.remove('is-dismissed'); tutorial.removeAttribute('aria-hidden');
    canvas.dataset.introProgress = '0'; canvas.dataset.introDocked = '0'; canvas.dataset.introElapsed = '0'; renderLog(true);
    announce('로그에 마우스를 올리면 안내가 닫힌 뒤 왼쪽 정렬이 시작돼요.');
  }
  $('#log-root').addEventListener('click',() => { if (state.phase === 'ready') resetLog(); });
  $('#log-help').addEventListener('click',() => { showTutorial(); canvas.focus({preventScroll:true}); });
  $('#preview-open').addEventListener('click',() => showImages('여름 달력 with 삼원 컬러플랜',[{src:'assets/calendar-purple.svg',alt:'보라색 포도 달력 — 원본 바톤로그의 미리보기'}]));
  $('.preview-save').addEventListener('click',event => {
    const button = event.currentTarget, saved = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed',String(saved)); memory.write('saved:preview',saved);
    toast(saved ? '이 브라우저에 바톤을 저장했어요.' : '바톤 저장을 취소했어요.');
  });
  $('.preview-save').setAttribute('aria-pressed',String(memory.read('saved:preview',false) === true));

  function overBranchColumn(x,y) {
    if(state.selected<0||!state.branches||navigation.descendants.value<0.55)return false;
    const rect=canvas.getBoundingClientRect();
    return Math.abs((x-rect.left)/S()-CONFIG.selectedCenterX)<=CONFIG.selectedSize/2+6 && y>=rect.top&&y<=rect.bottom;
  }
  function recordInput(delta,axis,now,source) {
    const dt=(now-navigation.lastInputAt)/1000;
    const continuous=navigation.activeAxis===axis && dt>0 && dt<0.24;
    const speed=continuous?clamp(delta/Math.max(dt,.012),-14,14):0;
    navigation.inputVelocity=continuous?mix(navigation.inputVelocity,speed,.4):0;
    navigation.lastInputAt=now;navigation.lastDelta=delta;navigation.activeAxis=axis;
    navigation.source=source;navigation.mode='tracking';
  }
  function settleDestination(axis,source) {
    const target=axis==='branch'?state.branchProgress:state.rail,max=axis==='branch'?2:nodes.length-1;
    const drag=source==='drag',projection=drag?CONFIG.dragProjection:CONFIG.wheelProjection;
    const limit=drag?CONFIG.dragMaxCoast:CONFIG.wheelMaxCoast;
    // A decaying native trackpad stream already contains its own inertia.
    const speed=Math.abs(navigation.lastDelta)<0.05?0:navigation.inputVelocity;
    if(Math.abs(target-Math.round(target))<0.04)return clamp(Math.round(target),0,max);
    return clamp(Math.round(target+clamp(speed*projection,-limit,limit)),0,max);
  }
  function settleAxis(axis,source='wheel') {
    if(state.phase!=='ready'||state.rail<0)return;
    const c=axis==='branch'?navigation.branch:navigation.rail;
    const destination=settleDestination(axis,source);
    navigation.mode='settling';
    if(axis==='branch')updateBranch(destination,source+'-settle');else updateRail(destination,source+'-settle');
    emit('log-navigation-settle',{axis,destination,source,from:c.value,velocity:c.velocity});
  }
  function scheduleSnap(axis) {
    clearTimeout(wheelSettleTimer);
    wheelSettleTimer=setTimeout(()=>{wheelSettleTimer=0;settleAxis(axis);},CONFIG.wheelIdle);
  }
  canvas.addEventListener('wheel',event=>{
    if(event.ctrlKey||event.metaKey||!logIsVisible()||pageAnimating)return;
    if(state.phase==='waiting') {
      beginAfterPageSettles();if(state.phase!=='waiting')event.preventDefault();return;
    }
    if(state.phase!=='ready'){event.preventDefault();return;}
    const horizontal=Math.abs(event.deltaX)>Math.abs(event.deltaY);
    const unit=event.deltaMode===1?20:event.deltaMode===2?CONFIG.logHeight:1;
    const delta=(horizontal?event.deltaX:event.deltaY)*unit;
    if(!Number.isFinite(delta)||delta===0)return;
    const now=performance.now();
    const newSession=!wheelSession||now-wheelSession.at>CONFIG.wheelIdle ||
      Math.hypot(event.clientX-wheelSession.x,event.clientY-wheelSession.y)>12 || horizontal!==wheelSession.horizontal;
    if(newSession)wheelSession={axis:!horizontal&&overBranchColumn(event.clientX,event.clientY)?'branch':'rail',
      x:event.clientX,y:event.clientY,at:now,horizontal};
    const axis=wheelSession.axis;wheelSession.at=now;canvas.dataset.wheelAxis=axis;
    if(state.rail<0) {
      event.preventDefault();navigation.mode='settling';updateRail(centerNodeIndex(),'wheel');return;
    }
    const progress=axis==='branch'?state.branchProgress:state.rail,max=axis==='branch'?2:nodes.length-1;
    const c=axis==='branch'?navigation.branch:navigation.rail;
    const atEdge=delta>0?progress>=max-.001:progress<=.001;
    if(atEdge) {
      // Finish momentum at the rail boundary, then release only a new gesture.
      if(axis==='branch'||!newSession||Math.abs(c.value-progress)>.03) {
        event.preventDefault();scheduleSnap(axis);
      }
      return;
    }
    event.preventDefault();clearTimeout(wheelSettleTimer);
    // A notched mouse requests items. A trackpad supplies a continuous position.
    // This is deliberately a heuristic: line/page units or repeated large,
    // integral vertical deltas are treated as notches. No input is thrown away.
    const pixelStream=event.deltaMode===0 &&
      (horizontal || Math.abs(delta)<50 || Math.abs(delta-Math.round(delta))>.01 ||
       (wheelSession.lastMagnitude && Math.abs(Math.abs(delta)-wheelSession.lastMagnitude)>2));
    if(pixelStream)wheelSession.pixelStream=true;
    wheelSession.lastMagnitude=Math.abs(delta);
    if(!wheelSession.pixelStream) {
      const steps=Math.sign(delta)*clamp(Math.round(Math.abs(delta)/120),1,3);
      navigation.mode='timeline';navigation.source='wheel';navigation.activeAxis=axis;
      navigation.lastInputAt=now;navigation.inputVelocity=0;
      const destination=clamp(Math.round(progress)+steps,0,max);
      if(axis==='branch')updateBranch(destination,'wheel');else updateRail(destination,'wheel');
    } else {
      const amount=clamp(delta,-320,320)/CONFIG.wheelPixels;
      recordInput(amount,axis,now,'wheel');
      if(axis==='branch')updateBranch(progress+amount,'wheel');else updateRail(progress+amount,'wheel');
      scheduleSnap(axis);
    }
  },{passive:false});

  // Pointer drag shares the same logical coordinates and release physics.
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0||event.target.closest('.log-root,.log-preview'))return;
    if(event.pointerType==='touch'&&state.phase==='waiting'){beginIntro();return;}
    if(state.phase!=='ready')return;
    gesture={id:event.pointerId,x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,
      moved:false,axis:null,branch:overBranchColumn(event.clientX,event.clientY)};
  });
  canvas.addEventListener('pointermove',event=>{
    if(!gesture||gesture.id!==event.pointerId)return;
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
    if(!gesture.moved&&Math.hypot(dx,dy)>=CONFIG.dragThreshold) {
      if(Math.abs(dy)>Math.abs(dx)&&!gesture.branch)return;
      gesture.axis=Math.abs(dy)>Math.abs(dx)?'branch':'rail';gesture.moved=true;
      canvas.setPointerCapture(event.pointerId);canvas.classList.add('is-dragging');clearWheelGesture();
      if(state.rail<0)updateRail(centerNodeIndex(),'drag');
    }
    if(!gesture.moved)return;
    event.preventDefault();
    const amount=(gesture.axis==='branch'?gesture.lastY-event.clientY:gesture.lastX-event.clientX)/S()/CONFIG.dragStep;
    recordInput(amount,gesture.axis,performance.now(),'drag');
    if(gesture.axis==='branch')updateBranch(state.branchProgress+amount,'drag');
    else updateRail(state.rail+amount,'drag');
    gesture.lastX=event.clientX;gesture.lastY=event.clientY;
  });
  function stopGesture(event) {
    if(!gesture||gesture.id!==event.pointerId)return;
    const ended=gesture;gesture=null;
    if(ended.moved) {
      if(performance.now()-navigation.lastInputAt>120 || event.type==='pointercancel')navigation.inputVelocity=0;
      settleAxis(ended.axis,'drag');suppressClickUntil=performance.now()+250;
    }
    if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
    canvas.classList.remove('is-dragging');
  }
  canvas.addEventListener('pointerup',stopGesture);canvas.addEventListener('pointercancel',stopGesture);
  canvas.addEventListener('lostpointercapture',()=>{
    if(gesture&&gesture.moved){const axis=gesture.axis;gesture=null;navigation.inputVelocity=0;settleAxis(axis,'drag');}
    gesture=null;canvas.classList.remove('is-dragging');
  });
  canvas.addEventListener('pointerleave',()=>{clearTimeout(hoverTimer);wheelSession=null;});
  canvas.addEventListener('keydown',event => {
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Escape','Enter',' '].includes(event.key)) return;
    if (event.key === 'Enter' || event.key === ' ') {
      if (event.target !== canvas) return;
      event.preventDefault();
      if (state.phase === 'waiting') beginIntro();
      else if (state.phase === 'ready') { if (state.selected < 0) selectNode(centerNodeIndex(),true,'keyboard'); else openPreview(); }
      return;
    }
    event.preventDefault();
    if (state.phase === 'waiting') { beginIntro(); return; }
    if (state.phase !== 'ready') return;
    clearWheelGesture();
    if (event.key === 'Home') resetLog();
    else if (event.key === 'End') selectNode(nodes.length-1,true,'keyboard');
    else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') selectNode(nextNodeIndex(event.key === 'ArrowRight' ? 1 : -1),true,'keyboard');
    else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      if (state.selected < 0) selectNode(centerNodeIndex(),true,'keyboard');
      else selectBranch(state.branch+(event.key === 'ArrowDown' ? 1 : -1),'keyboard');
    } else if (event.key === 'Escape') {
      if (state.preview) { state.preview = false; renderLog(); } else resetLog();
      canvas.focus({preventScroll:true});
    }
  });
  motionPreference.addEventListener('change', () => {
    // Preserve the explicitly requested intro/page timelines. The system
    // preference still reduces the optional spring navigation/decorative motion.
    if (motionPreference.matches && state.phase === 'ready') runMotion(true);
  });
  renderLog(true);

  // Comments remain reactions: submitting never mutates the Baton Log.
  const commentKey = live ? live.commentKey : 'comments';
  const commentBase = live ? live.commentBase : 43;
  const savedComments = memory.read(commentKey, []);
  let localComments = Array.isArray(savedComments) ? savedComments.filter(x => x && typeof x.text === 'string').slice(-30) : [];
  function renderLocalComments() {
    let host = $('.local-comments');
    if (!host && localComments.length) { host = document.createElement('div'); host.className = 'local-comments'; $('#comments').append(host); }
    if (host) {
      host.replaceChildren();
      for (const item of localComments) {
        const article = document.createElement('article'); article.className = 'comment local-comment';
        const avatar = document.createElement('span'); avatar.className = 'comment-avatar pale';
        const content = document.createElement('div'); const header = document.createElement('header');
        const strong = document.createElement('strong'); strong.textContent = live ? live.commentAuthor : '방문자'; const time = document.createElement('time'); time.textContent = '이 브라우저'; header.append(strong, time);
        const p = document.createElement('p'); p.textContent = item.text; content.append(header, p); article.append(avatar, content); host.append(article);
      }
    }
    $('#comments').classList.toggle('has-new-comments', !!localComments.length);
    $('#comment-count').textContent = String(commentBase + localComments.length); $('#all-comment-count').textContent = String(commentBase + localComments.length);
  }
  $('#comment-form').addEventListener('submit', e => {
    e.preventDefault(); const input = $('#comment-form input'); const text = input.value.trim(); if (!text) { input.focus(); return; }
    localComments.push({ text: text.slice(0,500), date: new Date().toISOString() }); localComments = localComments.slice(-30); memory.write(commentKey, localComments); input.value = ''; renderLocalComments();
    $('#comments').scrollTop = $('#comments').scrollHeight; toast('댓글을 이 브라우저에 추가했어요. 바톤로그에는 노드가 생기지 않아요.');
  });
  $('#all-comments').addEventListener('click', () => toast('원본 SVG에 보이는 댓글과 직접 입력한 댓글만 있어요. 나머지 댓글은 서버 연결이 필요해요.'));
  renderLocalComments();
  const related = live ? live.related : [
    ['같은 일러스트예요',2], ['같은 편집 디자인이에요',4], ['발표 자료가 아직 없어요',3], ['같은 편집 디자인이에요',1], ['파일 구성이 비슷해요',3],
    ['같은 편집 디자인이에요',2], ['발표 자료가 아직 없어요',3], ['파일 구성이 비슷해요',3], ['발표 자료가 아직 없어요',1], ['같은 일러스트예요',4],
  ];
  related.forEach(([caption, progress], i) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'related-card'; button.setAttribute('aria-label', `${caption}. 추천 바톤 ${i + 1} 이미지 보기`);
    const img = new Image(); img.className = 'related-art'; img.src = asset(`assets/related-${i + 1}.svg`); img.alt = ''; img.width = 246; img.height = 246;
    const label = document.createElement('span'); label.className = 'related-caption'; label.textContent = caption;
    const bars = document.createElement('span'); bars.className = 'mini-progress'; bars.setAttribute('aria-hidden', 'true');
    for (let s = 0; s < 4; s++) { const bar = document.createElement('i'); if (s < progress) bar.className = 'done'; bars.append(bar); }
    button.append(img, label, bars); button.addEventListener('click', () => showImages('바톤 미리보기', [{ src: `assets/related-${i + 1}.svg`, alt: caption }])); $('#related-grid').append(button);
  });
  go(location.hash === '#log' ? 'log' : 'detail', { updateHash: false, instant: true });
  // Explicit development hooks for verifying endpoint geometry and integration.
  window.Morogaro = Object.freeze({
    version: '9.0.0',
    config: CONFIG, setView, setTab, selectGallery,
    page: { getState: () => ({view:page.dataset.view, destination:pageDestination, animating:pageAnimating, scrollY:window.scrollY, logTop:0}) },
    log: { dismissTutorial: beginIntro, showTutorial, selectNode, selectBranch, openPreview, reset: resetLog,
      getState: () => ({ ...state }),
      getGeometry: () => visuals.map(v => ({...v.value})),
      getMotion: () => ({mode:navigation.mode,axis:navigation.activeAxis,
        rail:{...navigation.rail},branch:{...navigation.branch},focus:{...navigation.focus},
        descendants:{...navigation.descendants},owner:navigation.owner}),
      getIntroPlan: () => ({totalDuration: introTotalDuration, prelude: introPrelude,
        movementDuration: introMovementDuration, inset: introInset, origin: introLaunchX,
        nodes: introPlan.map(slot => ({...slot}))}) },
  });
})();
