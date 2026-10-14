/* 휴대폰·태블릿에서는 이용을 막고, 노트북·PC로 열도록 안내해요.
 * 판단: 터치가 주 입력이고(손가락) 화면이 좁은 기기. 노트북의 좁은 창은 막지 않아요. */
(() => {
  'use strict';
  const coarse = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile|SamsungBrowser|KAKAOTALK/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!(coarse || mobileUA) || new URLSearchParams(location.search).has('desktop')) return;
  // 카톡 안 브라우저면 들어오자마자 기본 브라우저(Safari·크롬)로 넘겨요. 카톡 안에선 공유·복사가 막혀 있어요.
  let seen = false; try { seen = !!sessionStorage.getItem('mg-ext'); } catch { /* */ }
  if (/KAKAOTALK/i.test(navigator.userAgent) && !seen) {
    try { sessionStorage.setItem('mg-ext', '1'); } catch { /* */ }
    location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(location.href);
  }
  document.documentElement.classList.add('is-mobile-gate');
  // 모바일에선 무거운 바톤 메이커를 아예 불러오지 않아요(불러오는 동안 버튼이 안 눌리던 문제). 나머지 HTML 읽기를 여기서 멈춰요.
  if (document.readyState === 'loading') { try { document.write('<plaintext style="display:none">'); } catch { /* */ } }
  const url = location.origin + location.pathname;
  const css = `html.is-mobile-gate body > *:not(.mobile-gate){display:none!important}
  .mobile-gate{position:fixed;inset:0;z-index:9999;overflow:auto;background:#FAFAFA;font-family:'Spoqa Han Sans Neo',system-ui,sans-serif;color:#262626;text-align:center;word-break:keep-all}
  .mobile-gate>div{min-height:100%;max-width:390px;margin:0 auto;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;padding:calc(env(safe-area-inset-top) + clamp(40px, 13.6vh, 115px)) 25px calc(env(safe-area-inset-bottom) + 40px)}
  .mobile-gate .mg-logo{display:block;width:220px;height:auto;margin:0 0 clamp(36px, 8.9vh, 75px);overflow:visible;cursor:pointer}
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
  .mobile-gate .mg-top{position:relative;z-index:2;width:100%;max-width:340px;text-align:left}
  .mobile-gate h1{margin:0 0 32px;font-size:24px;line-height:1.3;font-weight:700;color:#262626!important;letter-spacing:-.01em}
  .mobile-gate .mg-seed{position:absolute;right:-5px;top:-8px;width:92px;height:auto;pointer-events:none;z-index:2;transform-origin:50% 100%;animation:mg-sway 3.2s ease-in-out 2.6s infinite}
  @keyframes mg-sway{0%,100%{transform:rotate(0)}50%{transform:rotate(-4deg)}}
  .mobile-gate .mg-body{position:relative;width:100%;max-width:340px;box-sizing:border-box;padding:18px 18px 22px;border-radius:12px;background:#EEE;text-align:left;font-size:12px;line-height:1.6;color:#262626}
  .mobile-gate .mg-q{display:flex;align-items:center;gap:7px;margin:0 0 14px;font-size:16px;font-weight:700;line-height:1.4}
  .mobile-gate .mg-q i{display:inline-grid;place-items:center;width:19px;height:19px;border-radius:50%;background:#fff;font-style:normal;font-size:9px;font-weight:700}
  .mobile-gate .mg-body p{margin:0 0 19px}
  .mobile-gate .mg-body p:last-child{margin:0}
  .mobile-gate .mg-body b{font-weight:700;color:#262626}
  .mobile-gate .mg-actions{width:100%;max-width:342px;margin-top:67px;display:flex;flex-direction:column;gap:12px}
  .mobile-gate button{touch-action:manipulation;-webkit-tap-highlight-color:transparent;position:relative;z-index:1;width:100%;border:0;background:none;font:inherit;color:#262626;cursor:pointer}
  .mobile-gate .mg-primary{height:60px;border-radius:38px;font-size:16px;font-weight:700;color:#fff;letter-spacing:.01em;background:radial-gradient(55% 140% at 6% 40%,rgb(0 214 200/.9),transparent 70%),radial-gradient(60% 150% at 96% 55%,rgb(40 236 140/.95),transparent 70%),linear-gradient(90deg,#00DFC4,#16E6A8 55%,#2EE88F);box-shadow:0 6px 18px rgb(0 200 160/.18)}
  .mobile-gate .mg-primary:active{transform:scale(.98)}
  .mobile-gate .mg-secondary{padding:12px;font-size:15px}
  .mobile-gate .mg-url{display:none;margin:2px auto 0;padding:12px 16px;border-radius:12px;background:rgb(38 38 38/6%);font-size:13px;font-weight:700;word-break:break-all;user-select:all;-webkit-user-select:all}
  .mobile-gate .mg-url.is-on{display:block;animation:mg-rise .3s ease forwards}
  .mobile-gate small{display:block;margin-top:8px;font-size:12px;color:#969696}`;
  function mount() {
    const style = document.createElement('style'); style.textContent = css; document.head.append(style);
    const gate = document.createElement('main'); gate.className = 'mobile-gate';
    gate.innerHTML = `<div>
      <svg class="mg-logo" viewBox="0 0 2413 340" role="img" aria-label="모로가도"><defs><mask id="mgMask" maskUnits="userSpaceOnUse" x="-20" y="-20" width="520" height="380"><path class="mg-s1" d="M43 340V127Q43 44 126 44H210V300L425 50" pathLength="1"/><path class="mg-s2" d="M275 43H433V220" pathLength="1"/></mask></defs><path d="M476.478 0.70813V208.016H390.948V140.918L269.153 296.15L253.137 316.569L252.965 316.792H167.298V87.2663H126.854C104.516 87.2663 86.4269 105.373 86.4269 127.71V316.792H0.70813V126.82C0.70813 124.25 0.77665 121.715 0.930821 119.18C2.69522 89.5788 14.6863 62.736 33.4094 42.1115C56.141 17.0331 88.8594 1.13638 125.295 0.72526C125.809 0.70813 126.323 0.70813 126.837 0.70813H252.965V178.227L253.137 178.021L269.153 157.602L325.151 86.2213H269.153V0.70813H476.478Z" fill="#262626" mask="url(#mgMask)"/><path class="mg-star" d="M426.182 233.371C428.358 228.318 436.974 228.318 439.167 233.371C443.055 242.364 448.503 252.78 455.046 259.323C461.59 265.867 472.005 271.314 480.998 275.203C486.069 277.378 486.069 285.995 480.998 288.187C472.005 292.076 461.59 297.523 455.046 304.067C448.503 310.611 443.055 321.026 439.167 330.019C436.991 335.089 428.375 335.089 426.182 330.019C422.294 321.026 416.846 310.611 410.303 304.067C403.759 297.523 393.344 292.076 384.351 288.187C379.297 286.012 379.297 277.395 384.351 275.203C393.344 271.314 403.759 265.867 410.303 259.323C416.846 252.78 422.294 242.364 426.182 233.371Z" fill="#00F998"/><g fill="#262626"><path class="mg-l" style="--i:0" d="M626.943 76.1129C555.785 76.1129 498.108 133.79 498.108 204.948C498.108 276.106 555.785 333.783 626.943 333.783C698.102 333.783 755.779 276.106 755.779 204.948C755.779 133.79 698.102 76.1129 626.943 76.1129ZM626.943 247.174C604.126 247.174 585.626 228.69 585.626 205.873C585.626 183.056 604.126 164.555 626.943 164.555C649.761 164.555 668.244 183.056 668.244 205.873C668.244 228.69 649.761 247.174 626.943 247.174Z"/><path class="mg-l" style="--i:1" d="M1024.35 308.398L963.107 237.925C999.748 216.427 1024.35 176.617 1024.35 131.051C1024.35 98.6067 1011.88 69.0745 991.44 47.011C968.828 22.5493 936.47 7.23505 900.531 7.23505C886.587 7.23505 873.174 9.5476 860.669 13.7959C840.935 20.4937 823.446 32.0394 809.622 47.011C789.186 69.0745 776.715 98.6067 776.715 131.051V316.672H860.669V248.049L860.995 248.426L920.299 316.672H1031.52L1024.35 308.398ZM905.242 171.341C903.7 171.529 902.124 171.632 900.531 171.632C878.604 171.632 860.841 153.851 860.841 131.925C860.841 128.413 861.303 125.004 862.16 121.767C866.648 104.756 882.116 92.2344 900.531 92.2344C922.457 92.2344 940.238 109.998 940.238 131.925C940.238 152.258 924.958 169.028 905.242 171.341Z"/><path class="mg-l" style="--i:2" d="M1162.55 76.1129C1114.25 76.1129 1072.14 102.716 1050.09 142.046C1039.66 160.633 1033.72 182.097 1033.72 204.948C1033.72 227.8 1039.68 249.263 1050.09 267.85C1072.14 307.197 1114.25 333.783 1162.55 333.783C1233.73 333.783 1291.4 276.106 1291.4 204.948C1291.4 133.79 1233.73 76.1129 1162.55 76.1129ZM1162.55 247.174C1139.75 247.174 1121.25 228.69 1121.25 205.873C1121.25 183.056 1139.75 164.555 1162.55 164.555C1185.35 164.555 1203.87 183.056 1203.87 205.873C1203.87 228.69 1185.37 247.174 1162.55 247.174Z"/><path class="mg-l" style="--i:3" d="M1602.25 130.194V316.672H1312.63V130.194C1312.63 127.676 1312.7 125.158 1312.85 122.674C1314.38 97.2704 1323.56 73.9392 1338.12 54.942C1340.21 52.2012 1342.42 49.5632 1344.73 47.0108C1367.38 22.0523 1400.08 6.3783 1436.44 6.3783H1560.26V91.3605H1436.44C1414.52 91.3605 1396.75 109.141 1396.75 131.051V232.718H1518.29V130.194H1602.25Z"/><path class="mg-l" style="--i:4" d="M1748.98 82.7457C1680.6 82.7457 1625.16 138.179 1625.16 206.562C1625.16 274.945 1680.6 330.378 1748.98 330.378C1762.92 330.378 1776.34 328.065 1788.84 323.817V330.378H1872.8V206.562C1872.8 138.179 1817.36 82.7457 1748.98 82.7457ZM1748.98 247.126C1727.05 247.126 1709.29 229.362 1709.29 207.435C1709.29 185.509 1727.05 167.728 1748.98 167.728C1770.91 167.728 1788.67 185.509 1788.67 207.435C1788.67 229.362 1770.91 247.126 1748.98 247.126Z"/><path class="mg-l" style="--i:5" d="M2054.96 23.5079V91.8568C2042.46 87.6086 2029.06 85.296 2015.12 85.296C1968.68 85.296 1928.22 110.854 1907.03 148.66C1897.01 166.527 1891.28 187.151 1891.28 209.112C1891.28 231.073 1897.01 251.697 1907.03 269.581C1928.22 307.387 1968.68 332.945 2015.12 332.945C2029.06 332.945 2042.46 330.633 2054.96 326.384C2103.8 309.802 2138.93 263.568 2138.93 209.112V23.5079H2054.96ZM2015.12 247.946C1993.19 247.946 1975.41 230.182 1975.41 208.256C1975.41 186.329 1993.19 168.548 2015.12 168.548C2037.04 168.548 2054.81 186.329 2054.81 208.256C2054.81 230.182 2037.03 247.946 2015.12 247.946Z"/><path class="mg-l" style="--i:6" d="M2282.86 75.9767C2234.55 75.9767 2192.44 102.58 2170.4 141.91C2159.96 160.496 2154.02 181.96 2154.02 204.812C2154.02 227.663 2159.98 249.127 2170.4 267.713C2192.44 307.061 2234.55 333.647 2282.86 333.647C2354.03 333.647 2411.71 275.97 2411.71 204.812C2411.71 133.654 2354.03 75.9767 2282.86 75.9767ZM2282.86 247.037C2260.06 247.037 2241.56 228.554 2241.56 205.737C2241.56 182.92 2260.06 164.419 2282.86 164.419C2305.66 164.419 2324.17 182.92 2324.17 205.737C2324.17 228.554 2305.67 247.037 2282.86 247.037Z"/></g></svg>
      <div class="mg-top"><h1>노트북·PC에서<br>열어주세요!</h1><img class="mg-seed" src="./assets/seed-character.svg" alt="" width="92" height="139"></div>
      <div class="mg-body"><p class="mg-q"><i>?</i>이게 뭔가요?</p><p><b>모로가도</b>는 창작자들이 서로의 미완성 작업을<br>주고 받음으로써, 죽어가는 아까운 파일을 활용할 수 있는<br><b>릴레이 창작 플랫폼</b>이에요.</p><p><b>졸전 프로젝트의 사용성 평가</b>를 진행하고 있어요! 여러분의 작업을 올려, <b>ai를 통해 분석해주는 과정</b>을 경험해보시고, 자유롭게 의견을 남겨주세요! 그 과정이 그대로 평가 기록으로 남고, 서비스 완성을 위한 귀중한 데이터가 된답니다...</p><p>끝까지 완료해주신 분들께는 구글 폼을 작성해 주시면<br><b>커피 한 잔</b>을 드려요 ...🎁<br>저희의 무사졸업을 위해 참여해 주시면 정말 감사하겠습니다!</p></div>
      <div class="mg-actions"><button class="mg-primary" type="button" data-share>카톡으로 나에게 링크 보내기...🏃</button>
      <button class="mg-secondary" type="button" data-copy>주소 복사하기</button>
      <span class="mg-url" data-url>${url.replace(/^https?:\/\//, '')}</span>
      <small data-msg></small></div></div>`;
    document.body.append(gate);
    // 로고 모션이 끝나면 천천히 '슈웅' 내려가서, 제목~'주소 복사하기'까지가 화면 위아래 여백이 같게(가운데) 오도록 해요.
    // 그 전에 직접 스크롤하면 건드리지 않아요.
    let touched = false;
    const stop = () => { touched = true; };
    ['touchstart', 'wheel'].forEach((ev) => gate.addEventListener(ev, stop, { passive: true }));
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ease = (t) => (t < .5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2); // 천천히 출발 → 슈웅 → 사뿐히 멈춤
    function glide() {
      if (touched) return;
      const inner = gate.firstElementChild;
      const off = (el) => el.getBoundingClientRect().top - gate.getBoundingClientRect().top + gate.scrollTop;
      const seed = gate.querySelector('.mg-seed');
      const first = off(gate.querySelector('.mg-top')) + Math.min(0, seed ? seed.offsetTop : 0); // 흔들림(회전)과 상관없이 캐릭터 머리 기준
      const copy = gate.querySelector('.mg-secondary');
      const last = off(copy) + copy.offsetHeight - 12; // 버튼 안쪽 여백 말고 글자 끝 기준
      const vh = gate.clientHeight;
      const h = last - first;
      let target = h <= vh ? first - (vh - h) * .68 : last - vh + 20; // 위 여백을 조금 더 넉넉히(아래쪽으로 앉게)
      if (target <= 4) return; // 이미 다 보이면 그대로
      // 가운데로 맞추려면 아래 공간이 모자랄 수 있어서, 필요한 만큼만 아래 여백을 늘려요.
      const lack = target + vh - gate.scrollHeight;
      if (lack > 0) inner.style.paddingBottom = `calc(env(safe-area-inset-bottom) + ${40 + Math.ceil(lack)}px)`;
      target = Math.round(target);
      if (reduce) { gate.scrollTop = target; return; }
      const from = gate.scrollTop, dist = target - from, dur = 2600;
      let t0 = 0;
      const step = (now) => {
        if (touched) return;
        if (!t0) t0 = now;
        const t = Math.min(1, (now - t0) / dur);
        gate.scrollTop = from + dist * ease(t);
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    setTimeout(glide, reduce ? 300 : 2600);
    // 내려가면서 로고는 스르르 사라져요(위에 반쯤 잘려 보이지 않게). 다시 올리면 돌아와요.
    gate.addEventListener('scroll', () => {
      const lg = gate.querySelector('.mg-logo'); if (!lg) return;
      const r = lg.getBoundingClientRect(), top = r.top - gate.getBoundingClientRect().top; // 화면 위 끝 기준 로고 위치
      lg.style.opacity = String(Math.min(1, Math.max(0, (top + r.height * .6) / (r.height * .6 + 16))));
    }, { passive: true });
    // 복사: 최신 방식이 막히면(인앱 브라우저) 예전 방식으로 한 번 더 시도해요.
    async function copyText(text) {
      try { await navigator.clipboard.writeText(text); return true; } catch { /* 아래로 */ }
      try { const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0'; document.body.append(t); t.select(); t.setSelectionRange(0, text.length); const ok = document.execCommand('copy'); t.remove(); return ok; } catch { return false; }
    }
    const msg = gate.querySelector('[data-msg]');
    // 로고를 누르면 모션을 다시 재생해요.
    const logo = gate.querySelector('.mg-logo');
    logo.addEventListener('click', () => { const clone = logo.cloneNode(true); logo.replaceWith(clone); clone.addEventListener('click', () => location.reload()); });
    gate.querySelector('[data-copy]').addEventListener('click', async () => {
      gate.querySelector('[data-url]').classList.add('is-on');
      try { if (!await copyText(url)) throw 0; msg.textContent = '복사했어요! 노트북 주소창에 붙여넣어 열어보세요.'; }
      catch { msg.textContent = '위 주소를 길게 눌러 복사해 주세요.'; }
    });
    // 공유 시트를 열고, 안 되면(카톡 인앱 브라우저 등) 주소를 복사한 뒤 카카오톡 앱을 열어 붙여넣게 해요.
    gate.querySelector('[data-share]').addEventListener('click', async () => {
      const inKakao = /KAKAOTALK/i.test(navigator.userAgent);
      // 카톡 안 브라우저에선 공유가 막혀 있어서, 기본 브라우저(Safari·크롬)로 열어 다시 누르게 해요.
      if (inKakao) {
        msg.textContent = '기본 브라우저로 여는 중이에요. 열리면 이 버튼을 한 번 더 눌러 주세요.';
        location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(url);
        return;
      }
      if (navigator.share) {
        try { await navigator.share({ title: '모로가도 사용성 평가', text: '노트북에서 열어보기 👉 ' + url }); return; }
        catch (e) { if (e && e.name === 'AbortError') return; }
      }
      gate.querySelector('[data-url]').classList.add('is-on');
      let copied = false;
      copied = await copyText(url);
      msg.textContent = copied ? '주소를 복사했어요! 카카오톡 ‘나와의 채팅’에 붙여넣어 주세요.' : '위 주소를 길게 눌러 복사한 뒤 카카오톡 ‘나와의 채팅’에 붙여넣어 주세요.';
      if (copied && !inKakao) setTimeout(() => { location.href = 'kakaotalk://'; }, 600);
    });
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
  window.MOROGARO_MOBILE_GATE = true;
})();
