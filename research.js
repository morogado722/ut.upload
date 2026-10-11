/* 모로가도 · 사용성 평가 기록
 *
 * 모든 방문을 기록해요. 기록은 서버(/api/research)를 거쳐 구글 시트 · 드라이브에 쌓여요.
 *   - 단계별 시간: 사이트 진입 → 첫 파일 업로드 → 분석 시작 · 완료 → 2~6단계 첫 도착 → 바톤 완성
 *   - 행동: AI 초안 · AI 아이디어 사용, AI가 채운 값 중 고친 개수, 단계 이동 방법(단계 버튼 / 스크롤)
 *   - 이탈: 진행할 때마다 '어디까지 왔는지'를 보내고, 창을 닫으면 '나감'을 한 번 더 보내요.
 *   - 바톤 완성 때: 업로드 페이지에 입력한 값 전체 + 업로드 페이지 전체 캡처 + 완성된 상세페이지 캡처
 * 원본 파일은 보내지 않아요(파일 이름 · 종류만).
 */
(() => {
  'use strict';
  // 서버 없이 올린 미리보기 사이트에서는 기록할 곳이 없어서 꺼 둬요.
  if (window.MOROGARO_SITE || window.MOROGARO_MOBILE_GATE) { window.MorogaroResearch = Object.freeze({ hasConsent: () => false, beforeShow: async () => {}, afterDetail: () => {}, state: () => ({ consent: 'off' }) }); return; }
  // Apps Script 주소가 있으면 그쪽으로 바로, 없으면 파이썬 서버(/api/research)로 보내요.
  const APPS = (window.MOROGARO_CONFIG?.appsScriptUrl || '').trim();
  const ENDPOINT = APPS || '/api/research';
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const nowMs = () => Date.now();
  const started = nowMs();

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* 저장 불가 브라우저 */ } },
  };
  const sessionId = (() => {
    try { const old = sessionStorage.getItem('morogaro-research-session'); if (old) return old; } catch { /* */ }
    const id = 's-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + (crypto.randomUUID?.().slice(0, 8) || Math.random().toString(36).slice(2, 10));
    try { sessionStorage.setItem('morogaro-research-session', id); } catch { /* */ }
    return id;
  })();

  /* ───────── 기록 상태 ───────── */
  const marks = { enter: started };          // 이름 → 시각(ms)
  const behavior = { stepButton: 0, stepScroll: 0, aiDraft: 0, aiIdeas: 0, aiIdeaPicked: 0, reanalyze: 0 };
  let lastStep = 1, completed = false;
  const consent = 'yes';   // 동의 창 없이 모든 방문을 기록해요.
  const mark = (name, once = true) => { if (once && marks[name]) return; marks[name] = nowMs(); };
  const seconds = name => marks[name] ? Math.round((marks[name] - started) / 100) / 10 : null;
  function timings() {
    const out = { 진입: 0 };
    const names = { firstUpload: '첫 파일 업로드', analysisStart: '분석 시작', analysisDone: '분석 완료', step2: '2단계 소스 확인', step3: '3단계 썸네일', step4: '4단계 프로젝트 정보', step5: '5단계 파일 정보', step6: '6단계 바톤 노트', batonCreated: '바톤 완성' };
    for (const [key, label] of Object.entries(names)) out[label] = seconds(key);
    return out;
  }
  function device() {
    return { ua: navigator.userAgent.slice(0, 160), screen: `${screen.width}x${screen.height}`, viewport: `${innerWidth}x${innerHeight}`, touch: matchMedia('(pointer: coarse)').matches };
  }
  function base(type) {
    return { type, sessionId, at: new Date().toISOString(), startedAt: new Date(started).toISOString(), lastStep, timings: timings(), marks: { ...marks }, behavior: { ...behavior }, device: device() };
  }

  /* ───────── 보내기 ───────── */
  let progressTimer = 0;
  function send(payload, { beacon = false } = {}) {
    if (consent !== 'yes') return Promise.resolve(false);
    const body = JSON.stringify(payload);
    const type = APPS ? 'text/plain;charset=utf-8' : 'application/json';   // Apps Script는 단순 요청(text/plain)만 받아요.
    if (beacon && navigator.sendBeacon) { try { return Promise.resolve(navigator.sendBeacon(ENDPOINT, new Blob([body], { type }))); } catch { /* fetch로 */ } }
    return fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': type }, body, keepalive: body.length < 60000, ...(APPS ? { mode: 'no-cors' } : {}) })
      .then(r => r.ok || r.type === 'opaque').catch(() => false);
  }
  function progress() {
    clearTimeout(progressTimer);
    progressTimer = setTimeout(() => { if (!completed) void send(base('progress')); }, 400);
  }

  /* ───────── 진행 지점 ───────── */
  document.addEventListener('morogaro:attachments-changed', () => {
    const s = window.MorogaroMaker?.getState?.();
    if (s && (s.files.length || s.links.length) && !marks.firstUpload) { mark('firstUpload'); progress(); }
  });
  document.addEventListener('morogaro:next', e => { if (e.detail?.from === 1) { mark('analysisStart'); progress(); } }, { capture: true });
  document.addEventListener('morogaro:analysis-ready', () => { mark('analysisDone'); progress(); });
  // 단계 이동 방법: 단계 버튼을 누른 직후 바뀐 단계는 '버튼', 그 밖의 변화는 '스크롤'로 세요.
  let buttonUntil = 0;
  document.addEventListener('click', e => {
    const step = e.target.closest?.('.step-button[data-step]');
    if (step) { buttonUntil = performance.now() + 2500; behavior.stepButton++; }
    if (e.target.closest?.('#generate-note')) behavior.aiDraft++;
    if (e.target.closest?.('#suggest-ideas')) behavior.aiIdeas++;
    if (e.target.closest?.('.idea-suggestion')) behavior.aiIdeaPicked++;
    if (e.target.closest?.('#reanalyze-files')) behavior.reanalyze++;
  }, true);
  document.addEventListener('morogaro:active-step', e => {
    const step = Number(e.detail?.step);
    if (!(step >= 2 && step <= 6) || window.MorogaroReview?.currentPage?.() !== 2) return;
    if (step !== lastStep && performance.now() > buttonUntil && lastStep >= 2) behavior.stepScroll++;
    lastStep = step;
    if (!marks['step' + step]) { mark('step' + step); progress(); }
  });
  // 창을 닫거나 다른 앱으로 나갈 때: 완성 전이면 '나감'을 남겨요(이탈 지점).
  let leaveSent = false;
  function leave() { if (completed || leaveSent || consent !== 'yes') return; leaveSent = true; void send(base('leave'), { beacon: true }); }
  addEventListener('pagehide', leave);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') leave(); else leaveSent = false; });

  /* ───────── 입력값 정리 (이미지 데이터는 빼고 개수 · 이름만) ───────── */
  function values() {
    const ctx = window.MorogaroReview?.getContext?.(), data = window.MorogaroReview?.getData?.();
    if (!ctx || !data) return {};
    const f = ctx.form, r = ctx.result;
    const auto = Object.entries(r.values || {}).filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && !v.length)).map(([k]) => k);
    const aiFields = r.aiAppliedFields || [];
    const filled = r.mode === 'ai' ? aiFields : auto;
    const edited = ctx.touched.filter(k => filled.includes(k));
    return {
      title: f.title || '', projectType: r.projectType, stage: f.stage || '', stageBy: ctx.touched.includes('stage') ? '직접 선택' : (r.mode === 'ai' && aiFields.includes('stage') ? 'AI 판단' : (f.stage ? '파일에서 추출' : '미정')),
      stageReason: r.values?.stageReason || '',
      categories: f.categories || [], tools: f.tools || [], tags: f.tags || [],
      startDate: f.startDate || '', endDate: f.endDate || '', physical: f.physical ?? null, materials: f.materials || '', lessons: f.lessons || '',
      dimensions: f.dimensions || null, colorMode: f.colorMode || '', palette: f.palette || [], fonts: (f.fonts || []).map(x => ({ name: x.name, weights: x.weights, source: x.source || x.url || '' })),
      batonNote: f.batonNote || '', nextIdeas: (f.nextIdeas || []).filter(Boolean), noteChecklist: f.noteChecklist || {}, noteDraftByAI: f.noteDraft?.origin === 'ai',
      references: (f.references || []).length, thumbnails: (data.selectedThumbnails || []).length,
      sources: (data.sources || []).map(s => ({ name: s.name, ext: s.ext, kind: s.kind, size: s.size })), urls: data.urls || [],
      ai: { mode: r.mode, filledFields: filled, filledCount: filled.length, editedFields: edited, editedCount: edited.length, touchedAll: ctx.touched },
    };
  }

  /* ───────── 캡처 ───────── */
  const shot = window.modernScreenshot;
  const withTimeout = (promise, ms) => Promise.race([promise, new Promise(resolve => setTimeout(() => resolve(null), ms))]);
  // 업로드 페이지 전체: 나눠 둔 두 페이지(파일 확인 · 바톤 노트)를 잠깐 한 장으로 펼쳐서 찍어요.
  async function captureUpload() {
    const workspace = document.querySelector('.workspace');
    if (!shot || !workspace || workspace.hidden) return null;
    const previous = root.dataset.makerPage, y = scrollY;
    root.dataset.makerPage = 'capture';
    root.classList.add('is-capturing');
    try {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return await withTimeout(shot.domToJpeg(workspace, { backgroundColor: '#FAFAFA', quality: 0.86, scale: Math.min(1.5, devicePixelRatio || 1), timeout: 15000 }), 20000);
    } catch { return null; }
    finally { root.dataset.makerPage = previous; root.classList.remove('is-capturing'); scrollTo({ top: y, behavior: 'instant' }); }
  }

  let pending = null;          // { record, uploadImage }
  let currentId = null;
  // detail.js가 바톤을 저장한 직후, 상세페이지를 띄우기 전에 불러요.
  async function beforeShow(record) {
    if (!record || record.preview) return;
    mark('batonCreated', false);
    completed = true; currentId = record.id;
    const uploadImage = await captureUpload();
    const works = (window.MorogaroReview?.getData?.()?.selectedThumbnails || []).map(t => t?.dataUrl).filter(u => /^data:image\//.test(u || '')).slice(0, 6);
    pending = { record, uploadImage, values: values(), works };
    // 상세페이지 캡처가 오지 않으면(창을 바로 닫는 등) 30초 뒤 캡처 없이라도 보내요.
    setTimeout(() => afterDetail(record.id, null), 30000);
  }
  // 상세페이지 캡처가 도착하면(또는 못 받으면) 완성 기록을 보내요.
  async function afterDetail(id, detailImage) {
    if (!pending || id !== currentId) return;
    const { uploadImage, values: v, works } = pending; pending = null;
    const total = Math.round((marks.batonCreated - started) / 100) / 10;
    void send({ ...base('complete'), lastStep: 6, totalSeconds: total, batonId: id, values: v, images: { upload: uploadImage, detail: detailImage || null, works } });
    // 같은 창에서 다시 하면 새 참여로 기록돼요.
    try { sessionStorage.removeItem('morogaro-research-session'); } catch { /* */ }
    setTimeout(showSurvey, 1200);
  }

  /* ───────── 완성 후 설문 버튼 ───────── */
  let formShown = false;
  async function showSurvey() {
    if (formShown || !APPS) return; formShown = true;
    let c; try { c = await (await fetch(APPS + '?action=config')).json(); } catch { formShown = false; return; }
    if (!c.formUrl) { formShown = false; return; }
    const url = c.formUrl.replace(/\/(viewform|edit).*$/, '/viewform') + (c.formEntry ? `?usp=pp_url&entry.${c.formEntry}=${encodeURIComponent(sessionId)}` : '');
    const box = document.createElement('aside');
    box.className = 'survey-cta'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', '사용성 평가 설문');
    box.innerHTML = `<button class="survey-close" type="button" aria-label="닫기">×</button>
      <strong>사용성 평가 후기를 남겨주시면 저희에게<br>큰 도움이 됩니다... 작은 선물도 준비했답니다...🎁</strong>
      <span>3분이면 끝나요!</span>
      <a href="${url}" target="_blank" rel="noopener">설문 폼 작성 해주러 가시기 <i aria-hidden="true">→</i></a>`;
    document.body.appendChild(box);
    box.querySelector('.survey-close').addEventListener('click', () => { box.classList.remove('is-in'); box.classList.add('is-min'); });
    box.addEventListener('click', e => { if (box.classList.contains('is-min') && !e.target.closest('a')) { box.classList.remove('is-min'); box.classList.add('is-in'); } });
    requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add('is-in')));
  }

  // 들어온 순간에도 한 줄 남겨요(아무것도 안 하고 나간 사람까지 '이탈 (1 파일 올리기)'로 보이도록).
  progress();

  window.MorogaroResearch = Object.freeze({
    sessionId, beforeShow, afterDetail,
    hasConsent: () => true,
    state: () => ({ sessionId, lastStep, completed, timings: timings(), behavior: { ...behavior } }),
    captureUpload,
  });
})();
