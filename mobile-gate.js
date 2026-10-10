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
  .mobile-gate{position:fixed;inset:0;z-index:9999;overflow:auto;background:#FAFAFA;font-family:'Spoqa Han Sans Neo',system-ui,sans-serif;color:#262626;text-align:center;word-break:keep-all}
  .mobile-gate>div{min-height:100%;max-width:390px;margin:0 auto;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;padding:calc(env(safe-area-inset-top) + 72px) 24px calc(env(safe-area-inset-bottom) + 40px)}
  .mobile-gate .mg-logo{display:block;width:220px;height:auto;margin:auto 0;padding:56px 0;overflow:visible;cursor:pointer}
  .mg-s1,.mg-s2{fill:none;stroke:#fff;stroke-width:118;stroke-dasharray:1 1;stroke-dashoffset:1}
  .mg-s1{animation:mg-draw .78s cubic-bezier(.55,.05,.35,1) .15s forwards}
  .mg-s2{animation:mg-draw .32s cubic-bezier(.3,0,.2,1) .9s forwards}
  .mg-star{transform-box:fill-box;transform-origin:center;transform:scale(0) rotate(-90deg);animation:mg-star .5s cubic-bezier(.3,1.6,.5,1) 1.2s forwards}
  .mg-l{opacity:0;transform:translateY(90px);animation:mg-rise .34s cubic-bezier(.2,1.4,.4,1) calc(1.45s + var(--i) * .06s) forwards}
  @keyframes mg-draw{to{stroke-dashoffset:0}}
  @keyframes mg-star{to{transform:scale(1) rotate(0)}}
  @keyframes mg-rise{to{opacity:1;transform:none}}
  @media(prefers-reduced-motion:reduce){.mg-s1,.mg-s2,.mg-star,.mg-l{animation-duration:.01s!important;animation-delay:0s!important}}
  .mobile-gate .mg-top,.mobile-gate .mg-body,.mobile-gate .mg-actions{opacity:0;transform:translateY(10px);animation:mg-rise .5s ease 2s forwards}
  .mobile-gate .mg-body,.mobile-gate .mg-actions{animation-delay:2.15s}
  .mobile-gate .mg-top span{display:block;margin-bottom:5px;font-size:12px;color:#00874F}
  .mobile-gate h1{margin:0;font-size:16px;line-height:normal;font-weight:700;color:#262626!important}
  .mobile-gate .mg-body{max-width:302px;font-size:12px;line-height:1.6;color:#626262}
  .mobile-gate .mg-body p{margin:0 0 19px}
  .mobile-gate .mg-body b{font-weight:700;color:#626262}
  .mobile-gate .mg-actions{width:100%;margin-top:52px;display:flex;flex-direction:column;gap:7px}
  .mobile-gate button{width:100%;border:0;background:none;font:inherit;color:#262626;cursor:pointer}
  .mobile-gate .mg-primary{height:52px;border:1px solid #81CEB0;border-radius:38px;font-size:14px;font-weight:700;letter-spacing:.01em;background:radial-gradient(60% 140% at 8% 30%,rgb(226 245 120/.75),transparent 70%),radial-gradient(70% 160% at 98% 60%,rgb(120 250 215/.8),transparent 70%),radial-gradient(60% 120% at 50% 120%,rgb(190 250 200/.6),transparent 70%),#FFF}
  .mobile-gate .mg-secondary{padding:16px;font-size:15px}
  .mobile-gate .mg-url{display:none;margin:2px auto 0;padding:12px 16px;border-radius:12px;background:rgb(38 38 38/6%);font-size:13px;font-weight:700;word-break:break-all;user-select:all;-webkit-user-select:all}
  .mobile-gate .mg-url.is-on{display:block;animation:mg-rise .3s ease forwards}
  .mobile-gate small{display:block;margin-top:8px;font-size:12px;color:#969696}`;
  function mount() {
    const style = document.createElement('style'); style.textContent = css; document.head.append(style);
    const gate = document.createElement('main'); gate.className = 'mobile-gate';
    gate.innerHTML = `<div>
      <div class="mg-top"><span>졸전을 위한 사용성 평가 진행 중...</span><h1>노트북·PC에서 열어주세요... 🙏💻</h1></div>
      <svg class="mg-logo" viewBox="0 0 2413 340" role="img" aria-label="모로가도"><defs><mask id="mgMask" maskUnits="userSpaceOnUse" x="-20" y="-20" width="520" height="380"><path class="mg-s1" d="M43 340V127Q43 44 126 44H210V300L425 50" pathLength="1"/><path class="mg-s2" d="M275 43H433V220" pathLength="1"/></mask></defs><path d="M476.478 0.70813V208.016H390.948V140.918L269.153 296.15L253.137 316.569L252.965 316.792H167.298V87.2663H126.854C104.516 87.2663 86.4269 105.373 86.4269 127.71V316.792H0.70813V126.82C0.70813 124.25 0.77665 121.715 0.930821 119.18C2.69522 89.5788 14.6863 62.736 33.4094 42.1115C56.141 17.0331 88.8594 1.13638 125.295 0.72526C125.809 0.70813 126.323 0.70813 126.837 0.70813H252.965V178.227L253.137 178.021L269.153 157.602L325.151 86.2213H269.153V0.70813H476.478Z" fill="#262626" mask="url(#mgMask)"/><path class="mg-star" d="M426.182 233.371C428.358 228.318 436.974 228.318 439.167 233.371C443.055 242.364 448.503 252.78 455.046 259.323C461.59 265.867 472.005 271.314 480.998 275.203C486.069 277.378 486.069 285.995 480.998 288.187C472.005 292.076 461.59 297.523 455.046 304.067C448.503 310.611 443.055 321.026 439.167 330.019C436.991 335.089 428.375 335.089 426.182 330.019C422.294 321.026 416.846 310.611 410.303 304.067C403.759 297.523 393.344 292.076 384.351 288.187C379.297 286.012 379.297 277.395 384.351 275.203C393.344 271.314 403.759 265.867 410.303 259.323C416.846 252.78 422.294 242.364 426.182 233.371Z" fill="#00F998"/><g fill="#262626"><path class="mg-l" style="--i:0" d="M626.943 76.1129C555.785 76.1129 498.108 133.79 498.108 204.948C498.108 276.106 555.785 333.783 626.943 333.783C698.102 333.783 755.779 276.106 755.779 204.948C755.779 133.79 698.102 76.1129 626.943 76.1129ZM626.943 247.174C604.126 247.174 585.626 228.69 585.626 205.873C585.626 183.056 604.126 164.555 626.943 164.555C649.761 164.555 668.244 183.056 668.244 205.873C668.244 228.69 649.761 247.174 626.943 247.174Z"/><path class="mg-l" style="--i:1" d="M1024.35 308.398L963.107 237.925C999.748 216.427 1024.35 176.617 1024.35 131.051C1024.35 98.6067 1011.88 69.0745 991.44 47.011C968.828 22.5493 936.47 7.23505 900.531 7.23505C886.587 7.23505 873.174 9.5476 860.669 13.7959C840.935 20.4937 823.446 32.0394 809.622 47.011C789.186 69.0745 776.715 98.6067 776.715 131.051V316.672H860.669V248.049L860.995 248.426L920.299 316.672H1031.52L1024.35 308.398ZM905.242 171.341C903.7 171.529 902.124 171.632 900.531 171.632C878.604 171.632 860.841 153.851 860.841 131.925C860.841 128.413 861.303 125.004 862.16 121.767C866.648 104.756 882.116 92.2344 900.531 92.2344C922.457 92.2344 940.238 109.998 940.238 131.925C940.238 152.258 924.958 169.028 905.242 171.341Z"/><path class="mg-l" style="--i:2" d="M1162.55 76.1129C1114.25 76.1129 1072.14 102.716 1050.09 142.046C1039.66 160.633 1033.72 182.097 1033.72 204.948C1033.72 227.8 1039.68 249.263 1050.09 267.85C1072.14 307.197 1114.25 333.783 1162.55 333.783C1233.73 333.783 1291.4 276.106 1291.4 204.948C1291.4 133.79 1233.73 76.1129 1162.55 76.1129ZM1162.55 247.174C1139.75 247.174 1121.25 228.69 1121.25 205.873C1121.25 183.056 1139.75 164.555 1162.55 164.555C1185.35 164.555 1203.87 183.056 1203.87 205.873C1203.87 228.69 1185.37 247.174 1162.55 247.174Z"/><path class="mg-l" style="--i:3" d="M1602.25 130.194V316.672H1312.63V130.194C1312.63 127.676 1312.7 125.158 1312.85 122.674C1314.38 97.2704 1323.56 73.9392 1338.12 54.942C1340.21 52.2012 1342.42 49.5632 1344.73 47.0108C1367.38 22.0523 1400.08 6.3783 1436.44 6.3783H1560.26V91.3605H1436.44C1414.52 91.3605 1396.75 109.141 1396.75 131.051V232.718H1518.29V130.194H1602.25Z"/><path class="mg-l" style="--i:4" d="M1748.98 82.7457C1680.6 82.7457 1625.16 138.179 1625.16 206.562C1625.16 274.945 1680.6 330.378 1748.98 330.378C1762.92 330.378 1776.34 328.065 1788.84 323.817V330.378H1872.8V206.562C1872.8 138.179 1817.36 82.7457 1748.98 82.7457ZM1748.98 247.126C1727.05 247.126 1709.29 229.362 1709.29 207.435C1709.29 185.509 1727.05 167.728 1748.98 167.728C1770.91 167.728 1788.67 185.509 1788.67 207.435C1788.67 229.362 1770.91 247.126 1748.98 247.126Z"/><path class="mg-l" style="--i:5" d="M2054.96 23.5079V91.8568C2042.46 87.6086 2029.06 85.296 2015.12 85.296C1968.68 85.296 1928.22 110.854 1907.03 148.66C1897.01 166.527 1891.28 187.151 1891.28 209.112C1891.28 231.073 1897.01 251.697 1907.03 269.581C1928.22 307.387 1968.68 332.945 2015.12 332.945C2029.06 332.945 2042.46 330.633 2054.96 326.384C2103.8 309.802 2138.93 263.568 2138.93 209.112V23.5079H2054.96ZM2015.12 247.946C1993.19 247.946 1975.41 230.182 1975.41 208.256C1975.41 186.329 1993.19 168.548 2015.12 168.548C2037.04 168.548 2054.81 186.329 2054.81 208.256C2054.81 230.182 2037.03 247.946 2015.12 247.946Z"/><path class="mg-l" style="--i:6" d="M2282.86 75.9767C2234.55 75.9767 2192.44 102.58 2170.4 141.91C2159.96 160.496 2154.02 181.96 2154.02 204.812C2154.02 227.663 2159.98 249.127 2170.4 267.713C2192.44 307.061 2234.55 333.647 2282.86 333.647C2354.03 333.647 2411.71 275.97 2411.71 204.812C2411.71 133.654 2354.03 75.9767 2282.86 75.9767ZM2282.86 247.037C2260.06 247.037 2241.56 228.554 2241.56 205.737C2241.56 182.92 2260.06 164.419 2282.86 164.419C2305.66 164.419 2324.17 182.92 2324.17 205.737C2324.17 228.554 2305.67 247.037 2282.86 247.037Z"/></g></svg>
      <div class="mg-body"><p><b>모로가도</b>는<br>창작자들이 서로의 미완성 창작물을 주고 받음으로써,<br>노트북에서 죽어가던 아까운 파일을 활용할 수 있는<br><b>릴레이 창작 플랫폼</b>이에요.</p><p>현재 작업물 업로드 화면의 <b>사용성 평가</b>를 진행하고 있어요! 노트북으로 접속해 바톤을 하나 만들어 보시면, 그 과정이 그대로 평가 기록으로 남고, 서비스 완성을 위한 귀중한 데이터가 된답니다... 이상한 데에는 절대 쓰지 않아요!</p><p>끝까지 완료하신 분들께는 구글 폼을 작성해 주시면<br><b>소정의 선물</b>을 드려요 ...🎁<br>저희 졸업 전시를 위해 참여해 주시면 정말 감사하겠습니다!</p></div>
      <div class="mg-actions"><button class="mg-primary" type="button" data-share>카톡으로 나에게 링크 보내기...🏃</button>
      <button class="mg-secondary" type="button" data-copy>주소 복사하기</button>
      <span class="mg-url" data-url>${url.replace(/^https?:\/\//, '')}</span>
      <small data-msg></small></div></div>`;
    document.body.append(gate);
    const msg = gate.querySelector('[data-msg]');
    // 로고를 누르면 모션을 다시 재생해요.
    const logo = gate.querySelector('.mg-logo');
    logo.addEventListener('click', () => { const clone = logo.cloneNode(true); logo.replaceWith(clone); clone.addEventListener('click', () => location.reload()); });
    gate.querySelector('[data-copy]').addEventListener('click', async () => {
      gate.querySelector('[data-url]').classList.add('is-on');
      try { await navigator.clipboard.writeText(url); msg.textContent = '복사했어요! 노트북 주소창에 붙여넣어 열어보세요.'; }
      catch { msg.textContent = '위 주소를 길게 눌러 복사해 주세요.'; }
    });
    // 공유 시트를 열고, 안 되면(카톡 인앱 브라우저 등) 주소를 복사한 뒤 카카오톡 앱을 열어 붙여넣게 해요.
    gate.querySelector('[data-share]').addEventListener('click', async () => {
      const inKakao = /KAKAOTALK/i.test(navigator.userAgent);
      if (navigator.share && !inKakao) {
        try { await navigator.share({ title: '모로가도 사용성 평가', text: '노트북에서 열어보기 👉 ' + url }); return; }
        catch (e) { if (e && e.name === 'AbortError') return; }
      }
      gate.querySelector('[data-url]').classList.add('is-on');
      let copied = false;
      try { await navigator.clipboard.writeText(url); copied = true; } catch { /* 복사 막힘 */ }
      msg.textContent = copied ? '주소를 복사했어요! 카카오톡 ‘나와의 채팅’에 붙여넣어 주세요.' : '위 주소를 길게 눌러 복사한 뒤 카카오톡 ‘나와의 채팅’에 붙여넣어 주세요.';
      if (copied && !inKakao) setTimeout(() => { location.href = 'kakaotalk://'; }, 600);
    });
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
  window.MOROGARO_MOBILE_GATE = true;
})();
