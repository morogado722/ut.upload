/* 모로가도 — 바톤 메이커 1단계
 * No framework, no build step, no backend calls.
 * Files and URLs stay in this browser; IndexedDB stores the actual file blobs.
 * Source frames: FZXlQEh3aOOazKfZSfIYZA / 3421:2057 and 3421:2193.
 */
(() => {
  'use strict';

  /** @typedef {{id:string, name:string, type:string, size:number, lastModified:number, blob:Blob}} BatonFile */
  /** @typedef {{id:string, href:string}} BatonLink */
  /** @typedef {{projectType:'design'|'planning', files:BatonFile[], links:BatonLink[], urlText:string, updatedAt:string|null}} MakerState */

  const DB_NAME = 'morogaro-baton-maker';
  const DB_VERSION = 1;
  const STORE_NAME = 'drafts';
  const DRAFT_KEY = 'upload-step-one';
  const AUTOSAVE_DELAY = 500;
  const TEXT_PREVIEW_BYTES = 128 * 1024;

  /** @type {MakerState} */
  const state = { projectType: 'design', files: [], links: [], urlText: '', updatedAt: null, review: null };
  const ui = {
    input: required('file-input'), dropzone: required('file-dropzone'),
    fileList: required('file-list'), fileCount: required('file-count'),
    urlForm: required('url-form'), urlInput: required('url-input'),
    urlField: required('url-field'), urlList: required('url-list'),
    urlCount: required('url-count'), urlError: required('url-error'),
    save: required('save-button'), saveStatus: required('save-status'),
    saveText: required('save-status-text'), previewButton: required('preview-button'),
    dialog: required('preview-dialog'), previewItems: required('preview-items'),
    previewMedia: required('preview-media'), previewEmpty: required('preview-empty'),
    previewType: required('preview-type'), toast: required('toast'),
    progress: required('completion-track'), progressValue: required('completion-value'),
    progressAnnouncement: required('completion-announcement'),
  };

  /** @type {IDBDatabase|null} */
  let database = null;
  let storageError = null;
  let ready = false;
  let revision = 0;
  let savedRevision = 0;
  let saveTimer = 0;
  let toastTimer = 0;
  let saveChain = Promise.resolve();
  let dragDepth = 0;
  let previewSequence = 0;
  let returnFocus = null;
  let urlEditorOpen = true;
  const objectURLs = new Map();

  /** @param {string} id */
  function required(id) {
    const node = document.getElementById(id);
    if (!node) throw new Error(`Required element is missing: ${id}`);
    return node;
  }

  /** @param {string} tag @param {string} className @param {string=} text */
  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (typeof text === 'string') node.textContent = text;
    return node;
  }

  function makeId() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  /** @param {number} bytes */
  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / (1024 ** index);
    return `${value.toLocaleString('ko-KR', { maximumFractionDigits: index ? 1 : 0 })} ${units[index]}`;
  }

  /** @param {string} message */
  function announce(message) {
    clearTimeout(toastTimer);
    ui.toast.textContent = message;
    ui.toast.hidden = false;
    toastTimer = window.setTimeout(() => { ui.toast.hidden = true; }, 4400);
  }

  /** @param {'idle'|'dirty'|'saving'|'saved'|'error'} kind @param {string} message */
  function setSaveStatus(kind, message) {
    ui.saveStatus.dataset.state = kind;
    ui.saveText.textContent = message;
    if (kind === 'saved') ui.saveStatus.title = '이 기기의 현재 브라우저에 저장됩니다. 서버에 업로드되지 않습니다.';
  }

  function savedTime(iso) {
    return new Intl.DateTimeFormat('ko-KR', {
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(new Date(iso));
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('이 브라우저에서는 기기 내 저장을 사용할 수 없어요.'));
        return;
      }
      let settled = false;
      let request;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      };
      const timeout = setTimeout(() => fail(new Error('브라우저 저장소에 연결하지 못했어요.')), 5000);
      try { request = indexedDB.open(DB_NAME, DB_VERSION); }
      catch (error) { fail(error); return; }
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => {
        if (settled) { request.result.close(); return; }
        settled = true;
        clearTimeout(timeout);
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          database = null;
          storageError = new Error('저장소가 변경됐어요. 새로고침 후 다시 저장해 주세요.');
          setSaveStatus('error', '새로고침 후 저장해 주세요');
        };
        resolve(db);
      };
      request.onerror = () => fail(request.error || new Error('브라우저 저장소 오류'));
      request.onblocked = () => fail(new Error('다른 모로가도 탭을 닫은 뒤 다시 열어 주세요.'));
    });
  }

  function readDraft() {
    return new Promise((resolve, reject) => {
      if (!database) { reject(storageError || new Error('저장소를 사용할 수 없어요.')); return; }
      const tx = database.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(DRAFT_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
      tx.onabort = () => reject(tx.error || new Error('임시 저장을 읽지 못했어요.'));
    });
  }

  function writeDraft(snapshot) {
    return new Promise((resolve, reject) => {
      if (!database) { reject(storageError || new Error('저장소를 사용할 수 없어요.')); return; }
      let tx;
      try {
        tx = database.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(snapshot);
      } catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('저장하지 못했어요.'));
      tx.onabort = () => reject(tx.error || new Error('브라우저 저장 공간이 부족하거나 저장이 차단되었어요.'));
    });
  }

  function snapshot() {
    return {
      id: DRAFT_KEY, schemaVersion: 1, projectType: state.projectType,
      files: state.files.map((file) => ({ ...file })),
      links: state.links.map((link) => ({ ...link })),
      urlText: state.urlText, review: state.review, updatedAt: new Date().toISOString(),
    };
  }

  /** Saves are serialized, so older snapshots can never overwrite newer ones.
   * A success label appears only after the IndexedDB transaction commits.
   * @param {boolean=} manual
   * @returns {Promise<boolean>}
   */
  async function saveDraft(manual = false) {
    if (!ready) return false;
    clearTimeout(saveTimer);
    const saveRevision = revision;
    const data = snapshot();
    setSaveStatus('saving', '이 브라우저에 저장 중...');
    const thisSave = saveChain.catch(() => {}).then(() => writeDraft(data));
    saveChain = thisSave;
    try {
      await thisSave;
      savedRevision = Math.max(savedRevision, saveRevision);
      state.updatedAt = data.updatedAt;
      if (revision === saveRevision) {
        setSaveStatus('saved', `${savedTime(data.updatedAt)} ${manual ? '임시' : '자동'} 저장 완료`);
      }
      if (manual) announce('이 브라우저에 임시 저장했어요. 바톤은 아직 업로드되지 않았어요.');
      return true;
    } catch (error) {
      const quota = error?.name === 'QuotaExceededError';
      setSaveStatus('error', quota ? '저장 공간이 부족해요' : '저장하지 못했어요');
      ui.saveStatus.title = '현재 변경 사항이 저장되지 않았습니다. 파일은 이 페이지에 남아 있지만 창을 닫으면 유실될 수 있습니다.';
      if (manual) announce(quota ? '브라우저 저장 공간이 부족해요. 파일을 줄인 뒤 다시 저장해 주세요.' : '기기 내 저장을 사용할 수 없어요. 창을 닫기 전 브라우저 설정을 확인해 주세요.');
      return false;
    }
  }

  function changed() {
    revision += 1;
    setSaveStatus('dirty', '변경 사항을 저장할게요');
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => { void saveDraft(false); }, AUTOSAVE_DELAY);
  }

  /** URL validation is local only: no requests, scraping or link-unfurl API.
   * @param {string} raw
   * @returns {string}
   */
  function normalizeURL(raw) {
    let candidate = raw.trim();
    if (!candidate) throw new Error('추가할 링크를 먼저 입력해 주세요.');
    if (/^[\s\S]*[\u0000-\u001F\u007F]/u.test(candidate)) throw new Error('올바른 웹 주소를 입력해 주세요.');
    if (candidate.startsWith('//')) candidate = `https:${candidate}`;
    else if (!/^[a-z][a-z\d+.-]*:/i.test(candidate)) candidate = `https://${candidate}`;
    let url;
    try { url = new URL(candidate); }
    catch { throw new Error('올바른 웹 주소를 입력해 주세요. 예: https://www.figma.com'); }
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname) {
      throw new Error('http 또는 https로 시작하는 웹 주소만 추가할 수 있어요.');
    }
    if (url.username || url.password) throw new Error('계정 정보가 포함되지 않은 링크를 입력해 주세요.');
    if (!url.hostname.includes('.') && url.hostname !== 'localhost' && !url.hostname.startsWith('[')) {
      throw new Error('도메인을 확인해 주세요. 예: www.figma.com');
    }
    return url.href;
  }

  function clearURLError() {
    ui.urlError.hidden = true;
    ui.urlError.textContent = '';
    ui.urlInput.removeAttribute('aria-invalid');
    ui.urlField.classList.remove('is-invalid');
  }

  function showURLError(message) {
    ui.urlError.textContent = message;
    ui.urlError.hidden = false;
    ui.urlInput.setAttribute('aria-invalid', 'true');
    ui.urlField.classList.add('is-invalid');
    ui.urlInput.focus();
  }

  function addURL(event) {
    event.preventDefault();
    if (!ready) return;
    clearURLError();
    let href;
    try { href = normalizeURL(ui.urlInput.value); }
    catch (error) { showURLError(error.message); return; }
    if (state.links.some((link) => link.href === href)) {
      showURLError('이미 추가한 링크예요. 다른 링크를 입력해 주세요.');
      return;
    }
    state.links.push({ id: makeId(), href });
    state.urlText = '';
    ui.urlInput.value = '';
    urlEditorOpen = false;
    renderURLs();
    changed();
    announce('링크를 추가했어요.');
    required('add-link-button').focus({ preventScroll: true });
    return true;
  }

  function removeURL(id) {
    state.links = state.links.filter((link) => link.id !== id);
    renderURLs();
    changed();
    announce('링크를 삭제했어요.');
    (ui.urlField.hidden ? required('add-link-button') : ui.urlInput).focus({ preventScroll: true });
  }

  function addFiles(fileList) {
    if (!ready) return;
    const incoming = Array.from(fileList || []);
    let added = 0;
    let duplicate = 0;
    for (const file of incoming) {
      if (!(file instanceof File)) continue;
      const exists = state.files.some((entry) => entry.name === file.name && entry.size === file.size && entry.lastModified === file.lastModified && entry.type === file.type);
      if (exists) { duplicate += 1; continue; }
      state.files.push({
        id: makeId(), name: file.name, size: file.size,
        type: file.type || '', lastModified: file.lastModified || 0, blob: file,
      });
      added += 1;
    }
    ui.input.value = '';
    if (added) {
      renderFiles();
      changed();
      announce(`${added}개 파일을 추가했어요.${duplicate ? ` 중복 파일 ${duplicate}개는 제외했어요.` : ''}`);
    } else if (duplicate) announce('이미 추가한 파일이에요.');
    else if (incoming.length === 0) announce('폴더 대신 파일을 선택해서 추가해 주세요.');
  }

  function removeFile(id) {
    state.files = state.files.filter((file) => file.id !== id);
    if (objectURLs.has(id)) {
      URL.revokeObjectURL(objectURLs.get(id));
      objectURLs.delete(id);
    }
    renderFiles();
    changed();
    announce('파일을 목록에서 삭제했어요. 원본 파일은 그대로예요.');
    ui.dropzone.focus({ preventScroll: true });
  }

  function fileURL(file) {
    if (!objectURLs.has(file.id)) objectURLs.set(file.id, URL.createObjectURL(file.blob));
    return objectURLs.get(file.id);
  }

  function isRaster(file) {
    return /^image\/(png|jpe?g|gif|webp|avif|bmp)$/i.test(file.type);
  }

  function fileThumbnail(file) {
    if (isRaster(file)) {
      const image = element('img', 'file-thumb');
      image.src = fileURL(file);
      image.alt = '';
      image.loading = 'lazy';
      image.addEventListener('error', () => image.replaceWith(fileExtension(file)), { once: true });
      return image;
    }
    return fileExtension(file);
  }

  function extensionOf(file) {
    return file.name.lastIndexOf('.') > 0 ? file.name.split('.').pop().toLowerCase() : '';
  }

  function fileExtension(file) {
    const ext = extensionOf(file);
    const label = ({ ai: 'Ai.', pdf: 'Pdf.', docx: 'docx.' })[ext] || (ext ? `${ext.slice(0, 6)}.` : 'FILE');
    return element('span', 'file-extension', label);
  }

  function fileInfo(file) {
    const info = element('span', 'file-info');
    const displayName = extensionOf(file) ? file.name.slice(0, -(extensionOf(file).length + 1)) : file.name;
    const name = element('span', 'file-name', displayName || file.name);
    name.title = file.name;
    const ext = extensionOf(file);
    info.append(name, element('span', 'file-meta', `${ext ? `${ext} ` : ''}파일· ${formatBytes(file.size).replace(' ', '')}`));
    return info;
  }

  function trashButton(label, onRemove) {
    const button = element('button', 'remove-button');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.title = label;
    const icon = element('img', '');
    icon.src = './assets/trash.svg';
    icon.alt = '';
    icon.dataset.nodeId = '3421:2335';
    button.append(icon);
    button.addEventListener('click', onRemove);
    return button;
  }

  function fileRow(file, inPreview = false) {
    const row = element(inPreview ? 'div' : 'li', 'file-row');
    row.dataset.fileId = file.id;
    const open = element('button', 'file-open');
    open.type = 'button';
    open.setAttribute('aria-label', `${file.name} 미리보기`);
    open.append(inPreview ? fileThumbnail(file) : fileExtension(file), fileInfo(file));
    open.addEventListener('click', () => {
      if (inPreview) void showFilePreview(file);
      else openPreview(file.id);
    });
    row.append(open);
    if (!inPreview) {
      row.append(trashButton(`${file.name} 삭제`, () => removeFile(file.id)));
    }
    return row;
  }

  function renderFiles() {
    ui.fileCount.value = String(state.files.length);
    ui.fileCount.textContent = String(state.files.length);
    ui.fileList.replaceChildren(...state.files.map((file) => fileRow(file)));
    ui.fileList.hidden = state.files.length === 0;
    renderAttachmentState();
  }

  function linkRow(link, inPreview = false) {
    const row = element(inPreview ? 'div' : 'li', 'url-row');
    const slot = element('span', 'link-icon-slot');
    slot.setAttribute('aria-hidden', 'true');
    const icon = element('img', '');
    icon.src = './assets/link.svg';
    icon.alt = '';
    icon.dataset.nodeId = '3421:2324';
    slot.append(icon);
    row.append(slot);
    const anchor = element('a', '', link.href.replace(/\/$/, ''));
    anchor.href = link.href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.setAttribute('aria-label', `${link.href}, 새 탭에서 열기`);
    row.append(anchor);
    if (!inPreview) {
      row.append(trashButton(`${link.href} 삭제`, () => removeURL(link.id)));
    }
    return row;
  }

  function renderURLs() {
    ui.urlCount.value = String(state.links.length);
    ui.urlCount.textContent = String(state.links.length);
    ui.urlList.replaceChildren(...state.links.map((link) => linkRow(link)));
    ui.urlList.hidden = state.links.length === 0;
    ui.urlField.hidden = state.links.length > 0 && !urlEditorOpen && !state.urlText;
    required('add-link-button').setAttribute('aria-expanded', String(!ui.urlField.hidden));
    renderAttachmentState();
  }

  // Product rule: choosing a file is the major milestone. Additional files/URLs
  // do not add points. Remaining milestones belong to future screens, not here.
  function getUploadProgress() {
    if (!state.files.length) return 0;
    return Math.max(50, Math.min(100, Number(window.MorogaroProgressBoost) || 0));   // 다음 단계 진행에 따라 올라가요(progress-boost.js)
  }

  function renderUploadProgress() {
    const percent = getUploadProgress();
    const previous = Number(ui.progress.getAttribute('aria-valuenow'));
    const description = percent >= 100 ? '바톤 업로드 준비 100%. 이제 업로드할 수 있어요.'
      : percent >= 50 ? `바톤 업로드 준비 ${percent}%.`
      : '바톤 업로드 준비 0%. 파일을 추가해 주세요.';
    // Visual width, visible label and accessibility value share one source.
    ui.progress.style.setProperty('--upload-progress', `${percent}%`);
    ui.progress.setAttribute('aria-valuenow', String(percent));
    ui.progress.setAttribute('aria-valuetext', description);
    ui.progressValue.textContent = `${percent}%`;
    if (previous !== percent) ui.progressAnnouncement.textContent = description;
  }

  document.addEventListener('morogaro:progress-refresh', () => renderUploadProgress());
  function renderAttachmentState() {
    const hasFiles = state.files.length > 0;
    renderUploadProgress();
    const stage = document.querySelector('.stage');
    stage.classList.toggle('has-files', hasFiles);
    stage.dataset.nodeId = hasFiles ? '3421:2193' : '3421:2057';
    const card = document.querySelector('.step-card');
    // Actions have one stable position in each responsive layout. Never reparent
    // the save button when a file is selected or the final attachment is removed.
    required('completion-hint').textContent = hasFiles
      ? '파일을 올리면 절반이 완성돼요.' : '파일을 올리면 절반이 완성돼요.';
    required('drop-title').textContent = hasFiles
      ? '파일을 올린 것만으로 벌써 절반!' : '파일을 업로드하면 내 바톤 메이킹이 시작돼요!';
    required('drop-detail').textContent = hasFiles
      ? '더 많은 파일을 올릴수록 바톤이 상세해져요:)' : '어떤 파일이든 올려보세요:)';
    ui.dropzone.setAttribute('aria-label', hasFiles ? '바톤 파일 더 선택' : '바톤 파일 선택');
    // These are the two original Figma glow exports, not approximated gradients.
    const top = document.querySelector('.glow-top');
    const bottom = document.querySelector('.glow-bottom');
    const topSrc = hasFiles ? './assets/glow-top-loaded.svg' : './assets/glow-top.svg';
    const bottomSrc = hasFiles ? './assets/glow-bottom-loaded.svg' : './assets/glow-bottom.svg';
    if (top.getAttribute('src') !== topSrc) top.src = topSrc;
    if (bottom.getAttribute('src') !== bottomSrc) bottom.src = bottomSrc;
    top.dataset.nodeId = hasFiles ? '3421:2194' : '3421:2058';
    bottom.dataset.nodeId = hasFiles ? '3421:2195' : '3421:2059';
    document.querySelector('.file-panel .panel-art').dataset.nodeId = hasFiles ? '3421:2261' : '3421:2126';
    card.dataset.nodeId = '3571:3018';
    const hasAttachments = state.files.length + state.links.length > 0;
    required('upload-actions').hidden = !hasAttachments;
    const parts = [];
    if (state.files.length) parts.push(`파일 ${state.files.length}개`);
    if (state.links.length) parts.push(`링크 ${state.links.length}개`);
    required('upload-summary').textContent = hasAttachments ? `${parts.join(' · ')}를 준비했어요.` : '';
    document.dispatchEvent(new CustomEvent('morogaro:attachments-changed')); // summary kept concise beneath the action button
  }

  function requestNextStep() {
    if (!ready || window.MorogaroLoading?.isOpen()) return;
    if (!ui.urlField.hidden && ui.urlInput.value.trim()) {
      if (!addURL({ preventDefault() {} })) return;
    }
    if (!state.files.length && !state.links.length) { ui.dropzone.focus(); return; }
    // Never pretend a server upload or a step-2 screen exists. A host router
    // can preventDefault() and consume detail.payload to implement step 2.
    const event = new CustomEvent('morogaro:next', {
      cancelable: true,
      detail: { from: 1, to: 2, payload: window.MorogaroMaker.getPayload() },
    });
    if (document.dispatchEvent(event)) {
      announce('파일과 링크가 준비됐어요. 다음 단계인 파일 정보 확인 화면은 아직 연결하지 않았어요.');
    }
  }

  function stopMedia() {
    ui.previewMedia.querySelectorAll('video, audio').forEach((media) => media.pause());
    ui.previewMedia.replaceChildren();
    ui.previewMedia.hidden = true;
  }

  async function showFilePreview(file) {
    const sequence = ++previewSequence;
    stopMedia();
    ui.previewMedia.hidden = false;
    let media;
    if (isRaster(file)) {
      media = element('img', 'preview-image');
      media.alt = file.name;
      media.src = fileURL(file);
    } else if (file.type.startsWith('video/')) {
      media = element('video', 'preview-video');
      media.controls = true;
      media.preload = 'metadata';
      media.src = fileURL(file);
    } else if (file.type.startsWith('audio/')) {
      media = element('audio', 'preview-audio');
      media.controls = true;
      media.preload = 'metadata';
      media.src = fileURL(file);
    } else if (file.type.startsWith('text/') || /\.(txt|md|csv|json|css|js|ts|html|xml|svg)$/i.test(file.name)) {
      // User HTML, SVG and scripts are shown ONLY as escaped text, never executed.
      media = element('pre', 'preview-text', '파일을 읽고 있어요...');
      ui.previewMedia.append(media);
      try {
        const text = await file.blob.slice(0, TEXT_PREVIEW_BYTES).text();
        if (sequence !== previewSequence || !ui.dialog.open) return;
        media.textContent = text || '(빈 텍스트 파일이에요.)';
        if (file.size > TEXT_PREVIEW_BYTES) media.textContent += '\n\n… 미리보기는 앞부분 128 KB만 표시해요. 원본은 그대로 저장돼요.';
      } catch {
        if (sequence !== previewSequence) return;
        media.textContent = '이 파일의 텍스트 미리보기를 불러오지 못했어요.';
      }
    } else {
      media = element('p', 'preview-caption', '이 형식은 파일 정보로 확인할 수 있어요. 원본 파일은 변경 없이 보관돼요.');
    }
    if (sequence !== previewSequence || !ui.dialog.open) return;
    if (!media.parentNode) ui.previewMedia.append(media);
    if (['IMG', 'VIDEO', 'AUDIO'].includes(media.tagName)) {
      media.addEventListener('error', () => {
        if (sequence === previewSequence) media.replaceWith(element('p', 'preview-caption', '이 브라우저에서 미리보기를 표시할 수 없어요. 추가한 원본 파일은 그대로예요.'));
      }, { once: true });
    }
    ui.previewMedia.append(element('p', 'preview-caption', `${file.name} · ${formatBytes(file.size)}`));
  }

  function openPreview(fileId) {
    if (!ready) return;
    returnFocus = document.activeElement;
    ui.previewType.textContent = state.projectType === 'design' ? '디자인 프로젝트' : '기획 프로젝트';
    ui.previewItems.replaceChildren(
      ...state.files.map((file) => fileRow(file, true)),
      ...state.links.map((link) => linkRow(link, true)),
    );
    ui.previewEmpty.hidden = state.files.length + state.links.length > 0;
    stopMedia();
    if (!ui.dialog.open) ui.dialog.showModal();
    const selected = state.files.find((file) => file.id === fileId) || state.files[0];
    if (selected) void showFilePreview(selected);
  }

  function restoreDraft(data) {
    if (!data || data.schemaVersion !== 1) return;
    state.projectType = data.projectType === 'planning' ? 'planning' : 'design';
    state.review = data.review && data.review.version === 1 ? data.review : null;
    state.urlText = typeof data.urlText === 'string' ? data.urlText : '';
    state.updatedAt = typeof data.updatedAt === 'string' && Number.isFinite(Date.parse(data.updatedAt)) ? data.updatedAt : null;
    state.files = Array.isArray(data.files) ? data.files.filter((file) => file && typeof file.id === 'string' && typeof file.name === 'string' && file.blob instanceof Blob).map((file) => ({
      id: file.id, name: file.name, type: file.type || file.blob.type || '',
      size: file.blob.size, lastModified: Number(file.lastModified) || 0, blob: file.blob,
    })) : [];
    state.links = [];
    if (Array.isArray(data.links)) {
      for (const link of data.links) {
        try {
          const href = normalizeURL(String(link.href));
          if (!state.links.some((entry) => entry.href === href)) state.links.push({ id: typeof link.id === 'string' ? link.id : makeId(), href });
        } catch { /* Ignore invalid/corrupt stored links, never insert unsanitized URLs. */ }
      }
    }
  }

  function wireEvents() {
    const summary = required('step-summary');
    summary.addEventListener('click', () => {
      const expanded = summary.getAttribute('aria-expanded') !== 'true';
      summary.setAttribute('aria-expanded', String(expanded));
      document.querySelector('.step-card').classList.toggle('steps-expanded', expanded);
    });
    document.addEventListener('morogaro:feedback', (event) => {
      if (typeof event.detail?.message === 'string') announce(event.detail.message);
    });
    ui.dropzone.addEventListener('click', () => { if (ready) ui.input.click(); });
    ui.input.addEventListener('change', () => { if (ui.input.files?.length) addFiles(ui.input.files); });
    ui.urlForm.addEventListener('submit', addURL);
    required('add-link-button').addEventListener('click', () => {
      if (!ready) return;
      if (!ui.urlField.hidden && ui.urlInput.value.trim()) { addURL({ preventDefault() {} }); return; }
      urlEditorOpen = true;
      renderURLs();
      ui.urlInput.focus({ preventScroll: true });
    });
    required('add-link-button').setAttribute('aria-controls', 'url-field');
    required('next-button').addEventListener('click', requestNextStep);
    ui.urlInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.links.length && !ui.urlInput.value.trim()) {
        event.preventDefault();
        urlEditorOpen = false;
        clearURLError();
        renderURLs();
        required('add-link-button').focus({ preventScroll: true });
      }
    });
    ui.urlInput.addEventListener('input', () => {
      clearURLError();
      state.urlText = ui.urlInput.value;
      if (ready) changed();
    });
    document.querySelectorAll('input[name="project-type"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        if (!radio.checked || !ready) return;
        state.projectType = radio.value === 'planning' ? 'planning' : 'design';
        changed();
      });
    });
    ui.save.addEventListener('click', () => { void saveDraft(true); });
    ui.previewButton.addEventListener('click', () => openPreview());
    required('close-preview').addEventListener('click', () => ui.dialog.close());
    required('preview-done').addEventListener('click', () => ui.dialog.close());
    ui.dialog.addEventListener('close', () => {
      previewSequence += 1;
      stopMedia();
      if (returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus();
    });
    ui.dialog.addEventListener('click', (event) => {
      const rect = ui.dialog.getBoundingClientRect();
      if (event.target === ui.dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) ui.dialog.close();
    });
    document.querySelectorAll('[data-step]').forEach((button) => {
      button.addEventListener('click', () => {
        const event = new CustomEvent('morogaro:step', {cancelable:true, detail:{step:Number(button.dataset.step)}});
        if (!document.dispatchEvent(event)) return;
        if (button.dataset.step === '1') ui.dropzone.focus();
        else announce('이 다음 단계 화면은 아직 연결하지 않았어요.');
      });
    });
    document.querySelectorAll('[data-context]').forEach((button) => {
      button.addEventListener('click', () => {
        const route = button.dataset.context;
        const navigation = new CustomEvent('morogaro:navigate', { detail: { route }, cancelable: true });
        if (!document.dispatchEvent(navigation)) return;
        const text = {
          explore: '탐색 화면은 아직 연결하지 않았어요.',
          community: '커뮤니티 화면은 아직 연결하지 않았어요.',
          'baton-center': '지금 바톤 올리기 화면이에요.',
          personality: '성향 검사 화면은 아직 연결하지 않았어요.',
          saved: '저장한 바톤 화면은 아직 연결하지 않았어요. 이 화면의 임시 저장은 아래 버튼으로 사용할 수 있어요.',
          notifications: '알림 기능은 아직 연결하지 않았어요.',
          profile: '현재는 피그마에 있는 예시 프로필이에요. 실제 로그인은 연결하지 않았어요.',
        }[button.dataset.context];
        if (text) announce(text);
      });
    });
    const hasFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');
    window.addEventListener('dragover', (event) => { if (hasFiles(event)) event.preventDefault(); });
    window.addEventListener('drop', (event) => { if (hasFiles(event)) event.preventDefault(); });
    ui.dropzone.addEventListener('dragenter', (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth += 1;
      ui.dropzone.classList.add('is-dragover');
    });
    ui.dropzone.addEventListener('dragover', (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    });
    ui.dropzone.addEventListener('dragleave', () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) ui.dropzone.classList.remove('is-dragover');
    });
    ui.dropzone.addEventListener('drop', (event) => {
      event.preventDefault();
      dragDepth = 0;
      ui.dropzone.classList.remove('is-dragover');
      addFiles(event.dataTransfer?.files);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && revision > savedRevision) void saveDraft(false);
    });
    window.addEventListener('beforeunload', (event) => {
      if (revision > savedRevision) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
    window.addEventListener('pagehide', (event) => {
      if (!event.persisted) objectURLs.forEach((url) => URL.revokeObjectURL(url));
    });
  }

  async function initialize() {
    ui.save.disabled = true;
    ui.dropzone.disabled = true;
    wireEvents();
    try {
      database = await openDatabase();
      restoreDraft(await readDraft());
      if (state.updatedAt) setSaveStatus('saved', `${savedTime(state.updatedAt)} 임시 저장 불러옴`);
    } catch (error) {
      storageError = error;
      setSaveStatus('error', '기기 내 저장을 사용할 수 없어요');
    }
    document.querySelectorAll('input[name="project-type"]').forEach((radio) => { radio.checked = radio.value === state.projectType; });
    ui.urlInput.value = state.urlText;
    urlEditorOpen = !state.links.length || Boolean(state.urlText);
    renderFiles();
    renderURLs();
    ready = true;
    ui.save.disabled = false;
    ui.dropzone.disabled = false;
    document.documentElement.dataset.makerReady = 'true';
    document.dispatchEvent(new CustomEvent('morogaro:ready'));
  }

  // Small integration seam for the next screen. No API endpoint is assumed.
  // getState() exposes metadata; getPayload() additionally provides original blobs.
  Object.defineProperty(window, 'MorogaroMaker', {
    value: Object.freeze({
      getState: () => ({
        projectType: state.projectType,
        uploadProgress: getUploadProgress(),
        files: state.files.map(({ blob, ...metadata }) => ({ ...metadata })),
        links: state.links.map((link) => ({ ...link })),
        updatedAt: state.updatedAt, urlText: state.urlText,
        isSaved: Boolean(database) && revision === savedRevision && state.updatedAt !== null,
        storageAvailable: Boolean(database),
      }),
      getPayload: () => ({
        projectType: state.projectType,
        files: state.files.map((file) => new File([file.blob], file.name, { type: file.type, lastModified: file.lastModified })),
        urls: state.links.map((link) => link.href),
      }),
      saveDraft: () => saveDraft(true),
      getReview: () => state.review ? structuredClone(state.review) : null,
      setReview: (review) => {
        if (!ready || !review || review.version !== 1) return false;
        state.review = structuredClone(review); changed(); return true;
      },
      openPreview: () => openPreview(),
    }),
  });

  void initialize();
})();
