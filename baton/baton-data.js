/* 모로가도 · 바톤 상세페이지 데이터 계층
 *
 * 상세페이지는 "바톤 뷰(BatonView)" 객체 하나만 보고 화면을 그립니다.
 * 지금은 두 군데에서 바톤 뷰를 만들어요.
 *   1) fromMakerRecord(record) — 바톤 메이커가 이 브라우저(IndexedDB)에 저장한 기록
 *   2) DEMO_SOCIAL            — 아직 서버가 없는 댓글·관련 바톤·바톤로그 시연용 예시
 *
 * ▶ API를 연결할 때
 *   - 서버 응답을 BatonView 모양으로 바꾸는 함수(fromApi 등)를 여기에 추가하고,
 *   - baton-render.js의 loadView()에서 그 함수를 부르면 됩니다.
 *   - 화면 코드(baton-render.js, app.js)는 바꾸지 않아도 되게 나눠 두었어요.
 *
 * BatonView 모양
 * {
 *   id, preview, bookmarked,
 *   title, subtitle, categories: string[],
 *   author: { name, isOwner, message },
 *   gallery: [{ src, title, alt }],
 *   tools: string[], period: { start, end },          // 'YYYY-MM-DD'
 *   note, references: [{ src, alt }],
 *   palette: { colors: ['#RRGGBB'], mode: 'RGB'|'CMYK' },
 *   dimensions: string, tags: string[], nextIdeas: string[],
 *   materials, lessons, fonts: [{ name, weights, url }],
 *   stage: 'Seeding'|'Planting'|'Growing'|'Blooming'|null, stageStatements: string[],
 *   files: [{ name, size, ext, blob, isFont }], links: string[],
 *   social: { comments, commentTotal, related, logRoot }   // 지금은 DEMO_SOCIAL
 * }
 */
