/* 결과 화면: 바톤 메이커 → v10 상세페이지 연결
 *
 * 메이커에서 "바톤 만들기"를 누르면 작성한 정보와 원본 파일을 하나의 기록으로 묶어
 * 이 브라우저(IndexedDB)에 저장하고, v10 상세페이지(baton/index.html)를 화면 위에 띄워
 * 그 기록을 보내요. 상세페이지는 받은 기록으로 제목·이미지·정보·파일을 채웁니다.
 * 공개 업로드 서비스는 아니에요. 서버 연결 전에는 다른 사용자에게 보이지 않아요.
 *
 * 메시지 형식은 baton/baton-render.js 맨 위 설명을 참고하세요.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const review = window.MorogaroReview;
  if (!review || !$('baton-detail')) return;
  const root = $('baton-detail'), workspace = document.querySelector('.workspace'), stage = document.querySelector('.stage');
  const E = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const OWNER_NAME = '방문자';
  const DETAIL_PAGE = 'baton/index.html?embed=1#detail';

  let captureFor = null;   // 상세페이지가 다 그려지면 캡처를 요청할 바톤
  let record = null, frame = null, dbPromise = null, saving = false, pending = null, lastFocus = null, routeSerial = 0;
  const memory = new Map();

  /* ───────── 이 브라우저의 바톤 기록 (IndexedDB) ───────── */
  function database() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      let settled = false, request;
      const timer = setTimeout(() => { if (!settled) { settled = true; reject(new Error('기기 내 저장소가 응답하지 않아요.')); } }, 5000);
      try { request = indexedDB.open('morogaro-baton-results', 1); } catch (e) { clearTimeout(timer); reject(e); return; }
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('batons')) request.result.createObjectStore('batons', { keyPath: 'id' }); };
      request.onsuccess = () => { if (settled) { request.result.close(); return; } settled = true; clearTimeout(timer); request.result.onversionchange = () => { request.result.close(); dbPromise = null; }; resolve(request.result); };
      request.onerror = () => { clearTimeout(timer); settled = true; reject(request.error); };
      request.onblocked = () => { clearTimeout(timer); settled = true; reject(new Error('다른 모로가도 탭을 닫고 다시 시도해 주세요.')); };
    }).catch(e => { dbPromise = null; throw e; });
    return dbPromise;
  }
  async function put(value) {
    const db = await database();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('batons', 'readwrite'); tx.objectStore('batons').put(value);
      tx.oncomplete = resolve; tx.onabort = () => reject(tx.error || new Error('저장하지 못했어요.')); tx.onerror = () => reject(tx.error || new Error('저장하지 못했어요.'));
    });
    memory.set(value.id, value);
  }
  async function get(id) {
    if (memory.has(id)) return memory.get(id);
    const db = await database();
    return new Promise((resolve, reject) => { const tx = db.transaction('batons', 'readonly'), req = tx.objectStore('batons').get(id); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
  }
  function build(data, payload, preview = false) {
    return { version: 1, id: 'baton-' + (crypto.randomUUID?.() || Date.now() + '-' + Math.random().toString(36).slice(2)), createdAt: new Date().toISOString(), data: structuredClone(data), files: [...payload.files], draftFingerprint: review.getContext()?.fingerprint || null, bookmarked: false, preview };
  }
  function message(title, body) { lastFocus = document.activeElement; $('detail-message-title').textContent = title; $('detail-message-body').textContent = body; $('detail-message-dialog').showModal(); }

  /* ───────── v10 상세페이지 띄우기 ───────── */
  function closeFrame() {
    if (frame) { frame.remove(); frame = null; }
    root.hidden = true; document.documentElement.classList.remove('is-baton-open');
  }
  function show(value, { replace = false } = {}) {
    if (!value || value.version !== 1 || !value.data) throw new Error('바톤 정보가 없어요.');
    record = value;
    workspace.hidden = true; root.hidden = false; stage.dataset.page = 'detail';
    document.documentElement.classList.add('is-baton-open');
    window.MorogaroAmbient?.set(value.data.stage);
    document.title = (value.data.title || '바톤') + ' · 모로가도';
    const hash = '#baton/' + value.id;
    if (location.hash !== hash) history[replace ? 'replaceState' : 'pushState']({ batonId: value.id }, '', hash);

    // 매번 새로 불러와서 이전 바톤의 상태(스크롤·로그 선택)가 남지 않게 해요.
    if (frame) frame.remove();
    frame = E('iframe', 'baton-frame');
    frame.title = `${value.data.title || '바톤'} 상세페이지`;
    frame.src = DETAIL_PAGE;
    const loading = E('p', 'baton-frame-loading', '상세페이지를 여는 중…');
    root.replaceChildren(loading, frame);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function returnToEditor() {
    if (record?.draftFingerprint && record.draftFingerprint !== review.getContext()?.fingerprint) {
      message('현재 작성 중인 바톤과 다른 기록이에요', '저장된 기록을 잘못 덮어쓰지 않도록 편집을 멈췄어요. 현재 업로드 화면에서 작업 중인 내용을 먼저 확인해 주세요.');
      return;
    }
    closeFrame(); review.showEditor(6);
  }
  async function setBookmark(value) {
    if (!record) return;
    const previous = record.bookmarked; record.bookmarked = value;
    try { if (!record.preview) await put(record); else memory.set(record.id, record); }
    catch { record.bookmarked = previous; message('보관하지 못했어요', '브라우저의 저장 공간과 설정을 확인해 주세요.'); }
  }
  window.addEventListener('message', event => {
    if (!frame || event.source !== frame.contentWindow) return;
    const m = event.data || {};
    if (m.type === 'morogaro:baton-ready' && record) {
      frame.contentWindow.postMessage({ type: 'morogaro:baton', record, ownerName: OWNER_NAME }, '*');
    } else if (m.type === 'morogaro:baton-rendered') {
      root.querySelector('.baton-frame-loading')?.remove();
      frame.focus({ preventScroll: true });
      if (captureFor && record?.id === captureFor) frame.contentWindow.postMessage({ type: 'morogaro:capture-request', id: captureFor }, '*');
    } else if (m.type === 'morogaro:capture') {
      if (m.id === captureFor) { captureFor = null; window.MorogaroResearch?.afterDetail(m.id, m.image); }
    } else if (m.type === 'morogaro:baton-edit') {
      returnToEditor();
    } else if (m.type === 'morogaro:baton-bookmark') {
      void setBookmark(Boolean(m.value));
    }
  });

  /* 바톤 상세페이지 댓글: AI가 이 바톤에 어울리는 댓글 2~3개를 만들어요(Apps Script 연결 시). 실패하면 댓글 없이 열려요. */
  async function aiComments(data) {
    const apps = (window.MOROGARO_CONFIG?.appsScriptUrl || '').trim();
    if (!apps) return null;
    try {
      const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 25000);
      const body = { action: 'comments', context: { title: data.title || '', stage: data.stage || null, categories: data.categories || [], tags: data.tags || [], tools: data.tools || [], note: String(data.batonNote || '').slice(0, 1500), ideas: (data.nextIdeas || []).filter(Boolean) } };
      const r = await fetch(apps, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), signal: ctrl.signal });
      clearTimeout(timer);
      const d = await r.json();
      return Array.isArray(d.comments) && d.comments.length ? d.comments.slice(0, 3) : null;
    } catch { return null; }
  }

  /* ───────── 바톤 만들기 확인 창 ───────── */
  function askFinish(data, payload) {
    pending = { data, payload }; $('finish-error').hidden = true; $('finish-preview').hidden = true;
    const list = E('dl', 'review-summary-list');
    for (const [k, v] of [['바톤 제목', data.title || '새 바톤'], ['진척도', data.stage || '미확인'], ['대표 이미지', (data.selectedThumbnails || []).length + '개'], ['바톤 노트', data.batonNote?.trim() ? '작성했어요' : '남기지 않았어요'], ['이어받을 아이디어', (data.nextIdeas || []).filter(s => s.trim()).length + '개']]) list.append(E('dt', '', k), E('dd', '', v));
    $('finish-summary').replaceChildren(list); $('finish-dialog').showModal(); setTimeout(() => $('finish-confirm').focus({ preventScroll: true }), 30);
  }
  async function finish(preview = false) {
    if (saving || !pending) return;
    saving = true; $('finish-confirm').disabled = true; let value;
    try {
      value = build(pending.data, pending.payload, preview);
      if (!preview) { $('finish-confirm').textContent = '바톤을 만드는 중…'; value.data.aiComments = await aiComments(value.data); }
      if (!preview) await put(value); else memory.set(value.id, value);
      // 사용성 연구(동의한 경우): 상세페이지로 넘어가기 전에 업로드 페이지 전체를 캡처해 둬요.
      if (!preview && window.MorogaroResearch?.hasConsent()) { $('finish-confirm').textContent = '바톤을 만드는 중…'; await window.MorogaroResearch.beforeShow(value); }
      $('finish-dialog').close(); show(value); pending = null; captureFor = preview ? null : value.id;
    }
    catch { $('finish-error').hidden = false; $('finish-error').textContent = '이 브라우저에 저장하지 못했어요. 작성 내용은 그대로이며, 저장 없이 상세페이지를 미리 볼 수 있어요.'; $('finish-preview').hidden = false; }
    finally { saving = false; $('finish-confirm').disabled = false; $('finish-confirm').textContent = finishLabel; }
  }
  document.addEventListener('morogaro:detail-preview', e => { e.preventDefault(); const value = build(e.detail.review, e.detail.payload, true); memory.set(value.id, value); show(value); });
  document.addEventListener('morogaro:publish-request', e => { e.preventDefault(); askFinish(e.detail.review, e.detail.payload); });
  document.addEventListener('morogaro:review-next', e => { e.preventDefault(); if (window.MorogaroStepper?.current() !== 6) { window.MorogaroStepper?.jumpTo(6); } else askFinish(e.detail.review, e.detail.payload); });
  document.addEventListener('morogaro:active-step', e => { const last = e.detail.step === 6; $('review-next').querySelector('.review-next-label').textContent = last ? '업로드 하기' : '다음으로'; const pub = document.getElementById('review-publish'); if (pub) pub.hidden = last; });
  const finishLabel = $('finish-confirm').textContent;
  $('finish-confirm').addEventListener('click', () => void finish());
  $('finish-preview').addEventListener('click', () => void finish(true));
  $('finish-cancel').addEventListener('click', () => $('finish-dialog').close());
  $('detail-message-close').addEventListener('click', () => $('detail-message-dialog').close());
  $('detail-message-dialog').addEventListener('close', () => lastFocus?.isConnected && lastFocus.focus({ preventScroll: true }));

  /* ───────── 주소(#baton/아이디)로 다시 열기 ───────── */
  async function route() {
    const serial = ++routeSerial;
    if (!location.hash.startsWith('#baton/')) return;
    const id = location.hash.slice(7);
    if (!/^baton-[a-z0-9-]+$/i.test(id)) return;
    try {
      const value = await get(id);
      if (serial !== routeSerial || location.hash !== '#baton/' + id) return;
      if (!value) throw new Error();
      show(value, { replace: true });
    } catch {
      if (serial !== routeSerial) return;
      closeFrame(); workspace.hidden = false;
      message('이 브라우저에서 바톤을 찾지 못했어요', '저장하지 않은 미리보기이거나 다른 브라우저에서 만든 주소일 수 있어요. 작성 화면에서 다시 확인해 주세요.');
      if (review.getData()) review.showEditor(2); else { history.replaceState({}, '', '#upload'); window.MorogaroAmbient?.set(null); }
    }
  }
  window.addEventListener('popstate', () => {
    if (location.hash.startsWith('#baton/')) void route();
    else { routeSerial++; if (!root.hidden) { closeFrame(); } }
  });
  if (document.documentElement.dataset.makerReady === 'true') void route(); else document.addEventListener('morogaro:ready', () => void route(), { once: true });
  window.MorogaroDetail = Object.freeze({ isOpen: () => !root.hidden, getData: () => record ? structuredClone(record.data) : null, back: returnToEditor });
})();
