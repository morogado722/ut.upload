/* 업로드 진행률: 파일 50% → 분석 · 단계마다 조금씩 → 바톤 노트와 아이디어까지 채우면 100% */
(() => {
  'use strict';
  let step = 0, analyzed = false;
  const noteFilled = () => {
    const n = document.getElementById('baton-note')?.value.trim();
    const ideas = [...document.querySelectorAll('.idea-input')].some(i => i.value.trim());
    return !!n && ideas;
  };
  function update() {
    let p = 50;
    if (analyzed) p = 60;
    if (step >= 2) p = Math.max(p, 60 + (step - 2) * 6);   // 2단계 60 · 3단계 66 · 4단계 72 · 5단계 78 · 6단계 84
    if (step >= 6 && noteFilled()) p = 100;
    if (window.MorogaroProgressBoost !== p) { window.MorogaroProgressBoost = p; document.dispatchEvent(new CustomEvent('morogaro:progress-refresh')); }
  }
  document.addEventListener('morogaro:analysis-ready', () => { analyzed = true; update(); });
  document.addEventListener('morogaro:active-step', e => { const s = Number(e.detail?.step) || 0; if (s > step) step = s; update(); });
  document.addEventListener('input', e => { if (e.target.closest?.('#baton-note, .idea-input')) update(); });
  // AI가 노트 · 아이디어를 채운 뒤에도 반영되게 가끔 확인해요.
  setInterval(() => { if (step >= 6) update(); }, 1500);
  document.addEventListener('morogaro:attachments-changed', () => { if (!window.MorogaroMaker?.getState?.().files.length) { step = 0; analyzed = false; window.MorogaroProgressBoost = 0; } });
})();
