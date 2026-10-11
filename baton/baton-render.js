/* 모로가도 · 바톤 상세페이지 렌더러
 *
 * - 단독으로 열면(baton/index.html): v10 시안 그대로(참외 달력 예시)를 보여줘요.
 * - 바톤 메이커 안에서 열리면(baton/index.html?embed=1): 메이커가 보낸 바톤 기록을
 *   BatonView로 바꿔 화면을 채운 뒤, 기존 v10 인터랙션(app.js)을 실행해요.
 *
 * 메이커 ↔ 상세페이지 메시지 (window.postMessage)
 *   상세 → 메이커  { type:'morogaro:baton-ready' }            준비됐으니 기록을 보내 주세요
 *   메이커 → 상세  { type:'morogaro:baton', record, ownerName } 바톤 기록
 *   상세 → 메이커  { type:'morogaro:baton-edit' }             수정하기 (메이커로 돌아가기)
 *   상세 → 메이커  { type:'morogaro:baton-bookmark', value }  보관 상태 저장
 *   상세 → 메이커  { type:'morogaro:baton-rendered', stage }   화면을 다 그렸어요
 */
(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  const embedded = params.get('embed') === '1' && window.parent !== window;
  const data = window.MorogaroBatonData;

  /* ───────── 화면 너비에 맞춤 + 진입(A) → 스크롤(B) 변화 ─────────
   * 비율은 그대로: 1440 시안을 화면 너비에 맞춰 확대·축소해요(좌우 여백 없음).
   * Figma 3671:4531(A, 처음 진입) → 3671:4723(B, 스크롤 후). 둘 다 1440×757 기준이에요.
   *   - 페이지가 154px 올라가요(제목 · 갤러리는 그대로 따라 올라감).
   *   - 헤더는 94px까지 같이 올라가다가, 그 뒤로는 아래쪽 계정 탭만 위에 붙어 있어요.
   *   - 작성자 말풍선(레고 1891 · 문의하기)은 서서히 사라져요.
   *   - 바톤 정보 카드는 62px, '지금 바로 이어달리기'는 50px 더 올라가 빈자리를 채워요.
   * 변화는 스크롤 위치(0 → 154px)에 그대로 연결돼 있고, 중간에서 손을 떼면 가까운 쪽(A/B)으로 맞춰져요.
   * B에서 한 번 멈춘 뒤 다시 스크롤하면 바톤로그로 넘어가요(app.js). */
  const fit = (() => {
    const root = document.documentElement;
    let scale = 1, frame = 0, idleTimer = 0, snapFrame = 0, lastY = 0, lastDir = 1;
    const px = v => `${Math.round(v * 100) / 100}px`;
    const HEADER_FOLD = 94, ENTER_RANGE = 154;
    function apply() {
      frame = 0;
      const page = document.getElementById('page');
      if (!page) return;
      root.classList.add('is-fit');
      const w = root.clientWidth || window.innerWidth, h = window.innerHeight;
      const next = Math.max(0.2, Math.min(1, w / 1440));   // 1440보다 넓으면 확대하지 않고 가운데 정렬(업로드 페이지와 같은 크기)
      scale = next;
      const visible = Math.floor(h / next);                          // 한 화면에 보이는 시안 높이
      const detail = visible + ENTER_RANGE;                            // A → B로 내려갈 만큼만 상세 영역을 둬요
      root.style.setProperty('--detail-height', `${detail}px`);
      root.style.setProperty('--beyond-top', `${detail - 64}px`);      // '바톤 너머'는 B 화면 맨 아래
      root.style.setProperty('--fit-scale', String(next));
      root.style.setProperty('--fit-left', `${Math.max(0, Math.round((w - 1440 * next) / 2))}px`);
      root.style.setProperty('--fit-vh', `${visible}px`);
      root.style.setProperty('--fit-height', `${Math.ceil(page.offsetHeight * next)}px`);
      sync();
    }
    function sync() {
      const header = document.querySelector('.site-header');
      const y = window.scrollY / scale;
      // 바톤로그 페이지에선 헤더가 처음부터 접힌 상태(계정 탭만)로 위에 붙어 있어요.
      const inLog = document.getElementById('page')?.dataset.view === 'log';
      const pinned = inLog || y > HEADER_FOLD;
      if (header) header.style.transform = pinned ? `translate3d(0, ${y - HEADER_FOLD}px, 0)` : '';
      let bleed = document.querySelector('.header-bleed');
      if (!bleed) { bleed = document.createElement('div'); bleed.className = 'header-bleed'; bleed.setAttribute('aria-hidden', 'true'); document.body.prepend(bleed); }
      bleed.style.transform = pinned ? `translate3d(0, ${(y - HEADER_FOLD) * scale}px, 0) scale(${scale})` : `scale(${scale})`; bleed.style.transformOrigin = '0 0'; bleed.style.width = `${100 / scale}%`;
      root.classList.toggle('header-compact', pinned);
      const p = Math.max(0, Math.min(1, y / ENTER_RANGE));
      root.style.setProperty('--enter-p', p.toFixed(4));
      root.classList.toggle('is-entered', p > .6);
    }
    function animateTo(target) {
      cancelAnimationFrame(snapFrame);
      const from = window.scrollY, start = performance.now(), dur = 420;
      const ease = t => 1 - Math.pow(1 - t, 3);
      const step = now => {
        const t = Math.min(1, (now - start) / dur);
        window.scrollTo({top: from + (target - from) * ease(t), behavior: 'instant'});
        if (t < 1) snapFrame = requestAnimationFrame(step);
      };
      snapFrame = requestAnimationFrame(step);
    }
    function settle() {
      const end = ENTER_RANGE * scale, y = window.scrollY;
      if (window.Morogaro?.page?.getState().animating) return;
      if (document.getElementById('page')?.dataset.view !== 'detail') return;
      if (y > 1 && y < end - 1) animateTo(lastDir > 0 ? end : 0);   // 중간에 멈추면 진행 방향 쪽으로 마무리
    }
    window.addEventListener('scroll', () => {
      const y = window.scrollY; if (y !== lastY) lastDir = Math.sign(y - lastY) || lastDir; lastY = y;
      sync(); clearTimeout(idleTimer); idleTimer = setTimeout(settle, 160);
    }, {passive: true});
    const schedule = () => { if (!frame) frame = requestAnimationFrame(apply); };
    apply();
    window.addEventListener('resize', schedule, {passive: true});
    if ('ResizeObserver' in window) { const page = document.getElementById('page'); if (page) new ResizeObserver(schedule).observe(page); }
    return Object.freeze({scale: () => scale, shift: () => 0, refresh: apply});
  })();
  window.MorogaroFit = fit;

  function loadApp() {
    const script = document.createElement('script');
    script.src = 'app.js';
    script.onload = () => {
      document.documentElement.classList.remove('is-waiting-baton');
      if (embedded) post({ type: 'morogaro:baton-rendered', stage: window.MorogaroLive?.view.stage || null });
    };
    document.body.append(script);
  }
  function post(message) { try { window.parent.postMessage(message, '*'); } catch { /* 부모 창이 닫힌 경우 */ } }

  /* 사용성 연구: 메이커가 요청하면 완성된 상세페이지(1440 시안 그대로, 처음 진입 모습)를 이미지로 떠서 돌려줘요.
   *   메이커 → 상세 { type:'morogaro:capture-request', id }  /  상세 → 메이커 { type:'morogaro:capture', id, image } */
  if (embedded) window.addEventListener('message', async event => {
    if (event.source !== window.parent || event.data?.type !== 'morogaro:capture-request') return;
    const page = document.getElementById('page'), shot = window.modernScreenshot;
    let image = null;
    try {
      if (page && shot) {
        await (document.fonts?.ready || Promise.resolve());
        image = await Promise.race([
          shot.domToJpeg(page, { width: 1440, height: page.offsetHeight, backgroundColor: '#FAFAFA', quality: 0.86, scale: 1, timeout: 15000, style: { transform: 'none', margin: '0' } }),
          new Promise(resolve => setTimeout(() => resolve(null), 20000)),
        ]);
      }
    } catch { image = null; }
    post({ type: 'morogaro:capture', id: event.data.id, image });
  });

  if (!embedded) { loadApp(); return; }

  /* ───────── 작은 DOM 도우미 ───────── */
  const $ = (s, root = document) => root.querySelector(s);
  const E = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const img = (src, alt = '', w, h) => { const n = new Image(); n.src = src; n.alt = alt; if (w) n.width = w; if (h) n.height = h; n.draggable = false; return n; };
  const formatSize = s => s >= 1048576 ? `${(s / 1048576).toFixed(1)}MB` : s >= 1024 ? `${(s / 1024).toFixed(1)}KB` : `${s}B`;
  const dot = v => (v || '').replaceAll('-', '.');
  const objectURLs = [];
  const SITE_DOWNLOAD_NOTE = '공유 사이트에서는 파일을 내려받을 수 없어요. 프로젝트 폴더의 index.html로 열면 받을 수 있어요.';
  let toastTimer;
  function toast(message) {
    const el = $('#toast'); clearTimeout(toastTimer); el.textContent = message; el.classList.add('is-visible');
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 3800);
  }

  /* ───────── 상단: 제목 · 작성자 ───────── */
  function renderHeading(v) {
    document.title = `${v.title} — 모로가도`;
    $('#baton-title').textContent = v.title;
    $('.baton-subtitle').textContent = v.subtitle;
    $('.category-tags').replaceChildren(...v.categories.map(c => E('span', '', c)));
    $('.author-name').textContent = v.author.name;
    const edit = $('.contact-button');
    edit.removeAttribute('data-unwired'); edit.id = 'edit-baton'; edit.textContent = '바톤 수정하기';
    edit.addEventListener('click', () => post({ type: 'morogaro:baton-edit' }));
    $('.author-bubble').textContent = v.author.message;
  }

  /* ───────── 갤러리 ───────── */
  function renderGallery(v) {
    const host = $('.thumbnails');
    host.replaceChildren();
    if (!v.gallery.length) {
      const art = $('#open-artwork'); art.disabled = true; art.classList.add('is-empty'); art.setAttribute('aria-label', '대표 이미지 없음');
      art.replaceChildren(E('strong', '', '아직 대표 이미지가 없어요'), E('span', '', '파일 목록에서 이 바톤의 자료를 확인할 수 있어요.'));
      return;
    }
    $('#main-artwork').src = v.gallery[0].src; $('#main-artwork').alt = v.gallery[0].alt;
    $('#open-artwork').setAttribute('aria-label', `${v.gallery[0].title} 크게 보기`);
    v.gallery.forEach((g, i) => {
      const b = E('button', 'thumbnail' + (i === 0 ? ' is-active' : ''));
      b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(i === 0));
      b.tabIndex = i === 0 ? 0 : -1; b.dataset.image = String(i); b.setAttribute('aria-controls', 'main-artwork'); b.setAttribute('aria-label', g.title);
      b.append(img(g.src)); host.append(b);
    });
    if (v.gallery.length === 1) host.hidden = true;
  }

  /* ───────── 바톤 정보 탭 ───────── */
  function infoRow(cls, label, value) {
    const row = E('div', cls); row.append(E('span', '', label));
    if (value instanceof Node) row.append(value); else row.append(E('span', 'info-value', value));
    return row;
  }
  function renderInfo(v) {
    const body = $('.info-body'); body.replaceChildren(); body.classList.add('bi');
    const row = (label, right, cls = '') => { const r = E('div', 'bi-row ' + cls); r.append(E('h3', 'bi-label', label)); if (right) r.append(right); return r; };
    const val = t => E('span', 'bi-value', t);

    // 사용 툴
    const pills = E('div', 'bi-pills');
    for (const t of v.tools) { const p = E('span', 'bi-pill', data.toolAbbr(t)); p.title = t; pills.append(p); }
    body.append(row('사용 툴', v.tools.length ? pills : val('확인 전')));

    // 진행 시기
    const { start, end } = v.period;
    const period = start || end ? `${dot(start) || '시작일 미입력'} ~ ${dot(end) || '진행 중'}` : '기간 미입력';
    const time = E('time', 'bi-value', period); if (start) time.dateTime = start;
    body.append(row('진행 시기', time));

    // 바톤 노트 + 레퍼런스
    const note = E('div', 'bi-block');
    note.append(E('h3', 'bi-label', '바톤 노트'), E('p', 'bi-note' + (v.note ? '' : ' is-empty'), v.note || '아직 노트를 남기지 않았어요.'));
    body.append(note);
    const ref = E('button', 'bi-ref'); ref.type = 'button'; ref.id = 'open-references';
    if (v.references.length) {
      const lab = E('span', 'bi-ref-label', '레퍼런스 이미지 보기'); lab.append(E('i', 'bi-chev')); ref.append(lab);
      const thumbs = E('span', 'bi-ref-thumbs');
      v.references.slice(0, 3).forEach((r, i) => {
        const pic = img(r.src, r.alt, 36, 35);
        if (i === 2 && v.references.length > 3) { const more = E('span', 'bi-ref-more'); more.append(pic, E('span', '', `+${v.references.length - 3}`)); thumbs.append(more); }
        else thumbs.append(pic);
      });
      ref.append(thumbs); body.append(ref);
    } else { ref.hidden = true; body.append(ref); }   // app.js가 이벤트를 걸어서 숨긴 채로 둬요

    // 컬러팔레트
    const left = E('div', 'bi-label-group'); left.append(E('h3', 'bi-label', '컬러팔레트'), E('span', 'bi-sub', v.palette.mode || ''));
    const pr = E('div', 'bi-row bi-palette-row'); pr.append(left);
    const sw = E('div', 'bi-swatches');
    const all = v.palette.colors.slice(0, 12), shown = all.length > 4 ? all.slice(0, 3) : all;
    const swatch = hex => { const b = E('button', 'bi-swatch'); b.type = 'button'; b.style.background = hex; b.dataset.color = hex; b.title = hex; b.setAttribute('aria-label', `${hex} 복사`); return b; };
    shown.forEach(h => sw.append(swatch(h)));
    if (all.length > 4) {
      const more = E('button', 'bi-swatch bi-more'); more.append(E('span', '', `+${all.length - 3}`)); more.type = 'button'; more.style.background = all[3]; more.setAttribute('aria-label', '대표 컬러 모두 보기');
      more.addEventListener('click', () => { more.remove(); all.slice(3).forEach(h => { const b = swatch(h); b.addEventListener('click', () => navigator.clipboard?.writeText(h).catch(() => {})); sw.append(b); }); sw.classList.add('is-open'); });
      sw.append(more);
    }
    if (!all.length) sw.append(val('확인 전'));
    pr.append(sw); body.append(pr);

    // 규격
    body.append(row('규격', val(v.dimensions || '확인 전')));

    // 사용 폰트
    if (v.fonts.length) {
      const fb = E('div', 'bi-block bi-fonts');
      const head = E('div', 'bi-row'); const hl = E('div', 'bi-label-group'); hl.append(E('h3', 'bi-label', '사용 폰트'), E('span', 'bi-count', v.fonts.length));
      const allBtn = E('button', 'bi-all', '전체다운'); allBtn.type = 'button';
      allBtn.addEventListener('click', () => v.fonts.forEach((f, i) => setTimeout(() => window.open(fontLink(f), '_blank', 'noopener'), i * 250)));
      head.append(hl, allBtn); fb.append(head);
      for (const f of v.fonts) {
        const a = E('a', 'bi-font'); a.href = fontLink(f); a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = `${f.name} 받으러 가기`;
        a.append(E('span', '', f.name + (f.weights ? ` · ${f.weights}` : '')), img('assets/font-download.svg', '', 28, 28)); fb.append(a);
      }
      body.append(fb);
    }

    // 스타일 TAG
    const tb = E('div', 'bi-block'); tb.append(E('h3', 'bi-label', '스타일 TAG'));
    const tags = E('div', 'bi-tags'); for (const t of v.tags) tags.append(E('span', 'bi-tag', t));
    if (!v.tags.length) tags.append(val('태그 미입력'));
    tb.append(tags); body.append(tb);

    // 제작 정보
    if (v.materials) { const mb = E('div', 'bi-block'); mb.append(E('h3', 'bi-label', '소재 · 후가공'), E('p', 'bi-text', v.materials)); body.append(mb); }
    if (v.lessons) { const lb = E('div', 'bi-block'); lb.append(E('h3', 'bi-label', '배운 점'), E('p', 'bi-text', v.lessons)); body.append(lb); }

  }
  // 폰트 받는 곳: 직접 입력한 주소 → 잘 알려진 폰트 → 검색
  const FONT_LINKS = {
    'pretendard': 'https://github.com/orioncactus/pretendard/releases', 'spoqa han sans neo': 'https://spoqa.github.io/spoqa-han-sans/',
    '본고딕': 'https://github.com/adobe-fonts/source-han-sans/releases', 'source han sans': 'https://github.com/adobe-fonts/source-han-sans/releases',
    '본명조': 'https://github.com/adobe-fonts/source-han-serif/releases', 'nanum gothic': 'https://fonts.google.com/specimen/Nanum+Gothic', '나눔고딕': 'https://fonts.google.com/specimen/Nanum+Gothic',
    'helvetica neue': 'https://www.myfonts.com/collections/helvetica-neue-font-linotype', 'helvetica': 'https://www.myfonts.com/collections/helvetica-font-linotype',
    'futura': 'https://www.myfonts.com/collections/futura-font-bitstream', 'gmarket sans': 'https://corp.gmarket.com/fonts/', '산돌고딕': 'https://www.sandollcloud.com/',
  };
  function fontLink(f) {
    if (f.url) return f.url;
    const key = f.name.toLowerCase().trim();
    if (FONT_LINKS[key]) return FONT_LINKS[key];
    if (/^(noto|nanum|roboto|inter|open sans|montserrat|lato|poppins|gowun|ibm plex|black han sans|do hyeon|jua|gothic a1|song myung|gaegu)/i.test(key)) return `https://fonts.google.com/specimen/${encodeURIComponent(f.name.trim()).replace(/%20/g, '+')}`;
    return `https://www.google.com/search?q=${encodeURIComponent(f.name + ' 폰트 다운로드')}`;
  }

  /* ───────── 파일 목록 탭 ───────── */
  function renderFiles(v) {
    for (const el of document.querySelectorAll('.file-count')) el.textContent = String(v.files.length);
    const panel = $('#files-panel'); panel.replaceChildren();

    const summary = E('section', 'stage-summary'); summary.setAttribute('aria-label', `현재 진행도 ${v.stage || '미확인'}`);
    const plant = E('div', 'plant-stage');
    if (v.stage) {
      plant.append(img(v.stage === 'Planting' ? 'assets/planting.svg' : `../assets/stage-${v.stage.toLowerCase()}.svg`, '', 68, 66));
      plant.style.color = data.STAGE_COLORS[v.stage];
    } else { plant.append(E('span', 'stage-unknown', '—')); plant.style.color = '#7A7A7A'; }
    plant.append(E('span', '', v.stage || '미확인'));
    const checks = E('ul', 'stage-checks');
    for (const s of v.stageStatements) checks.append(E('li', '', s));
    summary.append(plant, checks); panel.append(summary);

    const heading = E('div', 'files-heading');
    const strong = E('strong', '', '파일 목록 '); strong.append(E('span', 'file-count', v.files.length));
    const all = E('button', '', '전체다운'); all.type = 'button'; all.id = 'download-all';
    all.disabled = !v.files.some(f => !f.isFont);
    all.addEventListener('click', () => window.MOROGARO_SITE ? toast(SITE_DOWNLOAD_NOTE) : downloadAll(v, all));
    heading.append(strong, all); panel.append(heading);

    const list = E('div', 'file-list');
    for (const f of v.files) {
      const label = E('span', 'file-label'); label.append(E('strong', '', f.name), E('small', '', `${f.ext} 파일 · ${formatSize(f.size)}`));
      label.firstChild.title = f.name;
      const type = E('span', 'file-type' + (f.ext.length > 3 ? ' docx' : ''), `${f.ext}.`);
      let row;
      if (window.MOROGARO_SITE) {
        // 공유 사이트에서는 브라우저가 다운로드를 막아요. 로컬 실행(index.html)에서는 바로 받을 수 있어요.
        row = E('button', 'file-row'); row.type = 'button';
        row.addEventListener('click', () => toast(SITE_DOWNLOAD_NOTE));
        row.append(type, label, img('assets/file-download.svg', '', 26, 21));
      } else if (f.isFont) {
        row = E('button', 'file-row'); row.type = 'button';
        row.addEventListener('click', () => toast('폰트 파일은 직접 배포하지 않아요. 바톤 정보의 받는 곳을 이용해 주세요.'));
        row.append(type, label, img('../assets/review-info.svg', '배포 안내', 20, 20));
      } else {
        row = E('a', 'file-row'); const url = URL.createObjectURL(f.blob); objectURLs.push(url);
        row.href = url; row.download = f.name; row.setAttribute('aria-label', `${f.name} 다운로드`);
        row.append(type, label, img('assets/file-download.svg', '', 26, 21));
      }
      list.append(row);
    }
    if (!v.files.length) list.append(E('p', 'files-empty', '추가한 파일이 없어요.'));
    panel.append(list);

    if (v.links.length) {
      panel.append(E('h3', 'links-heading', '참고 링크'));
      const links = E('div', 'file-list');
      for (const href of v.links) {
        const a = E('a', 'file-row link-row'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
        const label = E('span', 'file-label'); label.append(E('strong', '', new URL(href).hostname), E('small', '', href));
        a.append(img('../assets/link.svg', '', 24, 24), label); links.append(a);
      }
      panel.append(links);
    }
    if (v.files.some(f => f.isFont)) panel.append(E('p', 'files-empty', '전체다운에서는 폰트 파일을 제외해요.'));
  }
  let bundleBusy = false;
  async function downloadAll(v, button) {
    if (bundleBusy || !window.MorogaroBundle) return;
    bundleBusy = true; button.disabled = true; button.textContent = '준비 중';
    try {
      const blob = await window.MorogaroBundle.create(v.files.map(f => f.blob));
      const url = URL.createObjectURL(blob), a = E('a');
      a.href = url; a.download = v.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 100) + '-files.zip';
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (error) { toast(error?.message || '전체다운을 준비하지 못했어요. 파일을 하나씩 받아 주세요.'); }
    finally { bundleBusy = false; button.disabled = false; button.textContent = '전체다운'; }
  }

  /* ───────── 바톤 너머: 로그 루트 · 댓글 · 아이디어 ───────── */
  function renderLower(v) {
    const root = $('#log-root');
    root.setAttribute('aria-label', `${v.title}, 현재 바톤. 바톤로그 처음으로 돌아가기`);
    if (v.gallery.length) { root.classList.add('is-live'); root.replaceChildren(img(v.gallery[0].src, `${v.title}, 현재 바톤`)); }
    else { root.classList.add('is-live', 'is-empty'); root.replaceChildren(E('span', '', v.title)); }

    const social = v.social;
    $('#comment-count').textContent = String(social.commentTotal);
    $('#all-comment-count').textContent = String(social.commentTotal);
    $('#all-comments').hidden = social.commentTotal <= 3;   // 다 보이면 '모두 보기'는 숨겨요
    const host = $('#comments'); host.replaceChildren();
    for (const c of social.comments) {
      const art = E('article', `comment comment-${c.kind}`);
      const head = E('header'); head.append(E('strong', '', c.name.replace('{{author}}', v.author.name)));
      if (c.handle) head.append(E('span', 'handle', `(${c.handle})`));
      if (c.badge) head.append(E('span', 'author-badge', c.badge));
      if (c.inherited) head.append(E('span', 'inherited-badge', '이어받은 사람'));
      head.append(E('time', '', c.time));
      const body = E('div'); body.append(head, E('p', '', c.text));
      art.append(E('span', `comment-avatar ${c.avatar}`), body); host.append(art);
    }

    const cards = $('.idea-cards'); cards.replaceChildren();
    const interest = [4, 3, 2];
    const ideaCard = (idea, i, who) => {
      const card = E('article', 'idea-card' + (who ? ' is-new' : ''));
      card.append(E('span', 'idea-badge' + (i === 0 && !who ? ' green' : ''), who ? '방문자 제안' : i === 0 ? '아직 없는 작업' : '원작자 제안'));
      const h3 = E('h3', '', idea.title); h3.title = idea.title; card.append(h3);
      card.append(E('p', '', idea.body || '원작자가 남긴 다음 방향이에요. 이어받아 시작해 보세요.'));
      const author = E('div', 'idea-author'); author.append(E('i'), E('strong', '', who || v.author.name), E('span', '', who ? '방금 전' : '원작자 제안'));
      card.append(author, E('span', 'interest', who ? '첫 관심을 기다려요' : `${interest[i] || 1}명이 관심 있어요`));
      const startB = E('button', 'start-idea' + (i === 0 && !who ? ' primary' : ''), '이어받아 시작하기'); startB.type = 'button'; startB.dataset.inherit = `idea-${i + 1}`;
      card.append(startB); return card;
    };
    v.nextIdeas.forEach((idea, i) => cards.append(ideaCard({ title: idea }, i)));
    if (!v.nextIdeas.length) {
      const card = E('article', 'idea-card is-empty');
      card.append(E('span', 'idea-badge', '아이디어'), E('h3', '', '아직 제안이 없어요'), E('p', '', '나도 제안하기로 첫 방향을 남겨 보세요.'));
      cards.append(card);
    }
    let count = v.nextIdeas.length;
    $('#ideas-title span').textContent = String(count);
    cards.classList.toggle('is-scrollable', count > 2);

    // 나도 제안하기: 가운데 팝업으로 입력해요(이 브라우저에만 남아요).
    const oldBtn = $('.add-idea'); const addBtn = oldBtn.cloneNode(true); addBtn.removeAttribute('data-unwired'); oldBtn.replaceWith(addBtn);
    const dlg = E('dialog', 'idea-dialog'); dlg.setAttribute('aria-labelledby', 'idea-dialog-title');
    dlg.innerHTML = `<form method="dialog" class="idea-form">
      <p class="idea-dialog-eyebrow">바톤 아이디어</p>
      <h2 id="idea-dialog-title">이 바톤, 어디로 이어가면 좋을까요?</h2>
      <p class="idea-dialog-sub">떠오른 다음 방향을 남겨 주세요. 원작자와 다음 러너에게 힌트가 돼요.</p>
      <label class="idea-field"><span>한 줄 제안</span><input name="title" maxlength="40" required placeholder="예: 네온 컬러로 모션 포스터 만들기" autocomplete="off"><em data-count>0/40</em></label>
      <label class="idea-field"><span>조금 더 설명 <small>(선택)</small></span><textarea name="body" maxlength="120" rows="3" placeholder="어떤 점에서 이어가면 좋을지 적어 주세요."></textarea></label>
      <div class="idea-actions"><button type="button" class="idea-cancel" value="cancel">취소</button><button type="submit" class="idea-submit" value="ok">제안 남기기 <span aria-hidden="true">🏃</span></button></div>
    </form>`;
    document.body.append(dlg);
    const form = dlg.querySelector('form'), title = form.elements.title, cnt = form.querySelector('[data-count]');
    title.addEventListener('input', () => { cnt.textContent = `${title.value.length}/40`; });
    dlg.querySelector('.idea-cancel').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    addBtn.addEventListener('click', () => { form.reset(); cnt.textContent = '0/40'; dlg.showModal(); setTimeout(() => title.focus(), 50); });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const t = title.value.trim(); if (!t) { title.focus(); return; }
      cards.querySelector('.idea-card.is-empty')?.remove();
      const card = ideaCard({ title: t, body: form.elements.body.value.trim() || '방문자가 남긴 다음 방향이에요.' }, count, '방문자');
      cards.prepend(card); count++; $('#ideas-title span').textContent = String(count); cards.classList.toggle('is-scrollable', count > 2);
      cards.scrollTo?.({ left: 0, behavior: 'smooth' });
      dlg.close();
    });
  }

  /* ───────── 기록 받기 → 그리기 → v10 인터랙션 실행 ───────── */
  let started = false;
  function start(record, ownerName) {
    if (started) return; started = true;
    let view;
    try { view = data.fromMakerRecord(record, { ownerName }); }
    catch (error) { document.documentElement.classList.remove('is-waiting-baton'); toast(error.message); return; }
    document.documentElement.classList.add('is-live');
    if (view.stage) document.documentElement.dataset.batonStage = view.stage;
    renderHeading(view); renderGallery(view); renderInfo(view); renderFiles(view); renderLower(view);

    // app.js가 시안 예시 대신 이 값을 쓰도록 연결합니다.
    window.MorogaroLive = Object.freeze({
      view,
      gallery: view.gallery,
      references: view.references,
      related: view.social.related,
      commentBase: view.social.commentTotal,
      commentKey: `comments:${view.id}`,
      commentAuthor: view.author.name,
      bookmarked: view.bookmarked,
      setBookmark: value => post({ type: 'morogaro:baton-bookmark', value: Boolean(value) }),
      edit: () => post({ type: 'morogaro:baton-edit' }),
      shareMessage: view.preview
        ? '아직 저장하지 않은 미리보기라 공유 주소가 없어요.'
        : '아직 공개 전인 바톤이에요. 공개 서버를 연결하면 공유 링크가 생겨요.',
      inheritMessage: '이어받기는 공개 서버를 연결한 뒤 새 바톤으로 이어져요. 지금은 버튼까지만 연결돼 있어요.',
    });
    loadApp();
  }
  window.addEventListener('message', event => {
    if (event.source !== window.parent) return;
    const m = event.data;
    if (m && m.type === 'morogaro:baton' && m.record) start(m.record, m.ownerName);
  });
  window.addEventListener('pagehide', () => { for (const u of objectURLs) URL.revokeObjectURL(u); });
  document.documentElement.classList.add('is-waiting-baton');
  post({ type: 'morogaro:baton-ready' });
})();
