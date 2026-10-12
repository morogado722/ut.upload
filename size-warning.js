/* 큰 파일 안내: 50MB 넘는 파일 · 합계 100MB · 20개 초과면 업로드 칸 아래에 바로 알려줘요. */
(() => {
  'use strict';
  const MAX_FILE = 50 * 1024 * 1024, MAX_DESIGN = 150 * 1024 * 1024, MAX_TOTAL = 200 * 1024 * 1024, MAX_COUNT = 20;
  const limit = f => /\.(ai|psd|psb)$/i.test(f.name) ? MAX_DESIGN : MAX_FILE;
  const mb = n => (n / 1024 / 1024).toFixed(n > 1024 * 1024 * 1024 ? 0 : 1) + 'MB';
  function check() {
    const box = document.getElementById('size-warning'); if (!box) return;
    const files = window.MorogaroMaker?.getState?.().files || [];
    const big = files.filter(f => f.size > limit(f));
    const readable = files.filter(f => f.size <= limit(f));
    const total = readable.reduce((s, f) => s + f.size, 0);
    const msgs = [];
    const short = n => n.length > 24 ? n.slice(0, 22) + '…' : n;
    if (big.length === 1) {
      const f = big[0], pdf = /\.pdf$/i.test(f.name);
      msgs.push(pdf
        ? `‘${short(f.name)}’은 ${mb(f.size)}라 내용을 읽지 못했어요. 50MB 이하로 줄이거나, 주요 페이지만 이미지로 올려주세요.`
        : `‘${short(f.name)}’은 ${mb(f.size)}라 내용을 읽지 못했어요. 작업 화면을 PNG나 JPG로 캡처해 같이 올려주세요.`);
    } else if (big.length > 1) {
      msgs.push(`용량이 큰 파일 ${big.length}개는 내용을 읽지 못했어요. 작업 화면을 PNG·JPG·PDF로 같이 올려주세요.`);
    }
    if (total > MAX_TOTAL) msgs.push(`전체 용량이 200MB를 넘어서 뒤쪽 파일은 읽지 못해요.`);
    if (files.length > MAX_COUNT) msgs.push(`파일은 20개까지만 읽어요.`);
    if (!msgs.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.innerHTML = `<span class="size-warning-icon" aria-hidden="true">!</span><span>${msgs.join(' ')}</span>`;
    box.hidden = false;
  }
  document.addEventListener('morogaro:attachments-changed', check);
  document.addEventListener('DOMContentLoaded', check);
})();
