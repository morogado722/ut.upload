/* 사용성 평가용: 새 탭(창)으로 들어오면 지난 기록을 지우고 '파일 올리기'부터 시작해요.
 * 같은 탭 안에서 새로고침할 때는 진행 중인 내용을 그대로 둬요. */
(() => {
  'use strict';
  let alive = false;
  try { alive = sessionStorage.getItem('morogaro-alive') === '1'; sessionStorage.setItem('morogaro-alive', '1'); } catch { /* */ }
  if (alive) return;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (/^morogaro/i.test(k) || k === 'upload-step-one')) localStorage.removeItem(k);
    }
  } catch { /* */ }
  try { ['morogaro-baton-maker', 'morogaro-baton-results'].forEach(n => indexedDB.deleteDatabase(n)); } catch { /* */ }
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
})();
