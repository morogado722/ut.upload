/* v12: shared six-step navigation for the upload and editable review screens.
 * Review sections stay on the existing page. No new AI call, edit, progress
 * allocation or publication is caused by scrolling. Step 6 is not implemented.
 */
(() => {
  'use strict';
  const labels = Object.freeze(['파일 올리기', '소스 확인', '썸네일 설정', '프로젝트 정보', '파일 정보', '바톤 노트 작성']);
  const anchors = Object.freeze({2: 'review-sources-section', 3: 'review-thumbnails-section', 4: 'review-project-section', 5: 'review-file-section', 6: 'review-note-section'});
  const card = document.querySelector('.step-card');
  const summary = document.getElementById('step-summary');
  const buttons = [...document.querySelectorAll('.step-button[data-step]')];
  if (!card || !summary || buttons.length !== labels.length) return;
  const narrow = window.matchMedia('(max-width: 1023px)');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let page = 1, active = 1, frame = 0, target = null;

  function mark(step) {
    active = step;
    document.dispatchEvent(new CustomEvent('morogaro:active-step',{detail:{step}}));
    card.dataset.currentStep = String(step);
    for (const button of buttons) {
      const isCurrent = Number(button.dataset.step) === step;
      const item = button.closest('.step');
      item.classList.toggle('is-current', isCurrent);
      item.removeAttribute('aria-current');
      if (isCurrent) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    }
    summary.querySelector('.step-summary-count').textContent = `${step} / ${labels.length}`;
    summary.querySelector('strong').textContent = labels[step - 1];
    summary.setAttribute('aria-label', `${labels.length}단계 중 ${step}단계, ${labels[step - 1]}. 전체 단계 ${summary.getAttribute('aria-expanded') === 'true' ? '접기' : '보기'}`);
  }

  function syncAvailability() {
    const state = window.MorogaroMaker?.getState();
    const hasMaterials = Boolean(state && (state.files.length || state.links.length));
    for (const button of buttons) {
      const step = Number(button.dataset.step);
      const disabled = step > 1 && !hasMaterials;
      if (disabled) {
        button.setAttribute('aria-disabled', 'true');
        button.title = '파일이나 링크를 먼저 올려주세요.';
      } else {
        button.removeAttribute('aria-disabled');
        button.removeAttribute('title');
      }
    }
  }

  function collapse() {
    card.classList.remove('steps-expanded');
    summary.setAttribute('aria-expanded', 'false');
    mark(active);
  }

  function updateFromScroll() {
    frame = 0;
    if (page !== 2 || document.querySelector('.workspace').hidden || document.querySelector('dialog[open]')) return;
    // Do not highlight intermediate sections while a click scrolls to its target.
    if (target) {
      if (Math.abs(window.scrollY - target.y) < 2 || performance.now() >= target.until) target = null;
      else return;
    }
    // 노트 페이지에선 항상 6단계, 확인 페이지에선 2~5단계만 봐요.
    if (document.documentElement.dataset.makerPage === 'note') { if (active !== 6) mark(6); return; }
    const readingLine = (narrow.matches ? 64 : 76) + 48;
    let step = 2;
    for (const [number, id] of Object.entries(anchors)) {
      if (Number(number) === 6) continue;
      // 6단계는 노트 카드 위의 전환 문구부터 시작해요.
      const node = (Number(number) === 6 && document.querySelector('#review-content > .note-transition')) || document.getElementById(id);
      if (node && node.getBoundingClientRect().top <= Math.max(readingLine + 24, window.innerHeight * 0.35)) step = Number(number);
    }
    // A short final panel cannot always reach the reading line. At the end
    // of the document it is nevertheless the section the user is viewing.
    const bottom = document.documentElement.scrollHeight - window.innerHeight;
    if (bottom > 0 && bottom - window.scrollY <= 2) step = 5;
    if (step !== active) mark(step);
  }

  function schedule() { if (!frame) frame = requestAnimationFrame(updateFromScroll); }

  function setPage(nextPage) {
    page = nextPage === 2 ? 2 : 1;
    target = null;
    window.MorogaroNoteSnap?.reset();
    collapse();
    mark(page === 2 ? 2 : 1);
    syncAvailability();
  }

  function jumpTo(step) {
    step = Number(step);
    if (page !== 2 || !anchors[step]) return false;
    // 파일 정보 → 바톤 노트는 스크롤 전환(note-snap.js)과 같은 1.5초 움직임으로 가요.
    // 노트 페이지에서 2~5단계를 누르면 확인 페이지로 돌아간 다음 그 섹션으로 가요.
    if (step !== 6 && window.MorogaroNoteSnap?.page() === 'note') { collapse(); mark(step); window.MorogaroNoteSnap.toCheck(() => jumpTo(step)); return true; }
    if (step === 6 && window.MorogaroNoteSnap?.page() === 'note') { collapse(); mark(6); window.scrollTo({top: 0, behavior: reduced.matches ? 'instant' : 'smooth'}); return true; }
    if (step === 6 && window.MorogaroNoteSnap?.toNote()) { collapse(); mark(6); target = {y: Infinity, until: performance.now() + 1700}; return true; }
    const section = document.getElementById(anchors[step]);
    if (!section || section.closest('[hidden]')) return false;
    collapse();
    // A target below the top will have the compact header, even if currently open.
    const headerGap = (narrow.matches ? 64 : 76) + 24;
    const maximum = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const y = Math.min(maximum, Math.max(0, window.scrollY + section.getBoundingClientRect().top - headerGap));
    target = { y, until: performance.now() + 1800 };
    mark(step);
    const heading = section.querySelector('h2');
    if (heading) { heading.tabIndex = -1; heading.focus({preventScroll: true}); }
    window.scrollTo({top: y, behavior: reduced.matches ? 'instant' : 'smooth'});
    return true;
  }

  summary.addEventListener('click', () => { mark(active); });
  document.addEventListener('morogaro:attachments-changed', syncAvailability);
  document.addEventListener('morogaro:ready', syncAvailability);
  window.addEventListener('scroll', schedule, {passive: true});
  window.addEventListener('resize', schedule, {passive: true});
  // Real wheel/touch input can interrupt a pending navigation.
  window.addEventListener('wheel', () => { target = null; schedule(); }, {passive: true});
  window.addEventListener('touchstart', () => { target = null; }, {passive: true});
  window.addEventListener('keydown', event => {
    if (['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown'].includes(event.key)) target = null;
  });
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(schedule);
    for (const id of Object.values(anchors)) {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    }
  }
  window.MorogaroStepper = Object.freeze({labels, setPage, jumpTo, collapse, current: () => active});
  setPage(1);
})();
