/* 큰 파일 안내: 50MB 넘는 파일 · 합계 100MB · 20개 초과면 업로드 칸 아래에 바로 알려줘요. */
(() => {
  'use strict';
  const MAX_FILE = 50 * 1024 * 1024, MAX_TOTAL = 100 * 1024 * 1024, MAX_COUNT = 20;
  const mb = n => (n / 1024 / 1024).toFixed(n > 1024 * 1024 * 1024 ? 0 : 1) + 'MB';
  function check() {
    const box = document.getElementById('size-warning'); if (!box) return;
    const files = window.MorogaroMaker?.getState?.().files || [];
    const big = files.filter(f => f.size > MAX_FILE);
    const readable = files.filter(f => f.size <= MAX_FILE);
    const total = readable.reduce((s, f) => s + f.size, 0);
    const msgs = [];
    if (big.length) msgs.push(`<strong>${big.map(f => f.name).slice(0, 3).join(', ')}${big.length > 3 ? ` 외 ${big.length - 3}개` : ''}</strong>${big.length === 1 ? `(${mb(big[0].size)})` : ''}는 50MB가 넘어서 내용을 읽을 수 없어요.`);
    if (total > MAX_TOTAL) msgs.push(`읽을 수 있는 파일이 합계 ${mb(total)}로 100MB를 넘어, 뒤쪽 파일은 내용을 읽지 못해요.`);
    if (files.length > MAX_COUNT) msgs.push(`파일이 ${files.length}개예요. 앞의 20개까지만 내용을 읽어요.`);
    if (!msgs.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.innerHTML = `<span class="size-warning-icon" aria-hidden="true">!</span><span>${msgs.join(' ')}<br><em>3D · 렌더 원본처럼 큰 파일은 빼고, PNG · JPG · PDF로 내보낸 파일을 함께 올려주세요. 그래야 AI가 내용을 채워줄 수 있어요.</em></span>`;
    box.hidden = false;
  }
  document.addEventListener('morogaro:attachments-changed', check);
  document.addEventListener('DOMContentLoaded', check);
})();
