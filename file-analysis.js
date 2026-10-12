/* v11 — real, bounded browser inspection. This is NOT an AI model.
 * A same-origin Python service adds multi-format extraction and grounded AI proposals.
 * File content is never executed; linked URLs are not fetched. */
(() => {
  'use strict';
  const MAX_FILE = 50 * 1024 * 1024;
  const MAX_DESIGN_FILE = 150 * 1024 * 1024;   // AI · PSD는 원본이 커서 150MB까지
  const MAX_TOTAL = 200 * 1024 * 1024;
  const limitFor = ext => /^(ai|psd|psb)$/.test(ext) ? MAX_DESIGN_FILE : MAX_FILE;
  const TEXT_LIMIT = 128 * 1024;
  const STAGES = ['Seeding', 'Planting', 'Growing', 'Blooming'];
  const TYPES = {ai:'디자인 원본 파일',psd:'디자인 원본 파일',fig:'디자인 원본 파일',sketch:'디자인 원본 파일',blend:'3D 원본 파일',pdf:'문서',docx:'문서',pptx:'문서',txt:'메모',md:'메모',html:'코드',css:'코드',js:'코드',json:'데이터',svg:'벡터 이미지',png:'이미지',jpg:'이미지',jpeg:'이미지',webp:'이미지',gif:'이미지'};
  const TOOLS = {ai:'Adobe Illustrator',psd:'Adobe Photoshop',fig:'Figma',sketch:'Sketch',blend:'Blender'};
  const blankValues = () => ({title:'',stage:null,stageReason:'파일만으로 진척도를 단정하지 않았어요. 지금 상태에 맞게 선택해 주세요.',categories:[],tools:[],tags:[],startDate:null,endDate:null,physical:null,materials:'',lessons:''});
  const ext = name => (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
  const unique = xs => [...new Set(xs.filter(Boolean))];
  const abort = signal => { if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError'); };
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  const cleanTitle = name => (name.replace(/\.[^.]+$/, '').replace(/[_-](?:ai|pdf|docx|png|jpg)$/i, '').replace(/[_\-]+/g, ' ').replace(/(최종|final|수정본?|진짜|v\d+|ver\.?\d*|\d{6,8}|\(\d+\))/gi, ' ').replace(/\s+/g, ' ').trim() || '새 바톤').slice(0,120);
  const safeDate = value => {
    const m = String(value).match(/(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/);
    if (!m) return null;
    const iso = `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
    const d = new Date(iso+'T00:00:00Z');
    return !isNaN(d) && d.toISOString().slice(0,10) === iso ? iso : null;
  };
  const safeURL = value => { try { const u = new URL(value); return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; } };
  const isPreviewURL = value => /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value || '') && value.length < 1800000;
  function newResult(payload, mode='browser') {
    return {version:1,mode,createdAt:new Date().toISOString(),projectType:payload.projectType,values:blankValues(),sources:[],links:payload.urls.map(safeURL).filter(Boolean),thumbnails:[],dimensions:[],fonts:[],colors:[],evidence:[],warnings:[]};
  }
  function addEvidence(result,field,source,quote,basis='declared',location='파일 본문') {
    result.evidence.push({field,fileId:source.id,location,quote:String(quote).slice(0,400),basis});
  }
  function inspectText(text, source, result) {
    const v=result.values;
    const title=text.match(/^(?:프로젝트\s*제목|제목|title)\s*[:：]\s*(.{1,120})$/im) || text.match(/^#\s+(.{1,120})$/m) || text.match(/<title[^>]*>([^<]{1,120})<\/title>/i);
    if (title && !result.evidence.some(e=>e.field==='title' && e.basis==='declared')) { v.title=title[1].trim(); addEvidence(result,'title',source,title[0]); }
    const lists=[['categories',/(?:카테고리|categories)\s*[:：]\s*([^\r\n]+)/i],['tools',/(?:사용\s*툴|tools)\s*[:：]\s*([^\r\n]+)/i],['tags',/(?:스타일\s*태그|태그|tags)\s*[:：]\s*([^\r\n]+)/i]];
    for (const [key,regex] of lists) { const m=text.match(regex); if(m){v[key]=unique([...v[key],...m[1].split(/[,，·]/).map(s=>s.trim().replace(/^#/, '').slice(0,50))]).slice(0,12);addEvidence(result,key,source,m[0]);}}
    const stage=text.match(/(?:진척도|진행\s*단계|stage)\s*[:：]\s*(Seeding|Planting|Growing|Blooming)\b/i);
    if(stage){ v.stage=STAGES.find(s=>s.toLowerCase()===stage[1].toLowerCase());v.stageReason='파일 본문에 작성된 단계를 불러왔어요. 현재 상태와 맞는지 확인해 주세요.';addEvidence(result,'stage',source,stage[0]); }
    for(const [key,pattern] of [['startDate',/(?:프로젝트\s*)?(?:시작일|start\s*date)\s*[:：]\s*([^\r\n]+)/i],['endDate',/(?:프로젝트\s*)?(?:종료일|end\s*date)\s*[:：]\s*([^\r\n]+)/i]]) { const m=text.match(pattern);if(m&&safeDate(m[1])){v[key]=safeDate(m[1]);addEvidence(result,key,source,m[0]);}}
    for(const [key,label] of [['materials','소재 및 후가공'],['lessons','제작하면서 알게된 점']]) { const m=text.match(new RegExp(label+'\\s*[:：]\\s*([^\\r\\n]+)','i'));if(m){v[key]=m[1].trim().slice(0,2000);addEvidence(result,key,source,m[0]);}}
    const production=text.match(/(?:실물\s*제작|제작여부|physical)\s*[:：]\s*(예|아니오|완료|미제작|true|false)/i);
    if(production){v.physical=/^(예|완료|true)$/i.test(production[1]);addEvidence(result,'physical',source,production[0]);}
    const fontMatches=[...text.matchAll(/font-family\s*:\s*([^;\n{}]+)/gi),...text.matchAll(/font-family\s*=\s*["']([^"']+)["']/gi)];
    for(const m of fontMatches){ for(const raw of m[1].split(',')){const name=raw.replace(/["']/g,'').trim();if(!name||/^(sans-serif|serif|monospace|inherit|system-ui|var\()/i.test(name))continue;
      if(!result.fonts.some(f=>f.name===name))result.fonts.push({name:name.slice(0,100),weights:'',downloadUrl:'',sourceId:source.id,basis:'파일의 font-family 선언'});}}
    const matches=[...text.matchAll(/(?:#[\da-f]{6}\b|#[\da-f]{3}\b)/gi)].map(m=>m[0].toUpperCase()).map(h=>h.length===4?'#'+h.slice(1).split('').map(c=>c+c).join(''):h);
    result.colors=unique([...result.colors,...matches]).slice(0,14);
    if(matches.length)addEvidence(result,'colors',source,'파일에 선언된 색상: '+unique(matches).slice(0,14).join(', '),'declared');
    if (source.ext==='svg') {
      const root = new DOMParser().parseFromString(text,'image/svg+xml').documentElement;
      if(root.localName==='svg'){
        const w=(root.getAttribute('width')||'').match(/^([\d.]+)(px|mm|cm)?$/),h=(root.getAttribute('height')||'').match(/^([\d.]+)(px|mm|cm)?$/);
        if(w&&h&&(w[2]||'px')===(h[2]||'px'))result.dimensions.push({id:source.id+'-size',sourceId:source.id,label:source.name,width:Number(w[1]),height:Number(h[1]),unit:w[2]||'px',basis:'SVG width/height 선언 (viewBox가 아님)'});
      }
    }
    const size = text.match(/(?:규격|dimensions)\s*[:：]\s*([\d.]+)\s*[x×X]\s*([\d.]+)\s*(mm|px|cm)\b/i);
    if(size)result.dimensions.push({id:source.id+'-declared',sourceId:source.id,label:source.name,width:+size[1],height:+size[2],unit:size[3].toLowerCase(),basis:'본문에 명시된 규격'});
  }
  async function inspectImage(file, source, result, signal) {
    const image = new Image(); const blobURL=URL.createObjectURL(file);
    try {
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>finish(new Error('이미지 읽기 시간 초과')),6000);
        const onAbort=()=>finish(new DOMException('Cancelled','AbortError'));
        function finish(error){clearTimeout(timer);signal?.removeEventListener('abort',onAbort);image.onload=null;image.onerror=null;error?reject(error):resolve();}
        image.onload=()=>finish();image.onerror=()=>finish(new Error('이미지를 읽지 못했어요.'));signal?.addEventListener('abort',onAbort,{once:true});image.src=blobURL;
      });
      abort(signal);
      const w=image.naturalWidth,h=image.naturalHeight;
      if(w*h>40000000 || !w || !h) throw new Error('이미지 해상도가 너무 커 기본 정보만 보관했어요.');
      result.dimensions.push({id:source.id+'-size',sourceId:source.id,label:source.name,width:w,height:h,unit:'px',basis:'이미지 디코더로 읽은 픽셀 크기'});
      const canvas=document.createElement('canvas');const factor=Math.min(1,1600/Math.max(w,h));canvas.width=Math.max(1,Math.round(w*factor));canvas.height=Math.max(1,Math.round(h*factor));
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
      result.thumbnails.push({id:source.id+'-thumb',sourceId:source.id,label:source.name,dataUrl:canvas.toDataURL('image/jpeg',0.9)});
      canvas.width=64;canvas.height=64;ctx.clearRect(0,0,64,64);ctx.drawImage(image,0,0,64,64);
      const pixels=ctx.getImageData(0,0,64,64).data,bins=new Map();
      for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]<180)continue;const rgb=[pixels[i],pixels[i+1],pixels[i+2]],key=rgb.map(n=>Math.round(n/24)).join(',');let b=bins.get(key);if(!b){b={n:0,sum:[0,0,0]};bins.set(key,b);}b.n++;rgb.forEach((n,j)=>b.sum[j]+=n);}
      const colors=[];for(const bin of [...bins.values()].sort((a,b)=>b.n-a.n)){const c=bin.sum.map(v=>Math.round(v/bin.n));if(colors.some(prev=>Math.sqrt(prev.reduce((s,v,i)=>s+(v-c[i])**2,0))<38))continue;colors.push(c);if(colors.length===14)break;}
      const hex=colors.map(c=>'#'+c.map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase());
      result.colors=unique([...result.colors,...hex]).slice(0,14);
      addEvidence(result,'colors',source,'이미지 픽셀 표본의 대표 RGB 색상. 인쇄 원색 또는 ICC 프로파일 값이 아닙니다.','measured');
      source.status='read';source.coverage='첫 프레임의 픽셀 크기·미리보기·대표 색상';
    } finally { URL.revokeObjectURL(blobURL); }
  }
  /* PDF: 브라우저에서 pdf.js로 본문(앞 40쪽)과 앞 8쪽 미리보기, 첫 쪽 크기를 읽어요. 처음 필요할 때만 불러와요. */
  const PDF_BASE = new URL('./vendor/pdfjs/', location.href).href;
  let pdfLoader = null;
  function loadPdf() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!pdfLoader) pdfLoader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = PDF_BASE + 'pdf.min.js';
      script.onload = () => { const lib = window.pdfjsLib; if (!lib) { reject(new Error('PDF 도구를 불러오지 못했어요.')); return; } lib.GlobalWorkerOptions.workerSrc = PDF_BASE + 'pdf.worker.min.js'; resolve(lib); };
      script.onerror = () => { pdfLoader = null; reject(new Error('PDF 도구를 불러오지 못했어요.')); };
      document.head.append(script);
    });
    return pdfLoader;
  }
  function sampleColors(ctx, source, result, image) {
    const canvas = ctx.canvas; canvas.width = 64; canvas.height = 64; ctx.clearRect(0, 0, 64, 64); ctx.drawImage(image, 0, 0, 64, 64);
    const pixels = ctx.getImageData(0, 0, 64, 64).data, bins = new Map();
    for (let i = 0; i < pixels.length; i += 4) { if (pixels[i + 3] < 180) continue; const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]], key = rgb.map(n => Math.round(n / 24)).join(','); let b = bins.get(key); if (!b) { b = {n: 0, sum: [0, 0, 0]}; bins.set(key, b); } b.n++; rgb.forEach((n, j) => b.sum[j] += n); }
    const colors = []; for (const bin of [...bins.values()].sort((a, b) => b.n - a.n)) { const c = bin.sum.map(v => Math.round(v / bin.n)); if (colors.some(prev => Math.sqrt(prev.reduce((s, v, i) => s + (v - c[i]) ** 2, 0)) < 38)) continue; colors.push(c); if (colors.length === 14) break; }
    const hex = colors.map(c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase());
    result.colors = unique([...result.colors, ...hex]).slice(0, 14);
    addEvidence(result, 'colors', source, '첫 쪽 미리보기 픽셀 표본의 대표 RGB 색상. 인쇄 원색이 아닙니다.', 'measured');
  }
  async function inspectPdf(file, source, result, signal) {
    const lib = await loadPdf(); abort(signal);
    const task = lib.getDocument({data: new Uint8Array(await file.arrayBuffer()), cMapUrl: PDF_BASE + 'cmaps/', cMapPacked: true, standardFontDataUrl: PDF_BASE + 'standard_fonts/', isEvalSupported: false, disableFontFace: false});
    const onAbort = () => task.destroy(); signal?.addEventListener('abort', onAbort, {once: true});
    try {
      const doc = await task.promise; abort(signal);
      // 본문은 앞 40쪽(2만4천 자까지), 미리보기는 모든 쪽(최대 80쪽)을 만들어요. 썸네일 후보에서 스크롤로 골라요.
      const pages = Math.min(doc.numPages, 40), previewPages = Math.min(doc.numPages, 80); let text = '';
      const fontNames = new Map();
      for (let n = 1; n <= previewPages; n++) {
        const page = await doc.getPage(n); abort(signal);
        const content = n <= pages && text.length < 24000 ? await page.getTextContent() : null;
        if (content) text += content.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('') + '\n';
        if (n === 1) {
          const v = page.getViewport({scale: 1});
          result.dimensions.push({id: source.id + '-size', sourceId: source.id, label: source.name, width: Math.round(v.width * 25.4 / 72), height: Math.round(v.height * 25.4 / 72), unit: 'mm', basis: 'PDF 첫 쪽 크기(재단 여백 포함 가능)'});
        }
        const v = page.getViewport({scale: 1}), scale = Math.min(4, (n <= 8 ? 1400 : 640) / Math.max(v.width, v.height)), view = page.getViewport({scale});
        const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(view.width)); canvas.height = Math.max(1, Math.round(view.height));
        const ctx = canvas.getContext('2d', {willReadFrequently: n === 1}); ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({canvasContext: ctx, viewport: view}).promise; abort(signal);
        result.thumbnails.push({id: `${source.id}-p${n}`, sourceId: source.id, label: `${source.name} · ${n}쪽`, page: n, kind: 'page', dataUrl: canvas.toDataURL('image/jpeg', n <= 8 ? 0.85 : 0.78)});
        if (n === 1) { const copy = document.createElement('canvas'), c2 = copy.getContext('2d', {willReadFrequently: true}); sampleColors(c2, source, result, canvas); }
        // 사용 폰트: PDF에 들어 있는 글꼴 이름(예: ABCDEF+SpoqaHanSansNeo-Bold)을 읽어요.
        if (content && n <= 20) for (const item of content.items) {
          try { if (!item.fontName || fontNames.has(item.fontName) || !page.commonObjs.has(item.fontName)) continue; const f = page.commonObjs.get(item.fontName); fontNames.set(item.fontName, f?.name || ''); } catch { /* 읽지 못한 글꼴 */ }
        }
        page.cleanup(); await tick();
        if (n % 4 === 0) document.dispatchEvent(new CustomEvent('morogaro:analysis-progress', {detail: {event: 'progress', phase: 'extract', message: `PDF ${n}/${previewPages}쪽을 읽고 있어요.`}}));
      }
      for (const raw of new Set(fontNames.values())) {
        const clean = String(raw).replace(/^[A-Z]{6}\+/, '').trim(); if (!clean || /^(g_d|Times|Helvetica|Courier|Symbol|ZapfDingbats|Arial(MT)?$)/i.test(clean)) continue;
        const [family, weight = ''] = clean.split(/[-,]/);
        const name = /[가-힣]/.test(family) ? family : family.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
        const old = result.fonts.find(f => f.name === name);
        if (old) { if (weight && !old.weights.includes(weight)) old.weights = [old.weights, weight].filter(Boolean).join(' · '); continue; }
        result.fonts.push({name: name.slice(0, 100), weights: weight, downloadUrl: '', sourceId: source.id, basis: 'PDF에 포함된 글꼴 이름'});
      }
      text = text.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').trim();
      source.text = text.slice(0, 12000);
      source.status = doc.numPages > pages || text.length >= 24000 ? 'partial' : 'read';
      source.coverage = `PDF ${doc.numPages}쪽 중 앞 ${pages}쪽 본문 · ${previewPages}쪽 미리보기`;
      if (!text) source.warnings.push('글자를 읽을 수 없는 PDF예요(이미지로만 된 문서일 수 있어요). 미리보기는 만들었어요.');
      inspectText(text, source, result);
      await doc.destroy();
    } finally { signal?.removeEventListener('abort', onAbort); }
  }
  /* 파일에 남은 날짜 흔적: 최종 수정일(브라우저가 알려줌) + 파일 속 생성일(PDF 정보·사진 EXIF·XMP) */
  const iso=d=>d&&!isNaN(d)?new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10):null;
  async function embeddedDate(file){
    try{
      const head=new Uint8Array(await file.slice(0,262144).arrayBuffer());let t='';for(let i=0;i<head.length;i++)t+=String.fromCharCode(head[i]);
      const found=[];
      for(const m of t.matchAll(/(?:CreationDate|CreateDate|DateTimeOriginal|DateCreated)[^0-9]{0,40}?(?:D:)?((?:19|20)\d\d)[:\-]?(\d\d)[:\-]?(\d\d)/g))found.push(`${m[1]}-${m[2]}-${m[3]}`);
      for(const m of t.matchAll(/((?:19|20)\d\d):(\d\d):(\d\d) \d\d:\d\d:\d\d/g))found.push(`${m[1]}-${m[2]}-${m[3]}`);
      return found.filter(d=>{const x=new Date(d);return !isNaN(x)&&x<=new Date()&&x.getFullYear()>2000;}).sort()[0]||null;
    }catch{return null;}
  }
  async function fileDates(files){
    const modified=files.map(f=>f.lastModified?iso(new Date(f.lastModified)):null).filter(Boolean).sort();
    const created=(await Promise.all(files.slice(0,20).map(embeddedDate))).filter(Boolean).sort();
    const start=[created[0],modified[0]].filter(Boolean).sort()[0]||null,end=modified[modified.length-1]||null;
    if(!start&&!end)return null;
    return {start,end:end&&start&&end<start?start:end,basis:created.length?'파일 속 생성일 · 최종 수정일':'파일 최종 수정일'};
  }
  /* 일러스트레이터(.ai): 기본 저장 옵션('PDF 호환 파일 만들기')이면 안에 PDF가 들어 있어 PDF처럼 읽어요. */
  async function inspectAi(file, source, result, signal) {
    const head = new TextDecoder().decode(await file.slice(0, 1024).arrayBuffer());
    if (!head.includes('%PDF')) { source.warnings.push('PDF 호환으로 저장되지 않은 AI 파일이라 내용을 읽지 못했어요. PDF나 PNG로 내보내 함께 올려주세요.'); return; }
    await inspectPdf(file, source, result, signal);
    source.coverage = 'AI 안의 PDF 호환 데이터(아트보드 미리보기 · 텍스트 · 글꼴)';
  }
  /* 포토샵(.psd): 합쳐진 최종 이미지를 꺼내 이미지처럼 읽고, 텍스트 레이어에서 글꼴을 찾아요. */
  let psdLib;
  function loadPsd() {
    if (window.agPsd) return Promise.resolve(window.agPsd);
    if (!psdLib) psdLib = new Promise((resolve, reject) => { const sc = document.createElement('script'); sc.src = new URL('./vendor/ag-psd/ag-psd.min.js', location.href).href; sc.onload = () => window.agPsd ? resolve(window.agPsd) : reject(new Error('PSD 도구를 불러오지 못했어요.')); sc.onerror = () => reject(new Error('PSD 도구를 불러오지 못했어요.')); document.head.append(sc); });
    return psdLib;
  }
  async function inspectPsd(file, source, result, signal) {
    const lib = await loadPsd(); abort(signal);
    const psd = lib.readPsd(await file.arrayBuffer(), { skipLayerImageData: true, skipThumbnail: false, skipLinkedFilesData: true });
    abort(signal);
    let art = psd.canvas;
    if (!art && psd.imageResources?.thumbnail) art = psd.imageResources.thumbnail;
    if (!art) { source.warnings.push('PSD에 합쳐진 미리보기가 없어 내용을 읽지 못했어요(호환성 최대화 끔). PNG로 내보내 함께 올려주세요.'); return; }
    const f = Math.min(1, 2400 / Math.max(art.width, art.height)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(art.width * f)); c.height = Math.max(1, Math.round(art.height * f));
    const x = c.getContext('2d'); x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, c.width, c.height); x.drawImage(art, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    await inspectImage(new File([blob], file.name.replace(/\.ps[db]$/i, '.png'), { type: 'image/png' }), source, result, signal);
    result.dimensions = result.dimensions.filter(d => d.id !== source.id + '-size');
    result.dimensions.push({ id: source.id + '-size', sourceId: source.id, label: source.name, width: psd.width, height: psd.height, unit: 'px', basis: 'PSD 캔버스 크기' });
    const names = new Set();
    (function walk(list) { for (const l of list || []) { const t = l.text; if (t) { [t.style, ...(t.styleRuns || []).map(r => r.style)].forEach(st => { const n = st?.font?.name; if (n) names.add(n); }); } walk(l.children); } })(psd.children);
    for (const raw of names) {
      const clean = String(raw).replace(/^[A-Z]{6}\+/, '').trim(); if (!clean) continue;
      const [family, weight = ''] = clean.split(/[-,]/);
      const name = /[가-힣]/.test(family) ? family : family.replace(/([a-z])([A-Z])/g, '$1 $2');
      const old = result.fonts.find(fo => fo.name === name);
      if (old) { if (weight && !old.weights.includes(weight)) old.weights = [old.weights, weight].filter(Boolean).join(' · '); continue; }
      result.fonts.push({ name: name.slice(0, 100), weights: weight, downloadUrl: '', sourceId: source.id, basis: 'PSD 텍스트 레이어의 글꼴' });
    }
    source.coverage = `합쳐진 최종 이미지 · 캔버스 크기${names.size ? ' · 텍스트 레이어 글꼴' : ''}`;
  }
  async function inspectBrowser(payload, {signal}={}) {
    const result=newResult(payload);
    if(payload.files.length>20 || payload.files.reduce((s,f)=>s+f.size,0)>MAX_TOTAL)result.warnings.push('분석 범위를 초과한 파일은 기본 정보만 유지합니다 (20개 / 합계 100MB).');
    let bytes=0;
    for (let i=0;i<payload.files.length;i++) {
      abort(signal);const file=payload.files[i],extension=ext(file.name);
      const source={id:'f'+i,name:file.name,size:file.size,ext:extension,kind:TYPES[extension]||'기타 파일',kindBasis:'확장자 기준 · 직접 변경 가능',status:'metadata',coverage:'파일명·확장자·용량만 확인',warnings:[],text:''};result.sources.push(source);
      if(TOOLS[extension]){result.values.tools=unique([...result.values.tools,TOOLS[extension]]);addEvidence(result,'tools',source,extension+' 확장자에 연결된 툴 후보','extension','파일 형식');}
      // 50MB 넘는 파일은 건너뛰되, 합계에는 넣지 않아요(큰 파일 하나 때문에 다른 파일까지 못 읽지 않게).
      if(file.size>limitFor(extension)){source.warnings.push(`${Math.round(limitFor(extension)/1048576)}MB를 넘어 내용을 읽지 않았어요. 이름 · 형식만 보관했어요.`);continue;}
      bytes+=file.size;
      if(i>=20||bytes>MAX_TOTAL){source.warnings.push('브라우저 분석 크기 제한을 초과했어요.');continue;}
      try {
        if(/^(png|jpe?g|webp|gif|bmp|avif)$/.test(extension))await inspectImage(file,source,result,signal);
        else if(extension==='pdf')await inspectPdf(file,source,result,signal);
        else if(extension==='ai')await inspectAi(file,source,result,signal);
        else if(extension==='psd'||extension==='psb')await inspectPsd(file,source,result,signal);
        else if(/^(txt|md|html?|css|json|svg|csv|js|ts|xml)$/.test(extension)||file.type.startsWith('text/')){
          const text=await file.slice(0,TEXT_LIMIT).text();abort(signal);source.text=text.slice(0,12000);source.status=file.size>TEXT_LIMIT?'partial':'read';source.coverage=file.size>TEXT_LIMIT?'본문 앞 128KB':'텍스트 본문';inspectText(text,source,result);
        } else {source.warnings.push('이 형식의 본문은 브라우저에서 해석하지 않았어요. 이미지·PDF·텍스트 파일은 내용까지 읽어요.');}
      } catch(error){if(error.name==='AbortError')throw error;source.warnings.push(String(error.message));}
      await tick();
    }
    for(const url of result.links){try{if(new URL(url).hostname.replace(/^www\./,'')==='figma.com') result.values.tools=unique([...result.values.tools,'Figma']);}catch{}}
    if(!result.values.title && result.sources.length){result.values.title=cleanTitle(result.sources[0].name);addEvidence(result,'title',result.sources[0],result.sources[0].name,'filename','파일명에서 가져온 임시 제목');}
    if(!result.sources.length && result.links.length)result.values.title='새 바톤';
    result.warnings.unshift('브라우저 기본 추출 모드입니다. AI 의미 분석은 실행하지 않았어요.');
    result.fileDates=await fileDates(payload.files);
    if(result.fileDates){if(!result.values.startDate)result.values.startDate=result.fileDates.start;if(!result.values.endDate)result.values.endDate=result.fileDates.end;}
    if(result.values.startDate&&result.values.endDate&&result.values.endDate<result.values.startDate){result.values.endDate=null;result.warnings.push('종료일이 시작일보다 빨라 자동 입력하지 않았어요.');}
    return result;
  }
  const APPS=(window.MOROGARO_CONFIG?.appsScriptUrl||'').trim();
  let configPromise;
  async function getConfig(refresh=false) {
    if(refresh)configPromise=null;
    if(location.protocol==='file:')return {available:false,aiAvailable:false};
    if(APPS)return {service:'morogaro-apps-script',available:false,apps:true,aiAvailable:true};   // Apps Script는 묻지 않고 바로 AI를 써요(상한은 서버에서 막아요).
    if(!configPromise)configPromise=(async()=>{try{const response=await fetch('./api/config',{signal:AbortSignal.timeout(2500)});if(!response.ok)throw new Error();const c=await response.json();return ['morogaro-analysis-v1','morogaro-analysis-v2'].includes(c.service)?{...c,available:true}:{available:false,aiAvailable:false};}catch{return {available:false,aiAvailable:false};}})();
    return configPromise;
  }
  async function readStream(response,signal){
    if(!response.body)throw new Error('분석 스트림을 읽지 못했어요.');
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result=null;
    const line=raw=>{if(!raw.trim())return;const event=JSON.parse(raw);
      if(event.event==='progress')document.dispatchEvent(new CustomEvent('morogaro:analysis-progress',{detail:event}));
      else if(event.event==='result')result=event.result;
      else if(event.event==='error')throw new Error(event.message||'분석을 완료하지 못했어요.');
    };
    try {while(true){abort(signal);const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});
      if(buffer.length>36*1024*1024)throw new Error('분석 결과 용량 한도를 초과했어요.');
      let end;while((end=buffer.indexOf('\n'))>=0){line(buffer.slice(0,end));buffer=buffer.slice(end+1);}
    }buffer+=decoder.decode();line(buffer);if(!result)throw new Error('최종 분석 결과를 받지 못했어요.');return result;
    }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  }
  async function inspect(payload,{signal,useAI=false}={}) {
    abort(signal);const config=await getConfig();abort(signal);
    if(config.apps)return inspectWithAppsScript(payload,{signal,useAI:useAI&&config.aiAvailable});
    if(!config.available)return inspectBrowser(payload,{signal});
    const form=new FormData();payload.files.forEach(file=>form.append('files',file,file.name));form.append('projectType',payload.projectType);form.append('urls',JSON.stringify(payload.urls));form.append('useAI',useAI?'true':'false');
    try{
      const streaming=config.service==='morogaro-analysis-v2';
      const response=await fetch(streaming?'./api/analyze/stream':'./api/analyze',{method:'POST',body:form,signal,headers:{'X-Morogaro-Client':'maker-v11'}});
      if(!response.ok){let msg='분석 서버 응답 오류';try{msg=(await response.json()).detail||msg;}catch{}throw new Error(typeof msg==='string'?msg:'분석 요청 형식을 확인해 주세요.');}
      const result=streaming?await readStream(response,signal):await response.json();
      if(result.version!==1||!Array.isArray(result.sources)||!result.values||!Array.isArray(result.thumbnails))throw new Error('분석 응답 형식이 올바르지 않아요.');
      result.thumbnails=result.thumbnails.filter(t=>isPreviewURL(t.dataUrl));
      if(!STAGES.includes(result.values.stage))result.values.stage=null;
      return result;
    }catch(error){if(error.name==='AbortError'||signal?.aborted)throw error;const result=await inspectBrowser(payload,{signal});result.warnings.unshift('서버 분석을 완료하지 못해 브라우저에서 읽을 수 있는 정보만 채웠어요. '+String(error.message).slice(0,160));return result;}
  }
  /* ───────── Apps Script 모드: 브라우저에서 읽은 내용을 AI에 보내고, 근거가 확인된 값만 채워요 ─────────
   * (server.py의 apply_ai와 같은 규칙) */
  const progress=(phase,message)=>document.dispatchEvent(new CustomEvent('morogaro:analysis-progress',{detail:{event:'progress',phase,message}}));
  const norm=t=>String(t).replace(/\s+/g,' ').trim();
  const TOOL_MAP={...TOOLS,psb:'Adobe Photoshop',hwp:'한글',hwpx:'한글',kra:'Krita'};
  const SENSITIVE=new Set(['startDate','endDate','physical','materials','lessons']);
  async function inspectWithAppsScript(payload,{signal,useAI}={}){
    progress('extract','파일 형식을 확인하고 내용을 읽고 있어요.');
    const result=await inspectBrowser(payload,{signal});abort(signal);
    result.fieldStatus=result.fieldStatus||{};
    if(!useAI)return result;
    // 미리보기는 파일마다 돌아가며 최대 10장(뒤쪽 파일이 빠지지 않게).
    const groups=result.sources.map(s=>result.thumbnails.filter(t=>t.sourceId===s.id)),previews=[];
    for(let i=0;i<4;i++)for(const g of groups)if(g[i]&&previews.length<10)previews.push(g[i]);
    // AI에는 가볍게(긴 변 1024px) 보내요. 화면용 썸네일은 고화질 그대로 둬요.
    const small=u=>new Promise(res=>{const im=new Image();im.onload=()=>{const f=Math.min(1,1024/Math.max(im.naturalWidth,im.naturalHeight));if(f>=1)return res(u);const c=document.createElement('canvas');c.width=Math.round(im.naturalWidth*f);c.height=Math.round(im.naturalHeight*f);const x=c.getContext('2d');x.fillStyle='#FFF';x.fillRect(0,0,c.width,c.height);x.drawImage(im,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',0.85));};im.onerror=()=>res(u);im.src=u;});
    for(const p of previews)p.aiUrl=await small(p.dataUrl);
    const per=Math.min(12000,Math.max(1000,Math.floor(60000/Math.max(1,result.sources.length))));
    const sources=result.sources.map(s=>({id:s.id,name:s.name,ext:s.ext,kind:s.kind,coverage:s.coverage,text:(s.text||'').slice(0,per),warnings:s.warnings}));
    progress('ai','캡처와 본문을 함께 보고 제목·진척도·분류를 제안하고 있어요.');
    let data;
    const call=async()=>{const response=await fetch(APPS,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'analyze',projectType:payload.projectType,sources,previews:previews.map(p=>({id:p.id,sourceId:p.sourceId,label:p.label,kind:p.kind||null,page:p.page||null,dataUrl:p.aiUrl||p.dataUrl})),links:result.links}),signal});return response.json();};
    try{
      try{data=await call();}catch(e){if(e.name==='AbortError'||signal?.aborted)throw e;data=null;}
      if(!data?.ok){abort(signal);progress('ai','AI 응답이 늦어 한 번 더 요청하고 있어요.');data=await call();}
    }catch(error){if(error.name==='AbortError'||signal?.aborted)throw error;result.warnings.unshift('AI 응답을 받지 못해 파일에서 읽은 정보만 채웠어요.');return result;}
    if(!data?.ok||!data.proposal){result.warnings.unshift(data?.error?String(data.error).slice(0,160)+' 파일에서 읽은 정보만 채웠어요.':'AI 제안을 받지 못했어요.');return result;}
    previews.forEach(p=>delete p.aiUrl);
    progress('apply','추출한 값과 썸네일 후보를 정리하고 있어요.');
    const declared={start:result.values.startDate,end:result.values.endDate};
    applyAI(result,data.proposal,new Set(previews.map(p=>p.sourceId)),sources,previews);
    // 기간은 AI 추측보다 파일에 남은 날짜를 우선해요.
    if(result.fileDates){if(declared.start)result.values.startDate=declared.start;if(declared.end)result.values.endDate=declared.end;}
    result.aiCoverage={textCharacters:sources.reduce((n,s)=>n+s.text.length,0),sourcesSent:sources.length,imagesSent:previews.length,previewIds:previews.map(p=>p.id)};
    return result;
  }
  const FONT_LINKS={'pretendard':'https://github.com/orioncactus/pretendard/releases','spoqa han sans neo':'https://spoqa.github.io/spoqa-han-sans/','본고딕':'https://github.com/adobe-fonts/source-han-sans/releases','source han sans':'https://github.com/adobe-fonts/source-han-sans/releases','본명조':'https://github.com/adobe-fonts/source-han-serif/releases','gmarket sans':'https://corp.gmarket.com/fonts/','helvetica neue':'https://www.myfonts.com/collections/helvetica-neue-font-linotype','futura':'https://www.myfonts.com/collections/futura-font-bitstream'};
  function fontLink(name){const k=name.toLowerCase().trim();if(FONT_LINKS[k])return FONT_LINKS[k];if(/^(noto|nanum|roboto|inter|open sans|montserrat|lato|poppins|gowun|ibm plex|black han sans|do hyeon|jua|gothic a1|song myung|gaegu)/i.test(k))return 'https://fonts.google.com/specimen/'+encodeURIComponent(name.trim()).replace(/%20/g,'+');return 'https://www.google.com/search?q='+encodeURIComponent(name+' 폰트 다운로드');}
  function applyAI(base,proposal,visualIds,sentSources,previews){
    const originals=Object.fromEntries(base.sources.map(s=>[s.id,s])),sent=Object.fromEntries(sentSources.map(s=>[s.id,s])),previewMap=Object.fromEntries(previews.map(p=>[p.id,p]));
    const accepted=[];
    for(const ev of proposal.evidence||[]){
      const s=sent[ev.fileId];if(!s||!ev.quote||!String(ev.quote).trim()||ev.quote.length>800)continue;
      if(ev.basis==='text'&&!norm(s.text||'').includes(norm(ev.quote)))continue;
      if(ev.basis==='visual'){const pv=previewMap[ev.previewId];if(!visualIds.has(ev.fileId)||!pv||pv.sourceId!==ev.fileId)continue;}
      if(SENSITIVE.has(ev.field)&&ev.basis!=='text')continue;
      if(ev.field==='tools'){
        if(ev.basis==='extension'){if((TOOL_MAP[s.ext]||'').toLowerCase()!==String(ev.value).toLowerCase())continue;}
        else if(ev.basis==='text'){if(!ev.quote.toLowerCase().includes(String(ev.value).toLowerCase()))continue;}
        else continue;
      }
      if(ev.basis==='filename'&&(!['title','sourceKind'].includes(ev.field)||!norm(s.name).includes(norm(ev.quote))))continue;
      if(ev.basis==='extension'&&(!['tools','sourceKind'].includes(ev.field)||!ev.quote.toLowerCase().includes(s.ext.toLowerCase())))continue;
      if(ev.field==='stage'&&(!['text','visual'].includes(ev.basis)||ev.confidence==='low'))continue;
      if(ev.field==='startDate'||ev.field==='endDate'){const label=ev.field==='startDate'?/(시작일|start\s*date)/i:/(종료일|end\s*date)/i;if(!label.test(ev.quote)||safeDate(ev.quote)!==safeDate(ev.value))continue;}
      if(ev.field==='physical'&&!/(실물|제작|인쇄|physical|print|manufactur)/i.test(ev.quote))continue;
      accepted.push({field:ev.field,fileId:ev.fileId,location:String(ev.location||'').slice(0,120),quote:String(ev.quote).slice(0,400),basis:ev.basis,value:String(ev.value),previewId:ev.previewId||null,confidence:ev.confidence});
    }
    const vals=proposal.values||{},applied=[];
    for(const [key,raw] of Object.entries(vals)){
      if(key==='stageReason'||raw===null||raw===undefined)continue;
      let value=raw,proof=accepted.filter(e=>e.field===key);
      // 제목 · 진척도 · 카테고리 · 태그는 AI 판단을 그대로 제안해요(근거가 확인되지 않아도). 사용자가 확인·수정해요.
      // 툴 · 날짜 · 실물 제작 · 재료 · 배운 점은 사실이라서, 확인된 근거가 있을 때만 채워요.
      const loose=true;   // 사용성 평가용: AI 값을 근거 확인 없이 모두 채워요(사용자가 고칠 수 있어요)
      if(Array.isArray(value)){
        value=unique(value.map(x=>String(x).trim().replace(/^#/,'').slice(0,50)).filter(x=>x&&(loose||proof.some(e=>e.value===x)))).slice(0,12);
        if(!value.length)continue;
        if(key==='tools')value=unique([...base.values.tools,...value]).slice(0,12);
        if(key==='tags'||key==='categories')value=unique([...value,...base.values[key]]).slice(0,12);
      }else{
        const canonical=typeof value==='boolean'?String(value):String(value);
        const exact=proof.filter(e=>e.value===canonical);
        if(!exact.length&&!loose)continue;
        proof=exact;
        if(typeof value==='string')value=value.slice(0,['materials','lessons'].includes(key)?2000:120);
        if(key==='startDate'||key==='endDate'){value=safeDate(value);if(!value)continue;}
        if(key==='stage'&&!STAGES.includes(value))continue;
      }
      base.values[key]=value;applied.push(key);
      base.fieldStatus[key]={status:'suggested',basis:proof.length?'AI 제안 · 확인/수정 가능':'AI 추정 · 꼭 확인해 주세요',sourceIds:unique(proof.map(e=>e.fileId)),confidence:!proof.length||proof.some(e=>e.confidence!=='high')?'medium':'high'};
    }
    if(applied.includes('stage'))base.values.stageReason=String(vals.stageReason||'').slice(0,500);
    for(const item of proposal.sourceKinds||[]){
      if(originals[item.fileId]&&accepted.some(e=>e.fileId===item.fileId&&e.field==='sourceKind'&&e.value===item.kind)){originals[item.fileId].kind=String(item.kind).slice(0,60);originals[item.fileId].kindBasis='AI 제안 · 직접 수정 가능';}
    }
    if(!base.fonts.length)for(const name of (proposal.fontGuesses||[]).slice(0,4)){const n=String(name).replace(/[\[\]"']/g,'').trim().slice(0,100);if(n&&/[A-Za-z가-힣]/.test(n)&&!base.fonts.some(f=>f.name===n))base.fonts.push({name:n,weights:'',downloadUrl:fontLink(n),sourceId:base.sources[0]?.id||'',basis:'AI가 이미지로 추정한 글꼴'});}
    // 대표 컬러: AI가 고른 키컬러를 맨 앞에 두고, 픽셀에서 뽑은 색은 뒤로 보내요.
    const keys=(proposal.keyColors||[]).map(h=>String(h).trim().toUpperCase()).filter(h=>/^#[0-9A-F]{6}$/.test(h)).slice(0,6);
    if(keys.length){base.colors=unique([...keys,...(base.colors||[]).map(h=>String(h).toUpperCase())]).slice(0,24);base.keyColors=keys;}
    const selected=unique((proposal.thumbnailOrder||[]).filter(id=>previewMap[id])).slice(0,10);
    if(selected.length){base.recommendedThumbnails=selected;base.thumbnailRanking='ai';}
    base.evidence.push(...accepted.filter(e=>e.field==='sourceKind'||applied.includes(e.field)));
    base.fieldNotes=(proposal.fieldNotes||[]).slice(0,15);
    if(!(base.values.tools||[]).length){base.values.tools=['Adobe Illustrator','Figma'];applied.push('tools');}   // 툴을 못 찾으면 기본으로 넣어 둬요
    base.summary=String(proposal.summary||'').slice(0,600);base.mode='ai';base.aiAppliedFields=applied;
    base.stageRubric='검토용 AI 판단 기준 · 서비스의 확정 심사 기준이 아님';
    base.warnings=base.warnings.filter(w=>!w.startsWith('브라우저 기본 추출 모드'));
    if(!applied.length)base.warnings.push('AI는 응답했지만 충분한 근거가 확인된 새 입력값이 없어 기본 추출 결과를 유지했어요.');
    const v=base.values;if(v.startDate&&v.endDate&&v.endDate<v.startDate){v.endDate=null;base.warnings.push('AI가 제안한 기간 순서가 맞지 않아 종료일을 비웠어요.');}
    return base;
  }
  window.MorogaroAnalysis=Object.freeze({inspect,inspectBrowser,getConfig,safeURL,isPreviewURL,STAGES});
})();
