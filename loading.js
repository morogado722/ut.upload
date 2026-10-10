/* morogaro v8 / cancellation-safe Figma loading overlay. No dependency/API.
 * Default = a clearly labelled 4.8s interaction preview, not a fake analysis.
 * Production integration:
 * MorogaroLoading.configure({ analyze: async (payload, {signal}) => result });
 * document.addEventListener('morogaro:analysis-ready', ({detail}) => ...);
 */
(() => {
  'use strict';
  const dialog = document.getElementById('analysis-dialog');
  const title = document.getElementById('analysis-title');
  const note = document.getElementById('analysis-note');
  const cancel = document.getElementById('cancel-analysis');
  const next = document.getElementById('next-button');
  if (!dialog || !title || !note || !cancel || !next) return;
  const root = document.documentElement;
  const config = { analyze: null, previewDuration: 4800, minimumDuration: 400, timeout: 30000 };
  let controller = null;
  let lastFocus = null;
  let nextWasDisabled = false;
  let savedPadding = '';
  let serial = 0;

  function feedback(message) {
    document.dispatchEvent(new CustomEvent('morogaro:feedback', { detail: { message } }));
  }
  function abortError() { return new DOMException('Cancelled', 'AbortError'); }
  function wait(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(abortError()); return; }
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
      function abort() { clearTimeout(timer); reject(abortError()); }
      signal.addEventListener('abort', abort, { once: true });
    });
  }
  function abortable(promise, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(abortError()); return; }
      const onAbort = () => reject(abortError());
      signal.addEventListener('abort', onAbort, { once: true });
      Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    });
  }
  function unlock() {
    root.classList.remove('is-analysis-open');
    document.body.style.paddingRight = savedPadding;
    next.disabled = nextWasDisabled;
    next.removeAttribute('aria-busy');
    window.MorogaroHeader?.sync();
    if (lastFocus instanceof HTMLElement && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
  }
  function close(reason = 'cancelled') {
    if (!dialog.open) return;
    serial += 1;
    controller?.abort();
    controller = null;
    dialog.dataset.state = 'idle';
    dialog.close(reason);
    unlock();
  }
  async function start(payload) {
    if (dialog.open) return false;
    if (!payload || !Array.isArray(payload.files) || !Array.isArray(payload.urls)
        || payload.files.length + payload.urls.length === 0) return false;
    const mySerial = ++serial;
    const localController = new AbortController();
    controller = localController;
    const signal = localController.signal;
    const isPreview = typeof config.analyze !== 'function';
    lastFocus = document.activeElement;
    nextWasDisabled = next.disabled;
    next.disabled = true;
    next.setAttribute('aria-busy', 'true');
    savedPadding = document.body.style.paddingRight;
    // Compensate for a disappearing classic scrollbar, without changing y.
    const scrollbar = window.innerWidth - root.clientWidth;
    if (scrollbar > 0) document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + scrollbar}px`;
    root.classList.add('is-analysis-open');
    title.textContent = '모로가도에서 바톤 분석 중...';
    note.textContent = isPreview
      ? '로딩 인터랙션 미리보기 · 실제 분석 기능은 아직 연결되지 않았어요.'
      : '잠시만 기다려 주세요. 준비한 파일을 확인하고 있어요.';
    dialog.dataset.state = 'loading';
    dialog.dataset.mode = isPreview ? 'preview' : 'connected';
    dialog.dataset.paused = 'false';
    try { dialog.showModal(); }
    catch (error) { controller = null; unlock(); feedback('로딩창을 열지 못했어요. 새로고침 후 다시 시도해 주세요.'); return false; }
    dialog.focus({ preventScroll: true });
    let timeoutId = 0;
    try {
      if (isPreview) {
        await wait(config.previewDuration, signal);
        if (serial !== mySerial || signal.aborted) return false;
        close('preview-complete');
        document.dispatchEvent(new CustomEvent('morogaro:loading-preview-end'));
        feedback('로딩 인터랙션을 확인했어요. 실제 분석과 다음 단계 화면은 아직 연결되지 않았어요.');
      } else {
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = window.setTimeout(() => reject(new Error('확인이 오래 걸리고 있어요. 잠시 후 다시 시도해 주세요.')), config.timeout);
        });
        // The adapter receives File objects and a signal. There is deliberately
        // no URL, model, upload endpoint or fabricated analysis result here.
        const [result] = await Promise.all([
          Promise.race([abortable(Promise.resolve().then(() => config.analyze(payload, { signal })), signal), timeoutPromise]),
          wait(config.minimumDuration, signal),
        ]);
        if (serial !== mySerial || signal.aborted) return false;
        close('complete');
        document.dispatchEvent(new CustomEvent('morogaro:analysis-ready', { detail: { from: 1, to: 2, payload, result } }));
      }
      return true;
    } catch (error) {
      if (serial !== mySerial || signal.aborted || error?.name === 'AbortError') return false;
      localController.abort();
      dialog.dataset.state = 'error';
      title.textContent = '잠시, 확인을 마치지 못했어요.';
      note.textContent = '준비한 파일은 그대로예요. 돌아가서 다시 시도해 주세요.';
      return false;
    } finally { clearTimeout(timeoutId); }
  }
  cancel.addEventListener('click', () => close('cancelled'));
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close('cancelled'); });
  // Native modal focus containment is used. No competing custom focus trap.
  dialog.addEventListener('close', () => {
    if (!dialog.open && controller) { controller.abort(); controller = null; serial += 1; unlock(); }
  });
  document.addEventListener('visibilitychange', () => { dialog.dataset.paused = String(document.hidden); });
  window.addEventListener('pagehide', () => close('navigation'));
  document.addEventListener('morogaro:next', (event) => {
    if (event.defaultPrevented) return;
    event.preventDefault();
    void start(event.detail.payload);
  });
  Object.defineProperty(window, 'MorogaroLoading', { value: Object.freeze({
    isOpen: () => dialog.open,
    start,
    cancel: () => close('cancelled'),
    configure(options = {}) {
      if (dialog.open) throw new Error('Close the loading overlay before changing its configuration.');
      if ('analyze' in options) {
        if (options.analyze !== null && typeof options.analyze !== 'function') throw new TypeError('analyze must be a function or null.');
        config.analyze = options.analyze;
      }
      for (const key of ['previewDuration', 'minimumDuration', 'timeout']) {
        if (!(key in options)) continue;
        const value = Number(options[key]);
        const maximum = key === 'timeout' ? 300000 : 10000;
        if (!Number.isFinite(value) || value < 0 || value > maximum || (key === 'timeout' && value < 100)) throw new RangeError(`${key} is outside its allowed range.`);
        config[key] = value;
      }
    },
  }) });
})();
