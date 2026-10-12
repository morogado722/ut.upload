/* 파일 정보 페이지 ↔ 바톤 노트 페이지
 *
 * 업로드 화면(2~6단계)을 두 페이지로 나눠요. 한 번에 한 페이지만 문서에 있어서,
 * 각 페이지 끝에서 스크롤이 '탁' 멈추고 아래가 보이지 않아요.
 *   - 확인 페이지(check): 소스 확인 ~ 파일 정보(2~5단계). 파일 정보 카드에서 페이지가 끝나요.
 *   - 노트 페이지(note): '확인은 끝났어요 :)' + 바톤 노트(6단계) + 하단 버튼.
 * 넘어가기
 *   - 확인 페이지 맨 아래에서 0.5초(HOLD_END) 머문 뒤, 새로 아래로 스크롤하면 노트 페이지로.
 *     확인 페이지가 위로 슬라이드 아웃 → '확인은 끝났어요' 문구, 이어서 노트 카드가 아래에서 슬라이드 인.
 *   - 노트 페이지 맨 위에서 위로 스크롤하면 확인 페이지 맨 아래로.
 *     노트가 아래로 슬라이드 아웃 → 확인 페이지가 위에서 슬라이드 인.
 *   - 6단계 버튼 · '다음으로'도 같은 전환을 써요. 동작 줄이기 설정이면 바로 바뀌어요.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const content = $('review-content');
  if (!content || !$('review-note-section')) return;

  const OUT = 420, IN_DOWN = 1300, IN_UP = 900, GUARD = 300;
  const QUIET = 450, HOLD = 450, HOLD_END = 500;   // 파일 정보 끝: 0.5초 멈춘 뒤 안내가 뜨고, 그때부터 넘어갈 수 있어요
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let animating = false, timer = 0, guardUntil = 0, guardDir = 0;
  let holdUntil = 0, lastInput = -Infinity, lastAbs = 0, fresh = true, edgeArmed = false;
  let touchY = null, touchUsed = false;

  const pageName = () => root.dataset.makerPage || 'check';
  const maxScroll = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const active = () => !content.hidden && !document.querySelector('.workspace')?.hidden
    && $('baton-detail')?.hidden !== false && !document.querySelector('dialog[open]');

  /* ── '다음이 있어요' 안내 ──
   * 파일 정보 끝에서 0.5초 멈추면 카드 아래 여백에 안내가 스윽 떠올라요. 그때부터 스크롤하면 넘어가요.
   * 넘어갈 수 없는 동안 스크롤하면 페이지가 살짝 밀렸다 돌아와요. */
  // 파일 정보 카드 아래 여백 + 그 안에 뜨는 '아래로 스크롤' 안내 (확인 페이지에만 있어요)
  const hint = document.createElement('div');
  hint.className = 'check-next';
  hint.setAttribute('role', 'status');
  hint.innerHTML = '<p class="check-next-hint"><span>아래로 스크롤해서 바톤노트 쓰기</span><i aria-hidden="true"></i></p>';
  $('review-file-section').after(hint);
  let hintTimer = 0, tugAt = 0;
  function showHint() {
    clearTimeout(hintTimer);
    if (!active() || animating || pageName() !== 'check' || window.scrollY < maxScroll() - 2) return;
    const wait = holdUntil - performance.now();
    if (wait > 0) { hintTimer = setTimeout(showHint, wait + 20); return; }
    hint.classList.add('is-shown');
  }
  function hideHint() { clearTimeout(hintTimer); hint.classList.remove('is-shown'); }
  function tug() {
    const now = performance.now();
    if (now - tugAt < 520 || reduced.matches) return;
    tugAt = now;
    content.classList.remove('is-tug'); void content.offsetWidth; content.classList.add('is-tug');
  }
  content.addEventListener('animationend', e => { if (e.animationName === 'maker-tug') content.classList.remove('is-tug'); });

  function setPage(name) {
    root.dataset.makerPage = name;
    window.dispatchEvent(new Event('scroll'));
  }
  function go(target, done) {
    if (animating || pageName() === target) { done?.(); return; }
    const down = target === 'note';
    if (reduced.matches) {
      setPage(target); window.scrollTo({top: down ? 0 : maxScroll(), behavior: 'instant'}); settle(target); done?.(); return;
    }
    animating = true; hideHint();
    content.dataset.snap = down ? 'out-down' : 'out-up';
    clearTimeout(timer);
    timer = setTimeout(() => {
      setPage(target);
      window.scrollTo({top: down ? 0 : maxScroll(), behavior: 'instant'});
      content.dataset.snap = down ? 'down' : 'up';
      timer = setTimeout(() => { settle(target); done?.(); }, down ? IN_DOWN : IN_UP);
    }, OUT);
  }
  function settle(target) {
    animating = false;
    const now = performance.now();
    guardUntil = now + GUARD; guardDir = target === 'note' ? 1 : -1;
    holdUntil = now + HOLD; fresh = false; edgeArmed = true;
    requestAnimationFrame(() => { delete content.dataset.snap; });
    window.dispatchEvent(new Event('scroll'));
  }

  // delta > 0: 아래로. 처리했으면 true를 돌려 기본 스크롤을 막아요.
  function handle(delta) {
    if (!active() || !delta) return false;
    if (animating) return true;
    const now = performance.now(), y = window.scrollY, max = maxScroll();
    // 같은 손짓의 관성(트랙패드 관성 꼬리 포함)은 손짓이 완전히 끝날 때까지 삼켜요.
    if (guardDir && Math.sign(delta) === guardDir) { if (!fresh || now < guardUntil) return true; }
    guardDir = 0;
    const waiting = () => now < holdUntil || !fresh;
    if (pageName() === 'check' && delta > 0) {
      if (y < max - 2) {
        if (y + delta > max) { window.scrollTo({top: max, behavior: 'instant'}); holdUntil = now + HOLD_END; edgeArmed = true; showHint(); return true; }
        return false;
      }
      if (waiting()) { if (fresh) tug(); return true; }         // 파일 정보 끝에서 멈춘 채로(0.5초)
      go('note'); return true;
    }
    if (pageName() === 'note' && delta < 0) {
      if (y > 2) {
        if (y + delta < 0) { window.scrollTo({top: 0, behavior: 'instant'}); holdUntil = now + HOLD; edgeArmed = true; return true; }
        return false;
      }
      if (waiting()) return true;
      go('check'); return true;
    }
    return false;
  }

  /* 새 손짓인지 판단해요. 세게 밀면 트랙패드 관성이 1~3초 이어지고, 끝에선 띄엄띄엄 와요.
   * 그 꼬리가 '새 스크롤'로 읽히지 않도록, 휠 입력이 QUIET 동안 완전히 멈췄거나
   * 줄어들던 값이 갑자기 크게 다시 커졌을 때(손가락을 새로 댐)만 새 손짓으로 봐요. */
  function isFresh(now, abs) {
    const fresh = now - lastInput > QUIET || (abs >= 30 && abs >= lastAbs * 3);
    lastInput = now; lastAbs = abs;
    return fresh;
  }

  // 보통 스크롤로 끝에 정확히 닿은 경우에도 멈춤을 시작해요.
  window.addEventListener('scroll', () => {
    if (animating || content.hidden) return;
    const atEdge = pageName() === 'check' ? window.scrollY >= maxScroll() - 2 : window.scrollY <= 2;
    if (atEdge && !edgeArmed) { edgeArmed = true; holdUntil = Math.max(holdUntil, performance.now() + (pageName() === 'check' ? HOLD_END : HOLD)); }
    else if (!atEdge) edgeArmed = false;
    if (atEdge && pageName() === 'check') showHint(); else hideHint();
  }, {passive: true});
  // 글 상자처럼 안에서 스크롤되는 곳이면 그 안에서만 움직이고, 페이지 넘김은 하지 않아요.
  function innerScroller(target, dy) {
    for (let el = target; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      if (el.scrollHeight <= el.clientHeight + 1) continue;
      const oy = getComputedStyle(el).overflowY;
      if (!(el.tagName === 'TEXTAREA' || oy === 'auto' || oy === 'scroll')) continue;
      return el;
    }
    return null;
  }
  window.addEventListener('wheel', event => {
    if (event.ctrlKey || event.metaKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    if (innerScroller(event.target, event.deltaY)) return;
    const unit = event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? window.innerHeight : 1;
    const abs = Math.abs(event.deltaY * unit), now = performance.now();
    fresh = isFresh(now, abs);
    if (handle(event.deltaY * unit)) event.preventDefault();
  }, {passive: false});
  window.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    const keys = {ArrowDown: 48, ArrowUp: -48, PageDown: window.innerHeight * .9, PageUp: -window.innerHeight * .9, ' ': (event.shiftKey ? -1 : 1) * window.innerHeight * .9};
    if (!(event.key in keys)) return;
    fresh = !event.repeat;
    if (handle(keys[event.key])) event.preventDefault();
  });
  window.addEventListener('touchstart', event => { if (innerScroller(event.target, 0)) { touchY = null; return; } touchY = event.touches[0]?.clientY ?? null; touchUsed = false; fresh = true; }, {passive: true});
  window.addEventListener('touchmove', event => {
    if (touchY === null) return;
    if (touchUsed || animating) { if (event.cancelable) event.preventDefault(); return; }
    const y = event.touches[0].clientY, delta = touchY - y; touchY = y;
    if (handle(delta)) { touchUsed = true; fresh = false; if (event.cancelable) event.preventDefault(); }
  }, {passive: false});
  window.addEventListener('touchend', () => { touchY = null; }, {passive: true});

  setPage('check');
  window.MorogaroNoteSnap = Object.freeze({
    page: pageName,
    isAnimating: () => animating,
    // 6단계 버튼 · '다음으로': 노트 페이지로. 이미 노트면 false.
    toNote() { if (!active() || pageName() === 'note') return false; go('note'); return true; },
    // 2~5단계 버튼: 확인 페이지로 돌아간 뒤 done()을 불러요.
    toCheck(done) { if (pageName() === 'check') { done?.(); return; } go('check', done); },
    // 업로드 화면에 새로 들어올 때는 확인 페이지부터.
    reset() { clearTimeout(timer); hideHint(); animating = false; delete content.dataset.snap; setPage('check'); },
  });
})();
