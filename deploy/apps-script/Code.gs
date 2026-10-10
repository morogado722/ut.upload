/**
 * 모로가도 사용성 평가 기록 수신기 (Google Apps Script)
 *
 * 구글 시트에 붙여서 쓰는 스크립트예요. 사이트 서버가 보내는 기록을 받아서
 *   - '진행 기록' 시트: 방문자(세션)마다 한 줄. 단계별 도착 시간, 상태(진행 중 / 이탈 / 완성), 이동 방법
 *   - '바톤 완성' 시트: 바톤을 만든 사람마다 한 줄. 업로드 페이지 입력값 전체 + 소요 시간 + 캡처 링크
 *   - 드라이브 '모로가도 사용성 평가' 폴더: 세션마다 폴더 하나 (업로드 페이지 캡처, 상세페이지 캡처, 원본 기록 JSON)
 * 를 만들어요. 설정 방법은 deploy/배포-가이드.md 를 보세요.
 */

// ⚠️ 서버(Render)의 RESEARCH_TOKEN 과 똑같은 값으로 바꿔 주세요. 다른 사람이 아무 기록이나 보내지 못하게 막아요.
const TOKEN = '여기에-비밀값을-넣어주세요';
const FOLDER_NAME = '모로가도 사용성 평가';

const STEP_NAMES = { 1: '1 파일 올리기', 2: '2 소스 확인', 3: '3 썸네일 설정', 4: '4 프로젝트 정보', 5: '5 파일 정보', 6: '6 바톤 노트' };
const TIMING_KEYS = ['첫 파일 업로드', '분석 시작', '분석 완료', '2단계 소스 확인', '3단계 썸네일', '4단계 프로젝트 정보', '5단계 파일 정보', '6단계 바톤 노트', '바톤 완성'];

const SESSION_HEADERS = ['세션', '시작 시각', '마지막 기록', '상태', '마지막 단계',
  ...TIMING_KEYS.map(k => k + '(초)'),
  '단계 버튼으로 이동', '스크롤로 이동', 'AI 초안 클릭', 'AI 아이디어 클릭', '기기', '화면', '창 크기', '터치'];

const DONE_HEADERS = ['세션', '완성 시각', '총 소요(초)', '제목', '프로젝트 유형', '진척도', '진척도 결정', '진척도 근거',
  '카테고리', '사용 툴', '스타일 태그', '시작일', '종료일', '실물 제작', '재료', '배운 점', '규격', '컬러 모드', '팔레트', '사용 폰트',
  '바톤 노트', 'AI 초안 사용', '이어받을 아이디어', '레퍼런스 이미지 수', '썸네일 수', '올린 파일', '링크',
  '분석 방식', '자동으로 채운 항목 수', '그중 고친 항목 수', '고친 항목', '직접 고친 전체 항목',
  ...TIMING_KEYS.map(k => k + '(초)'),
  '단계 버튼으로 이동', '스크롤로 이동', 'AI 초안 클릭', 'AI 아이디어 클릭', 'AI 아이디어 담기',
  '업로드 페이지 캡처', '상세페이지 캡처', '기록 폴더', '기기', '화면'];