(() => {
  'use strict';

  const STAGES = ['Seeding', 'Planting', 'Growing', 'Blooming'];
  const STAGE_COLORS = Object.freeze({ Seeding: '#00E0D0', Planting: '#00D985', Growing: '#B9C000', Blooming: '#F0A000' });

  // 메이커는 툴 이름을 전체 이름으로 저장해요. 상세페이지 알약에는 약어를 보여줘요.
  const TOOL_ABBR = [
    [/illustrator/i, 'Ai'], [/photoshop/i, 'Ps'], [/indesign/i, 'Id'], [/after\s*effects/i, 'Ae'],
    [/premiere/i, 'Pr'], [/lightroom/i, 'Lr'], [/xd\b/i, 'Xd'], [/figma/i, 'Fig'], [/blender/i, 'Bl'],
    [/cinema\s*4d|c4d/i, 'C4D'], [/procreate/i, 'Pc'], [/rhino/i, 'Rh'], [/keyshot/i, 'Ks'],
    [/sketch/i, 'Sk'], [/notion/i, 'No'], [/canva/i, 'Cv'], [/powerpoint|ppt/i, 'Pp'], [/word/i, 'Wd'],
    [/excel/i, 'Xl'], [/premiere/i, 'Pr'], [/spline/i, 'Sp'], [/framer/i, 'Fr'],
  ];
  const toolAbbr = name => {
    for (const [pattern, short] of TOOL_ABBR) if (pattern.test(name)) return short;
    return String(name).length <= 6 ? String(name) : String(name).slice(0, 5) + '…';
  };

  const isImageData = v => typeof v === 'string' && /^data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,/i.test(v);
  const safeLink = v => { try { const u = new URL(v); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; } };
  const isFontName = n => /\.(?:woff2?|ttf|otf|eot|ttc|otc)$/i.test(n || '');
  const clean = v => (typeof v === 'string' ? v.trim() : '');
  const list = v => (Array.isArray(v) ? v.map(clean).filter(Boolean) : []);

  function firstSentence(note) {
    const text = clean(note);
    if (!text) return '';
    return (text.match(/^[\s\S]*?[.!?](?=\s|$)/)?.[0] || text.split(/\n/)[0]).trim().slice(0, 80);
  }

  // 진척도 근거 문장: 메이커 v15 결과 화면과 같은 규칙. 없는 이유를 지어내지 않아요.
  function stageStatements(d, fileCount) {
    const name = STAGES.includes(d.stage) ? d.stage : null;
    const manual = (d.provenance?.manualFields || []).includes('stage');
    const out = [];
    if (manual) out.push('작성자가 직접 선택한 진척도예요.');
    else if (name) {
      if (d.stageReason) out.push(String(d.stageReason));
      for (const e of (d.provenance?.evidence || [])) {
        if (e.field === 'stage' && e.quote && (d.sources || []).some(s => s.id === e.fileId)) out.push(String(e.quote));
      }
    } else out.push('진척도는 아직 정해지지 않았어요.');
    if (fileCount) out.push(`원본 파일 ${fileCount}개가 포함돼 있어요.`);
    if (d.selectedThumbnails?.length) out.push(`바톤 이미지 ${d.selectedThumbnails.length}개를 선택했어요.`);
    if (clean(d.batonNote)) out.push('이어서 작업할 수 있는 바톤 노트를 남겼어요.');
    return [...new Set(out)].slice(0, 4);
  }

  function fromMakerRecord(record, { ownerName = '방문자' } = {}) {
    if (!record || !record.data) throw new Error('바톤 정보가 없어요.');
    const d = record.data;
    const title = clean(d.title) || '새 바톤';
    const files = (record.files || []).filter(f => f && typeof f.name === 'string').map(f => ({
      name: f.name, size: Number(f.size) || 0,
      ext: f.name.includes('.') ? f.name.split('.').pop().toLowerCase().slice(0, 5) : 'file',
      blob: f, isFont: isFontName(f.name),
    }));
    const dim = d.dimensions;
    return {
      id: record.id, preview: Boolean(record.preview), bookmarked: Boolean(record.bookmarked),
      title,
      subtitle: firstSentence(d.batonNote) || '여기에서 시작해, 다른 방향으로 이어지는 바톤',
      categories: list(d.categories).slice(0, 6),
      author: {
        name: ownerName, isOwner: true,
        message: record.preview
          ? '공개 전 미리보기예요. 아직 이 바톤을 저장하지 않았어요. 수정하기를 눌러 이어서 작성할 수 있어요.'
          : '이 브라우저에 보관한 바톤이에요. 아직 다른 사용자에게 공개되지 않았어요.',
      },
      thumbRatio: /^\d+\/\d+$/.test(d.thumbRatio || '') ? d.thumbRatio : null,
      gallery: (d.selectedThumbnails || []).filter(t => isImageData(t?.dataUrl)).slice(0, 10)
        .map((t, i) => ({ src: t.dataUrl, title: clean(t.label) || `바톤 이미지 ${i + 1}`, alt: `${title} · ${clean(t.label) || `이미지 ${i + 1}`}` })),
      tools: list(d.tools),
      period: { start: clean(d.startDate), end: clean(d.endDate) },
      note: clean(d.batonNote),
      references: (d.references || []).filter(t => isImageData(t?.dataUrl)).map((t, i) => ({ src: t.dataUrl, alt: clean(t.label) || `레퍼런스 이미지 ${i + 1}` })),
      palette: { colors: (d.palette || []).filter(h => /^#[\da-f]{6}$/i.test(h)).map(h => h.toUpperCase()), mode: String(d.colorMode || 'rgb').toUpperCase() },
      dimensions: dim?.width && dim?.height ? `${dim.width}×${dim.height}(${dim.unit || 'px'})` : '',
      tags: list(d.tags).slice(0, 15),
      nextIdeas: list(d.nextIdeas).slice(0, 3),
      materials: clean(d.materials), lessons: clean(d.lessons),
      fonts: (d.fonts || []).map(f => ({ name: clean(f?.name), weights: clean(f?.weights), url: safeLink(f?.downloadUrl || '') })).filter(f => f.name),
      stage: STAGES.includes(d.stage) ? d.stage : null,
      stageStatements: stageStatements(d, files.length),
      files,
      links: (d.urls || []).map(safeLink).filter(Boolean),
      social: liveSocial(d.aiComments),
    };
  }

  /* ───────── 시연용 예시 (서버 연결 전) ─────────
   * 어떤 바톤에도 어색하지 않도록 특정 소재(obj, 그리스 신화 등)를 뺀 문장이에요.
   * API를 연결하면 이 객체 대신 서버의 댓글·관련 바톤·로그를 넣으면 됩니다. */
  const DEMO_SOCIAL = Object.freeze({
    isDemo: true,
    commentTotal: 43,
    comments: [
      { kind: 'first', avatar: 'cyan', name: '씨앗 4412', handle: 'jihoon_K', time: '2시간 전', text: '다른 소재로 계승해보고 싶은데 원본 파일 규격이 어떻게 되나요?' },
      { kind: 'reply', avatar: 'gray', name: '{{author}}', badge: '원작자', time: '1시간 전', text: '파일 정보 탭에 규격을 적어뒀어요. 받는 파일에도 같은 기준으로 저장돼 있어요!' },
      { kind: 'second', avatar: 'pink', name: '원석 1203', handle: 'jiaja03', time: '5시간 전', text: '컬러 조합이 정말 좋아요! 다른 버전도 기대할게요 🙌' },
      { kind: 'third', avatar: 'pale', name: '과즙 2087', handle: 'summer_ao', inherited: true, time: '어제', text: '이 바톤을 이어받아 새 버전을 만들고 있어요. 원본이 레이어별로 정리돼 있어서 바로 시작할 수 있었어요!' },
    ],
    related: [
      ['같은 일러스트예요', 2], ['같은 편집 디자인이에요', 4], ['발표 자료가 아직 없어요', 3], ['같은 편집 디자인이에요', 1], ['파일 구성이 비슷해요', 3],
      ['같은 편집 디자인이에요', 2], ['발표 자료가 아직 없어요', 3], ['파일 구성이 비슷해요', 3], ['발표 자료가 아직 없어요', 1], ['같은 일러스트예요', 4],
    ],
  });

  /* AI가 만든 댓글(바톤 만들 때 한 번)이 있으면 그걸, 없으면 댓글 없이 보여줘요. 관련 바톤은 아직 시연용 예시예요. */
  function liveSocial(raw) {
    const avatars = ['cyan', 'pink', 'pale'], kinds = ['first', 'second', 'third'], times = ['2시간 전', '5시간 전', '어제'];
    const comments = (Array.isArray(raw) ? raw : []).slice(0, 3).map((c, i) => ({
      kind: kinds[i], avatar: avatars[i], name: clean(c?.name).slice(0, 20) || `씨앗 ${1000 + i * 1371}`,
      handle: clean(c?.handle).replace(/[^a-z0-9_.]/gi, '').slice(0, 20), time: times[i], inherited: Boolean(c?.inherited), text: clean(c?.text).slice(0, 200),
    })).filter(c => c.text);
    return { isDemo: false, commentTotal: comments.length, comments, related: DEMO_SOCIAL.related };
  }

  window.MorogaroBatonData = Object.freeze({ fromMakerRecord, toolAbbr, STAGES, STAGE_COLORS, DEMO_SOCIAL });
})();
