/* Offline, dependency-free ZIP (STORE) writer for the user's own uploaded files.
 * UTF-8 filenames, CRC-32, duplicate-safe flat names; no network calls.
 * No recompression or content transformation. Font binaries are not redistributed.
 */
(() => {
  'use strict';
  const MAX_BYTES = 100 * 1024 * 1024;
  const encoder = new TextEncoder();
  const isFontBinary = name => /\.(?:woff2?|ttf|otf|eot|ttc|otc)$/i.test(name || '');
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let n = i;
    for (let j = 0; j < 8; j++) n = (n & 1) ? 0xEDB88320 ^ (n >>> 1) : n >>> 1;
    crcTable[i] = n >>> 0;
  }
  async function checksum(bytes, signal) {
    let crc = 0xFFFFFFFF;
    for (let start = 0; start < bytes.length; start += 1024 * 1024) {
      if (signal?.aborted) throw new DOMException('취소됨', 'AbortError');
      const end = Math.min(bytes.length, start + 1024 * 1024);
      for (let i = start; i < end; i++) crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
      // Keep animation, cancel and keyboard interactions responsive on large files.
      if (end < bytes.length) await new Promise(resolve => setTimeout(resolve, 0));
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function filename(raw, used) {
    let name = String(raw || 'file').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_').replace(/^\.+/, '_').replace(/[. ]+$/, '') || 'file';
    name = [...name].slice(0, 180).join('');
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
    let candidate = name, n = 2;
    while (used.has(candidate.toLocaleLowerCase('en-US'))) candidate = `${stem} (${n++})${ext}`;
    used.add(candidate.toLocaleLowerCase('en-US'));
    return candidate;
  }
  function timestamp(ms) {
    const d = new Date(Number.isFinite(ms) ? ms : Date.now());
    const year = Math.max(1980, Math.min(2107, d.getFullYear()));
    return {time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()};
  }
  async function create(files, {signal, onProgress} = {}) {
    if (!Array.isArray(files)) throw new TypeError('파일 배열이 필요해요.');
    const entries = files.filter(f => f instanceof Blob && !isFontBinary(f.name));
    if (!entries.length) throw new Error('다운로드할 원본 파일이 없어요.');
    if (entries.length > 1000 || entries.reduce((sum, f) => sum + f.size, 0) > MAX_BYTES) {
      throw new Error('전체다운은 100MB, 1,000개까지 가능해요. 파일을 개별 다운로드해 주세요.');
    }
    const chunks = [], directory = [], used = new Set();
    let offset = 0, directorySize = 0;
    for (let index = 0; index < entries.length; index++) {
      if (signal?.aborted) throw new DOMException('취소됨', 'AbortError');
      const file = entries[index], name = encoder.encode(filename(file.name, used));
      const bytes = new Uint8Array(await file.arrayBuffer()), crc = await checksum(bytes, signal), stamp = timestamp(file.lastModified);
      const local = new Uint8Array(30 + name.length), lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034B50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true);
      lv.setUint16(10, stamp.time, true); lv.setUint16(12, stamp.date, true); lv.setUint32(14, crc, true);
      lv.setUint32(18, file.size, true); lv.setUint32(22, file.size, true); lv.setUint16(26, name.length, true); local.set(name, 30);
      chunks.push(local, bytes);
      const central = new Uint8Array(46 + name.length), cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014B50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
      cv.setUint16(12, stamp.time, true); cv.setUint16(14, stamp.date, true); cv.setUint32(16, crc, true);
      cv.setUint32(20, file.size, true); cv.setUint32(24, file.size, true); cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true); central.set(name, 46);
      directory.push(central); directorySize += central.length; offset += local.length + file.size;
      onProgress?.(index + 1, entries.length);
    }
    const end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054B50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
    ev.setUint32(12, directorySize, true); ev.setUint32(16, offset, true);
    return new Blob([...chunks, ...directory, end], {type: 'application/zip'});
  }
  globalThis.MorogaroBundle = Object.freeze({create, isFontBinary, maxBytes: MAX_BYTES});
})();