function doPost(e) {
  let data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return reply({ ok: false, error: 'bad json' }); }
  if (!data || data.token !== TOKEN) return reply({ ok: false, error: 'token' });
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    upsertSession(data);
    if (data.type === 'complete') appendDone(data);
    return reply({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function doGet() { return reply({ ok: true, service: 'morogaro-research' }); }

/* ───────── 진행 기록(세션) ───────── */
function upsertSession(d) {
  const sheet = sheetWith('진행 기록', SESSION_HEADERS);
  const ids = sheet.getRange(2, 1, Math.max(1, sheet.getLastRow() - 1), 1).getValues().map(r => r[0]);
  const at = ids.indexOf(d.sessionId);
  const row = at >= 0 ? at + 2 : sheet.getLastRow() + 1;
  const old = at >= 0 ? sheet.getRange(row, 1, 1, SESSION_HEADERS.length).getValues()[0] : null;
  const done = old && old[3] === '완성';
  const step = Number(d.lastStep) || 1;
  let status = d.type === 'complete' ? '완성' : d.type === 'leave' ? '이탈 (' + (STEP_NAMES[step] || step) + ')' : '진행 중';
  if (done) status = '완성';                       // 완성한 뒤 나간 건 이탈이 아니에요.
  const t = d.timings || {}, b = d.behavior || {}, dev = d.device || {};
  const values = [d.sessionId, kst(d.startedAt), kst(d.receivedAt || d.at), status, STEP_NAMES[step] || step,
    ...TIMING_KEYS.map(k => t[k] == null ? '' : t[k]),
    b.stepButton || 0, b.stepScroll || 0, b.aiDraft || 0, b.aiIdeas || 0, shortDevice(dev.ua), dev.screen || '', dev.viewport || '', dev.touch ? '예' : '아니오'];
  sheet.getRange(row, 1, 1, values.length).setValues([values]);
}

/* ───────── 바톤 완성 ───────── */
function appendDone(d) {
  const sheet = sheetWith('바톤 완성', DONE_HEADERS);
  const folder = sessionFolder(d.sessionId);
  const images = d.images || {};
  const up = images.upload ? saveImage(folder, '업로드 페이지.jpg', images.upload) : null;
  const detail = images.detail ? saveImage(folder, '상세페이지.jpg', images.detail) : null;
  const copy = JSON.parse(JSON.stringify(d)); delete copy.images; delete copy.token;
  folder.createFile('기록.json', JSON.stringify(copy, null, 2), MimeType.PLAIN_TEXT);

  const v = d.values || {}, t = d.timings || {}, b = d.behavior || {}, ai = v.ai || {}, dev = d.device || {};
  const dim = v.dimensions && v.dimensions.width ? v.dimensions.width + '×' + v.dimensions.height + (v.dimensions.unit || '') : '';
  const row = [d.sessionId, kst(d.receivedAt || d.at), d.totalSeconds, v.title, v.projectType === 'planning' ? '기획 프로젝트' : '디자인 프로젝트',
    v.stage, v.stageBy, v.stageReason,
    list(v.categories), list(v.tools), list(v.tags), v.startDate, v.endDate,
    v.physical === true ? '예' : v.physical === false ? '아니오' : '', v.materials, v.lessons, dim, v.colorMode, list(v.palette),
    (v.fonts || []).map(f => f.name).join(', '),
    v.batonNote, v.noteDraftByAI ? '예' : '아니오', (v.nextIdeas || []).join(' / '), v.references, v.thumbnails,
    (v.sources || []).map(s => s.name + (s.kind ? ' (' + s.kind + ')' : '')).join(', '), list(v.urls),
    ai.mode === 'ai' ? 'AI 분석' : '파일 직접 추출', ai.filledCount || 0, ai.editedCount || 0, list(ai.editedFields), list(ai.touchedAll),
    ...TIMING_KEYS.map(k => t[k] == null ? '' : t[k]),
    b.stepButton || 0, b.stepScroll || 0, b.aiDraft || 0, b.aiIdeas || 0, b.aiIdeaPicked || 0,
    up ? link(up, '열기') : '', detail ? link(detail, '열기') : '', link(folder, '폴더'), shortDevice(dev.ua), dev.screen || ''];
  sheet.appendRow(row.map(x => x == null ? '' : x));
}

/* ───────── 도우미 ───────── */
function sheetWith(name, headers) {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = book.getSheetByName(name);
  if (!sheet) {
    sheet = book.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#F2F2F2');
    sheet.setFrozenRows(1);
  }
  return sheet;
}
function rootFolder() {
  const found = DriveApp.getFoldersByName(FOLDER_NAME);
  return found.hasNext() ? found.next() : DriveApp.createFolder(FOLDER_NAME);
}
function sessionFolder(id) {
  const parent = rootFolder(), found = parent.getFoldersByName(id);
  return found.hasNext() ? found.next() : parent.createFolder(id);
}
function saveImage(folder, name, dataUrl) {
  const m = String(dataUrl).match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!m) return null;
  return folder.createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name));
}
function link(file, label) { return '=HYPERLINK("' + file.getUrl() + '","' + label + '")'; }
function list(value) { return Array.isArray(value) ? value.join(', ') : (value || ''); }
function kst(iso) {
  if (!iso) return '';
  try { return Utilities.formatDate(new Date(iso), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'); } catch (e) { return iso; }
}
function shortDevice(ua) {
  ua = ua || '';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : '기타';
  const br = /SamsungBrowser/.test(ua) ? '삼성 인터넷' : /KAKAOTALK/.test(ua) ? '카카오톡' : /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : '기타';
  return os + ' · ' + br;
}
function reply(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

// 편집기에서 한 번 실행해 권한을 허용하고, 시트 · 폴더가 잘 만들어지는지 확인하는 용도예요.
function 연결_테스트() {
  sheetWith('진행 기록', SESSION_HEADERS);
  sheetWith('바톤 완성', DONE_HEADERS);
  rootFolder();
  Logger.log('준비 완료: 시트 두 개와 드라이브 폴더 "' + FOLDER_NAME + '"를 확인해 보세요.');
}
