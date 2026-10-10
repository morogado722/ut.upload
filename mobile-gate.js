/* 휴대폰·태블릿에서는 이용을 막고, 노트북·PC로 열도록 안내해요.
 * 판단: 터치가 주 입력이고(손가락) 화면이 좁은 기기. 노트북의 좁은 창은 막지 않아요. */
(() => {
  'use strict';
  const coarse = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile|SamsungBrowser|KAKAOTALK/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!(coarse || mobileUA) || new URLSearchParams(location.search).has('desktop')) return;
  document.documentElement.classList.add('is-mobile-gate');
  const url = location.origin + location.pathname;
  const css = `html.is-mobile-gate body > *:not(.mobile-gate){display:none!important}
  .mobile-gate{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:32px 24px;background:#FAFAFA;font-family:'Spoqa Han Sans Neo',system-ui,sans-serif;color:#262626;text-align:center}
  .mobile-gate>div{max-width:340px}
  .mobile-gate .mg-icon{font-size:44px;line-height:1;margin-bottom:20px}
  .mobile-gate h1{margin:0 0 12px;font-size:22px;line-height:1.4;font-weight:700;word-break:keep-all;color:#262626!important}
  .mobile-gate p{margin:0 0 24px;font-size:15px;line-height:1.6;color:#626262;word-break:keep-all}
  .mobile-gate .mg-url{display:block;margin:0 0 12px;padding:14px 16px;border-radius:12px;background:rgb(38 38 38/6%);font-size:14px;font-weight:700;word-break:break-all;user-select:all}
  .mobile-gate button{width:100%;margin-top:8px;padding:14px;border:0;border-radius:12px;font:700 15px/1 inherit;cursor:pointer}
  .mobile-gate .mg-primary{background:#00F998;color:#0E2A18}
  .mobile-gate .mg-secondary{background:rgb(38 38 38/8%);color:#262626}
  .mobile-gate small{display:block;margin-top:14px;font-size:12px;color:#969696}`;
  function mount() {
    const style = document.createElement('style'); style.textContent = css; document.head.append(style);
    const gate = document.createElement('main'); gate.className = 'mobile-gate';
    gate.innerHTML = `<div><div class="mg-icon" aria-hidden="true">💻</div>
      <h1>모로가도 바톤 메이커는<br>노트북·PC에서 열어주세요</h1>
      <p>작업 파일을 올리고 정리하는 화면이라<br>큰 화면에서만 이용할 수 있어요.<br>아래 주소를 노트북으로 보내 열어주세요.</p>
      <span class="mg-url">${url.replace(/^https?:\/\//, '')}</span>
      <button class="mg-primary" type="button" data-share>나에게 링크 보내기</button>
      <button class="mg-secondary" type="button" data-copy>주소 복사하기</button>
      <small data-msg></small></div>`;
    document.body.append(gate);
    const msg = gate.querySelector('[data-msg]');
    gate.querySelector('[data-copy]').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(url); msg.textContent = '복사했어요. 카카오톡 ‘나와의 채팅’에 붙여넣어 노트북에서 열어보세요.'; }
      catch { msg.textContent = '주소를 길게 눌러 복사해 주세요.'; }
    });
    gate.querySelector('[data-share]').addEventListener('click', async () => {
      if (navigator.share) { try { await navigator.share({ title: '모로가도 바톤 메이커', text: '노트북에서 열어보기', url }); return; } catch { return; } }
      gate.querySelector('[data-copy]').click();
    });
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
  window.MOROGARO_MOBILE_GATE = true;
})();
