/* v11 — real, bounded browser inspection. This is NOT an AI model.
 * A same-origin Python service adds multi-format extraction and grounded AI proposals.
 * File content is never executed; linked URLs are not fetched. */
(() => {
  'use strict';
  const MAX_FILE = 50 * 1024 * 1024;
  const MAX_TOTAL = 100 * 1024 * 1024;
  const TEXT_LIMIT = 128 * 1024;
  const STAGES = ['Seeding', 'Planting', 'Growing', 'Blooming'];
  const TYPES = {ai:'디자인 원본 파일',psd:'디자인 원본 파일',fig:'디자인 원본 파일',sketch:'디자인 원본 파일',blend:'3D 원본 파일',pdf:'문서',docx:'문서',pptx:'문서',txt:'메모',md:'메모',html:'코드',css:'코드',js:'코드',json:'데이터',svg:'벡터 이미지',png:'이미지',jpg:'이미지',jpeg:'이미지',webp:'이미지',gif:'이미지'};
  const TOOLS = {ai:'Adobe Illustrator',psd:'Adobe Photoshop',fig:'Figma',sketch:'Sketch',blend:'Blender'};
  const blankValues = () => ({title:'',stage:null,stageReason:'파일만으로 진척도를 단정하지 않았어요. 지금 상태에 맞게 선택해 주세요.',categories:[],tools:[],tags:[],startDate:null,endDate:null,physical:null,materials:'',lessons:''});
  const ext = name => (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
  const unique = xs => [...new Set(xs.filter(Boolean))];
  const abort = signal => { if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError'); };
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  const cleanTitle = name => name.replace(/\.[^.]+$/, '').replace(/[_-](?:ai|pdf|docx|png|jpg)$/i, '').replace(/[_]+/g, ' ').slice(0,120);
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
      const canvas=document.createElement('canvas');const factor=Math.min(1,640/Math.max(w,h));canvas.width=Math.max(1,Math.round(w*factor));canvas.height=Math.max(1,Math.round(h*factor));
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,canvas.width,canvas.height);
      result.thumbnails.push({id:source.id+'-thumb',sourceId:source.id,label:source.name,dataUrl:canvas.toDataURL('image/png')});
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
  async function inspectBrowser(payload, {signal}={}) {
    const result=newResult(payload);
    if(payload.files.length>20 || payload.files.reduce((s,f)=>s+f.size,0)>MAX_TOTAL)result.warnings.push('분석 범위를 초과한 파일은 기본 정보만 유지합니다 (20개 / 합계 100MB).');
    let bytes=0;
    for (let i=0;i<payload.files.length;i++) {
      abort(signal);const file=payload.files[i],extension=ext(file.name);
      const source={id:'f'+i,name:file.name,size:file.size,ext:extension,kind:TYPES[extension]||'기타 파일',kindBasis:'확장자 기준 · 직접 변경 가능',status:'metadata',coverage:'파일명·확장자·용량만 확인',warnings:[],text:''};result.sources.push(source);
      if(TOOLS[extension]){result.values.tools=unique([...result.values.tools,TOOLS[extension]]);addEvidence(result,'tools',source,extension+' 확장자에 연결된 툴 후보','extension','파일 형식');}
      bytes+=file.size;
      if(file.size>MAX_FILE||i>=20||bytes>MAX_TOTAL){source.warnings.push('브라우저 분석 크기 제한을 초과했어요.');continue;}
      try {
        if(/^(png|jpe?g|webp|gif|bmp|avif)$/.test(extension))await inspectImage(file,source,result,signal);
        else if(/^(txt|md|html?|css|json|svg|csv|js|ts|xml)$/.test(extension)||file.type.startsWith('text/')){
          const text=await file.slice(0,TEXT_LIMIT).text();abort(signal);source.text=text.slice(0,12000);source.status=file.size>TEXT_LIMIT?'partial':'read';source.coverage=file.size>TEXT_LIMIT?'본문 앞 128KB':'텍스트 본문';inspectText(text,source,result);
        } else {source.warnings.push('이 형식의 본문은 브라우저에서 해석하지 않았어요. PDF·DOCX는 함께 제공된 분석 서버로 읽을 수 있어요.');}
      } catch(error){if(error.name==='AbortError')throw error;source.warnings.push(String(error.message));}
      await tick();
    }
    for(const url of result.links){try{if(new URL(url).hostname.replace(/^www\./,'')==='figma.com') result.values.tools=unique([...result.values.tools,'Figma']);}catch{}}
    if(!result.values.title && result.sources.length){result.values.title=cleanTitle(result.sources[0].name);addEvidence(result,'title',result.sources[0],result.sources[0].name,'filename','파일명에서 가져온 임시 제목');}
    if(!result.sources.length && result.links.length)result.values.title='새 바톤';
    result.warnings.unshift('브라우저 기본 추출 모드입니다. AI 의미 분석은 실행하지 않았어요.');
    if(result.values.startDate&&result.values.endDate&&result.values.endDate<result.values.startDate){result.values.endDate=null;result.warnings.push('종료일이 시작일보다 빨라 자동 입력하지 않았어요.');}
    return result;
  }
  let configPromise;
  async function getConfig(refresh=false) {
    if(refresh)configPromise=null;
    if(location.protocol==='file:')return {available:false,aiAvailable:false};
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
  window.MorogaroAnalysis=Object.freeze({inspect,inspectBrowser,getConfig,safeURL,isPreviewURL,STAGES});
})();
