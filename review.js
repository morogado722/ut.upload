/* v11 — step 1 -> multi-format inspection/AI -> editable Figma file-info screen.
 * Semantic AI proposals, measured values and manual edits remain distinct.
 * Files stay in the existing maker state; no page navigation serializes Files.
 */
(() => {
  'use strict';
  const $=id=>document.getElementById(id), maker=window.MorogaroMaker, analysis=window.MorogaroAnalysis;
  if(!maker||!analysis||!window.MorogaroLoading)return;
  const workspace=document.querySelector('.workspace'),stageRoot=document.querySelector('.stage');
  const STAGES=['Seeding','Planting','Growing','Blooming','Flowering'];
  const FIELDS={title:'바톤 제목',stage:'바톤 진척도',categories:'카테고리',tools:'사용 툴',tags:'스타일 태그',startDate:'시작일',endDate:'종료일',physical:'실물 제작 여부',materials:'소재 및 후가공',lessons:'제작하면서 알게된 점',colors:'컬러팔레트',sourceKind:'파일 분류'};
  let review=null, currentPage=1, starting=false, useAI=false, activeField='all', colorMode='rgb';
  let lastDialogFocus=null, consentResolve=null, sessionChoice=null, forceAnalysis=false, thumbnailFilter='all';
  let pendingReviewStep=2;
  const E=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
  const img=(src,cls='')=>{const n=E('img',cls);n.src=src;n.alt='';return n;};
  const button=(text,cls,fn)=>{const n=E('button',cls,text);n.type='button';if(fn)n.addEventListener('click',fn);return n;};
  const say=message=>document.dispatchEvent(new CustomEvent('morogaro:feedback',{detail:{message}}));
  const formatSize=n=>n>=1024*1024?(n/1024/1024).toFixed(1)+' MB':n>=1024?(n/1024).toFixed(1)+' KB':n+' B';
  const clone=value=>structuredClone(value);
  function fingerprint(){const s=maker.getState();return JSON.stringify({projectType:s.projectType,files:s.files.map(f=>[f.id,f.name,f.size,f.lastModified]),urls:s.links.map(l=>l.href)});}
  function savedReview(){const saved=maker.getReview();return saved?.version===1&&saved.result?.version===1&&saved.form?saved:null;}
  function persist(key){
    if(!review)return;
    if(key&&!review.touched.includes(key))review.touched.push(key);
    review.modifiedAt=new Date().toISOString();maker.setReview(review);
  }
  function sanitizeResult(result){
    result.thumbnails=(result.thumbnails||[]).filter(t=>t&&analysis.isPreviewURL(t.dataUrl)).slice(0,100);
    result.colors=[...new Set((result.colors||[]).filter(h=>/^#[0-9A-F]{6}$/i.test(h)))].slice(0,24);
    if(!analysis.STAGES.includes(result.values.stage))result.values.stage=null;
    return result;
  }
  function makeReview(result,key){
    result=sanitizeResult(result);
    const firstSize=result.dimensions?.[0];
    if(!(result.values.tools||[]).length)result.values.tools=['Adobe Illustrator','Figma'];   // 툴을 못 찾으면 기본값
    const out={version:1,fingerprint:key,result,form:{...result.values,sourceKinds:Object.fromEntries(result.sources.map(s=>[s.id,s.kind])),dimensions:firstSize?clone(firstSize):{id:'custom',width:null,height:null,unit:'px',basis:'규격 미확인'},palette:(result.keyColors?.length?result.keyColors:result.colors).slice(0,6),fonts:clone(result.fonts||[])},selectedThumbnails:result.thumbnails.length?[result.recommendedThumbnails?.find(id=>result.thumbnails.some(t=>t.id===id))||result.thumbnails[0].id]:[],touched:[],modifiedAt:new Date().toISOString()};
    const old=savedReview();
    if(old&&old.fingerprint===key){   // 같은 파일을 다시 분석할 때만 직접 고친 값을 이어받아요. 새 파일이면 처음부터.
      const retain=['title','stage','categories','tools','tags','startDate','endDate','physical','materials','lessons','fonts','palette','dimensions','batonNote','nextIdeas','noteChecklist','noteDraft','references','colorMode'];
      for(const k of old.touched.filter(k=>retain.includes(k))){out.form[k]=clone(old.form[k]);out.touched.push(k);}
      if(out.touched.length)out.result.warnings.push('다시 분석하면서 직접 수정한 값은 덮어쓰지 않았어요. 새 제안은 근거·추출 범위에서 확인할 수 있어요.');
      const custom=old.result.thumbnails.filter(t=>t.sourceId==='custom'&&analysis.isPreviewURL(t.dataUrl));
      out.result.thumbnails.push(...custom.filter(t=>!out.result.thumbnails.some(p=>p.id===t.id)));
      if(old.touched.includes('thumbnails')){out.selectedThumbnails=old.selectedThumbnails.filter(id=>out.result.thumbnails.some(p=>p.id===id));out.touched.push('thumbnails');}
      if(old.touched.includes('sourceKinds')){for(const source of out.result.sources){const prev=old.result.sources.find(p=>p.id===source.id&&p.sha256===source.sha256);if(prev)out.form.sourceKinds[source.id]=old.form.sourceKinds[source.id];}out.touched.push('sourceKinds');}
    }
    return out;
  }
  /* 소스 확인 화면에 처음 들어올 때: 프로젝트 유형 → 제목 → 소스 확인(과 그 아래)이 시간차로 하나씩 올라오고,
     다 올라온 뒤 배경에 단계 색이 천천히 번져요. 글자·버튼의 단계 색은 처음부터 맞춰 둬요. */
  let entranceTimer=0;
  function playReviewEntrance(){
    const root=document.documentElement;
    clearTimeout(entranceTimer);
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){root.classList.remove('ambient-hold');return;}
    workspace.classList.remove('is-entering');void workspace.offsetWidth;workspace.classList.add('is-entering');
    root.classList.add('ambient-hold');
    entranceTimer=setTimeout(()=>{
      root.classList.add('ambient-reveal');root.classList.remove('ambient-hold');
      entranceTimer=setTimeout(()=>{root.classList.remove('ambient-reveal');workspace.classList.remove('is-entering');},2400);
    },1900);
  }
  function showPage(page,{replace=false,focus=true}={}){
    if(page===2&&!review)return;
    const enteringReview=page===2&&currentPage!==2;currentPage=page;workspace.hidden=false;document.getElementById('baton-detail').hidden=true;workspace.classList.toggle('is-review',page===2);stageRoot.dataset.page=page===2?'review':'upload';
    stageRoot.dataset.nodeId=page===2?'3516:28759':maker.getState().files.length?'3421:2193':'3421:2057';
    $('review-intro').hidden=page!==2;$('review-content').hidden=page!==2;
    workspace.setAttribute('aria-labelledby',page===2?'review-heading':'page-title');
    document.querySelector('.skip-link').href=page===2?'#review-title':'#file-dropzone';
    window.MorogaroStepper?.setPage(page);
    window.MorogaroAmbient?.set(page===2?review.form.stage:null);if(enteringReview)playReviewEntrance();
    document.dispatchEvent(new CustomEvent('morogaro:maker-page',{detail:{page}}));
    document.title=(page===2?'파일 정보 확인':'바톤 올리기')+' · 모로가도';
    const target=page===2?'#file-info':'#upload';
    if(location.hash!==target){try{history[replace?'replaceState':'pushState']({makerPage:page},'',target);}catch{location.hash=target;}}
    window.scrollTo({top:0,behavior:'instant'});window.MorogaroHeader?.sync();
    requestAnimationFrame(()=>{if(page===2)fitTitle();if(focus)(page===2?$('review-heading'):$('file-dropzone')).focus({preventScroll:true});});
  }
  function modeText(){return review.result.mode==='ai'?'AI가 파일을 보고 제안했어요 · 수정 가능':review.result.mode==='server_fallback'?'AI 연결 확인 필요 · 파일 기본 정보는 채웠어요':'파일에서 직접 확인한 정보 · AI 제안 없음';}
  function renderSources(){
    $('review-source-count').textContent=`파일 ${review.result.sources.filter(s=>!s.parentId).length} · 링크 ${review.result.links.length}`+(review.result.sources.some(s=>s.parentId)?` · 압축 내부 ${review.result.sources.filter(s=>s.parentId).length}개`:'');
    const container=$('review-sources');container.replaceChildren();
    for(const source of review.result.sources){
      const row=E('div','review-source');row.dataset.sourceId=source.id;row.classList.toggle('is-archive-member',Boolean(source.parentId));
      row.append(E('span','file-extension',(source.ext||'file').slice(0,5)+'.'));
      const main=E('div','review-source-main');const name=E('span','review-source-name',source.name);name.title=source.name;main.append(name);
      const meta=E('div','review-source-meta',`${source.ext||'일반'} 파일 · ${formatSize(source.size)}`);
      if(source.status!=='read'){const flag=button(source.status==='partial'?'일부 확인':'내용 미확인','coverage-flag',()=>openEvidence('source:'+source.id));flag.title=source.coverage;meta.append(flag);}
      main.append(meta);row.append(main);
      const select=E('select');select.setAttribute('aria-label',source.name+' 파일 분류');select.title=source.kindBasis||'직접 변경할 수 있어요.';
      const options=[...new Set([review.form.sourceKinds[source.id], '디자인 원본 파일','인쇄용 칼선 파일','인쇄용 파일','기획서','문서','이미지','벡터 이미지','참고 자료','코드','데이터','메모','3D 원본 파일','영상','오디오','압축파일','기타 파일'].filter(Boolean))];
      for(const name of options){const o=E('option','',name);o.value=name;select.append(o);}
      select.value=review.form.sourceKinds[source.id]||source.kind;
      select.addEventListener('change',()=>{review.form.sourceKinds[source.id]=select.value;persist('sourceKinds');});row.append(select);container.append(row);
    }
    for(const href of review.result.links){
      const safe=analysis.safeURL(href);if(!safe)continue;
      const row=E('div','review-source');const icon=E('span','review-link-icon');icon.append(img('./assets/link.svg'));row.append(icon);
      const main=E('div','review-source-main');main.append(E('span','review-source-name',(new URL(safe).hostname.replace(/^www\./,'')==='figma.com'?'피그마 링크':'참고 링크')));
      const a=E('a','',safe);a.href=safe;a.target='_blank';a.rel='noopener noreferrer';main.append(a);row.append(main);container.append(row);
    }
  }
  function renderStages(){
    if(currentPage===2)window.MorogaroAmbient?.set(review.form.stage);
    const host=$('stage-options');host.replaceChildren();const current=STAGES.indexOf(review.form.stage);
    STAGES.forEach((name,index)=>{
      const card=E('div','stage-option');card.classList.toggle('is-selected',index===current);card.classList.toggle('is-past',index<current);
      const choice=button('','stage-choice',()=>{
        if(name==='Flowering'){showInfo('flowering');return;}
        review.form.stage=name;persist('stage');renderStages();
      });choice.setAttribute('aria-label',name+(name==='Flowering'?' · 서비스 선정 단계':''));choice.setAttribute('aria-pressed',String(name===review.form.stage));
      if(name==='Flowering')choice.setAttribute('aria-disabled','true');
      const art=E('span','stage-illustration');art.append(img(`./assets/stage-${name.toLowerCase()}${index===current?'-on':''}.svg`));choice.append(art,E('span','stage-label',name));card.append(choice,E('span','stage-meter'));
      if(index===current){const bubble=button('','stage-bubble',()=>openEvidence('stage'));const aiStage=review.result.values?.stage,differs=review.touched.includes('stage')&&aiStage&&aiStage!==name;const label=E('span','',differs?'AI 판단과 달라요 · ':'AI가 판단한 진척도 · ');label.append(E('strong','','근거 보기'));bubble.append(label);if(differs)bubble.classList.add('is-warning');card.append(bubble);}
      host.append(card);
    });
    $('stage-provenance').textContent=review.touched.includes('stage')?(review.result.values?.stage&&review.result.values.stage!==review.form.stage?`AI는 올린 작업을 보고 ${review.result.values.stage}로 판단했어요. 지금 단계가 맞는지 한 번 더 확인해 주세요.`:(review.result.values?.stageReason||'AI가 판단한 단계예요.')):review.form.stage?review.result.values.stageReason:'현재 바톤의 단계를 선택해 주세요.';
  }
  function renderThumbnails(){
    $('thumbnail-candidate-count').textContent=`파일에서 추출한 후보 ${review.result.thumbnails.length}개`;
    const valid=new Set(review.result.thumbnails.map(t=>t.id));review.selectedThumbnails=review.selectedThumbnails.filter(id=>valid.has(id)).slice(0,10);
    $('selected-count').textContent=review.selectedThumbnails.length;
    const cover=review.result.thumbnails.find(t=>t.id===review.selectedThumbnails[0]);$('cover-preview').replaceChildren();
    if(cover){const im=img(cover.dataUrl);im.alt='대표 썸네일: '+cover.label;$('cover-preview').append(im);}else $('cover-preview').append(E('span','','대표 이미지를 골라주세요'));
    applyRatio();
    const grid=$('thumbnail-grid');grid.replaceChildren();$('thumbnail-empty').hidden=review.result.thumbnails.length>0;
    for(const thumb of review.result.thumbnails.filter(t=>thumbnailFilter==='all'||t.sourceId===thumbnailFilter)){
      const selected=review.selectedThumbnails.indexOf(thumb.id);
      const tile=button('','thumbnail-tile',()=>{
        const index=review.selectedThumbnails.indexOf(thumb.id);
        if(index>=0)review.selectedThumbnails.splice(index,1);
        else if(review.selectedThumbnails.length<10)review.selectedThumbnails.push(thumb.id);
        else {say('썸네일은 최대 10개까지 선택할 수 있어요.');return;}
        persist('thumbnails');renderThumbnails();
      });tile.setAttribute('aria-pressed',String(selected>=0));tile.setAttribute('aria-label',thumb.label+(selected>=0?` · ${selected+1}번째 선택, 선택 해제`:' · 썸네일로 선택'));tile.title=thumb.label;
      tile.append(img(thumb.dataUrl,'thumbnail-image'),img('./assets/review-check-'+(selected>=0?'on':'off')+'.svg','thumb-check'));
      if(selected>=0)tile.append(E('span','thumb-index',selected+1));
      const source=review.result.sources.find(s=>s.id===thumb.sourceId);
      const location=thumb.seconds!=null?`${Math.floor(thumb.seconds/60).toString().padStart(2,'0')}:${Math.floor(thumb.seconds%60).toString().padStart(2,'0')}`:thumb.page?`${thumb.page}${thumb.kind==='frame'?'프레임':'페이지'}`:thumb.kind==='table'?'표 데이터':thumb.kind==='embedded'?'포함 이미지':'이미지';
      const caption=E('span','thumb-caption',location+' · '+(source?.name||'직접 추가'));tile.append(caption);grid.append(tile);
    }
  }
  function chipEditor(field){
    const container=$(field+'-field');if(container.querySelector('form')){container.querySelector('input').focus();return;}
    const form=E('form','chip-editor');const input=E('input');input.maxLength=50;input.placeholder=FIELDS[field]+' 추가';input.setAttribute('aria-label',FIELDS[field]+' 추가');
    const ok=button('추가','chip-add');ok.type='submit';form.append(input,ok);container.append(form);input.focus();
    input.addEventListener('keydown',event=>{if(event.key==='Escape'){form.remove();event.preventDefault();}});
    form.addEventListener('submit',event=>{event.preventDefault();const value=input.value.trim().replace(/^#/,'');if(!value)return;if(review.form[field].length>=12){say('최대 12개까지 추가할 수 있어요.');return;}
      if(!review.form[field].includes(value))review.form[field].push(value);persist(field);renderChips(field);if(field==='categories')renderProduction();});
  }
  function renderChips(field){
    const container=$(field+'-field');container.replaceChildren();
    for(const value of review.form[field]||[]){const chip=E('span','review-chip');chip.append(E('span','',(field==='tags'?'#':'')+value));const remove=button('×','',()=>{review.form[field]=review.form[field].filter(s=>s!==value);persist(field);renderChips(field);if(field==='categories')renderProduction();});remove.setAttribute('aria-label',value+' 삭제');chip.append(remove);container.append(chip);}
    if(!review.form[field]?.length)container.append(E('span','chip-empty','직접 추가할 수 있어요'));
    const add=button('+','chip-add',()=>chipEditor(field));add.setAttribute('aria-label',FIELDS[field]+' 추가');container.append(add);
  }
  function renderProduction(){
    const relevant=review.form.categories.some(s=>/(굿즈|인쇄|출판|패키지|제품|goods|print|product)/i.test(s));
    $('production-row').hidden=!relevant;
    $('physical-made').indeterminate=review.form.physical===null;$('physical-made').checked=review.form.physical===true;
    $('physical-status').textContent=review.form.physical===null?'미확인':review.form.physical?'제작 경험 있음':'아직 제작하지 않음';
    $('production-materials').value=review.form.materials||'';$('production-lessons').value=review.form.lessons||'';
  }
  function duration(){
    const a=review.form.startDate,b=review.form.endDate;const invalid=Boolean(a&&b&&b<a);
    $('period-error').hidden=!invalid;$('period-error').textContent=invalid?'종료일은 시작일보다 빠를 수 없어요.':'';
    $('project-end').setAttribute('aria-invalid',String(invalid));
    $('project-duration').textContent=a&&b&&!invalid?Math.round((new Date(b+'T00:00:00Z')-new Date(a+'T00:00:00Z'))/86400000)+1+'일':'미확인';
    return !invalid;
  }
  function renderDimensions(){
    const d=review.form.dimensions;
    $('dimension-width').value=d.width??'';$('dimension-height').value=d.height??'';$('dimension-unit').value=d.unit||'px';
    $('dimension-basis').textContent=review.touched.includes('dimensions')?'수정한 규격이에요. 단위 변경 시 수치는 자동 환산되지 않아요.':!d.width||!d.height?'확인되지 않은 규격은 비워두었어요.':d.basis==='직접 입력'?'확인한 규격이에요.':d.basis||'';
  }
  const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  function colorLabel(hex){if(colorMode==='rgb')return hex;const [r,g,b]=rgb(hex).map(n=>n/255),k=1-Math.max(r,g,b),c=k===1?0:(1-r-k)/(1-k),m=k===1?0:(1-g-k)/(1-k),y=k===1?0:(1-b-k)/(1-k);return [c,m,y,k].map(n=>Math.round(n*100)).join(' / ');}
  function renderPalette(){
    const palette=review.form.palette.filter(h=>/^#[0-9a-f]{6}$/i.test(h)).slice(0,6);review.form.palette=palette;
    $('palette-summary').textContent=palette.length?`대표컬러 ${palette.length}개를 골라뒀어요:)`:'대표컬러를 최대 6개까지 골라주세요.';
    $('palette-total').textContent=`총 ${review.result.colors.length}개 감지 · 눌러서 올리기`;
    $('palette-empty').hidden=palette.length>0;$('cmyk-note').hidden=colorMode!=='cmyk';
    const main=$('palette-main');main.replaceChildren();
    for(const hex of palette){const b=button(colorLabel(hex),'',()=>{review.form.palette=palette.filter(h=>h!==hex);persist('palette');renderPalette();});b.style.backgroundColor=hex;const c=rgb(hex);b.style.color=(c[0]*.299+c[1]*.587+c[2]*.114)>156?'#262626':'#FAFAFA';b.title=hex+' · 대표컬러에서 빼기';b.setAttribute('aria-label',hex+' 대표컬러에서 빼기');main.append(b);}
    const candidates=$('palette-candidates');candidates.replaceChildren();
    for(const hex of review.result.colors){const b=button('','',()=>{if(review.form.palette.includes(hex))review.form.palette=review.form.palette.filter(h=>h!==hex);else if(review.form.palette.length<6)review.form.palette.push(hex);else{say('대표컬러는 최대 6개예요. 기존 컬러를 눌러 뺀 뒤 추가해주세요.');return;}persist('palette');renderPalette();});b.style.backgroundColor=hex;b.title=hex;b.setAttribute('aria-label',hex+' 대표컬러 선택');b.setAttribute('aria-pressed',String(palette.includes(hex)));candidates.append(b);}
  }
  function renderFonts(){
    const host=$('review-fonts');host.replaceChildren();$('fonts-empty').hidden=review.form.fonts.length>0;
    review.form.fonts.forEach((font,i)=>{
      const row=E('div','font-row');
      const name=E('input');name.value=font.name;name.placeholder='폰트 이름';name.maxLength=100;name.setAttribute('aria-label',`${i+1}번째 폰트 이름`);
      const weight=E('input','font-weight');weight.value=font.weights||'';weight.placeholder='굵기';weight.maxLength=100;weight.setAttribute('aria-label',`${i+1}번째 폰트 굵기`);
      const download=E('div','font-download'),link=E('input');link.value=font.downloadUrl||'';link.placeholder='받는 곳 URL 직접 확인';link.maxLength=2000;link.type='url';link.setAttribute('aria-label',`${i+1}번째 폰트 받는 곳 URL`);download.append(link);
      const open=E('a','','받는 곳');open.append(img('./assets/review-external.svg'));open.target='_blank';open.rel='noopener noreferrer';
      function syncLink(){const safe=analysis.safeURL(link.value);open.hidden=!safe;if(safe)open.href=safe;else open.removeAttribute('href');}
      syncLink();download.append(open);
      name.addEventListener('input',()=>{font.name=name.value;persist('fonts');});weight.addEventListener('input',()=>{font.weights=weight.value;persist('fonts');});link.addEventListener('input',()=>{font.downloadUrl=link.value;syncLink();persist('fonts');});
      const remove=button('×','font-remove',()=>{review.form.fonts.splice(i,1);persist('fonts');renderFonts();});remove.setAttribute('aria-label',font.name+' 폰트 삭제');
      row.append(name,weight,download,remove,E('small','font-basis',font.basis||'직접 입력'));host.append(row);
    });
  }
  function fitTitle(){
    const input=$('review-title');if(!input.value)return;
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),style=getComputedStyle(input);
    ctx.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    input.style.width=Math.min(Math.max(120,ctx.measureText(input.value).width+14),Math.max(120,input.parentElement.clientWidth-42))+'px';
  }
  function renderAll(){
    colorMode=review.form.colorMode==='cmyk'?'cmyk':'rgb';
    document.querySelectorAll('input[name="color-mode"]').forEach(r=>{r.checked=r.value===colorMode;});
    const filter=$('thumbnail-source-filter');filter.replaceChildren();const all=E('option','','전체 파일');all.value='all';filter.append(all);
    for(const source of review.result.sources.filter(s=>review.result.thumbnails.some(t=>t.sourceId===s.id))){const o=E('option','',source.name);o.value=source.id;filter.append(o);}
    if(review.result.thumbnails.some(t=>t.sourceId==='custom')){const o=E('option','','직접 추가');o.value='custom';filter.append(o);}
    if(![...filter.options].some(o=>o.value===thumbnailFilter))thumbnailFilter='all';filter.value=thumbnailFilter;

    $('review-type').textContent=review.result.projectType==='planning'?'기획 프로젝트':'디자인 프로젝트';
    $('review-project-icon').src=review.result.projectType==='planning'?'./assets/project-planning-active.svg':'./assets/project-design.svg';
    $('review-title').value=review.form.title||'';$('analysis-mode-label').textContent=modeText();
    $('analysis-mode-label').title=review.result.summary||'';
    for(const key of ['categories','tools','tags']){const holder=$(key+'-field');holder.title=review.touched.includes(key)?'직접 수정한 값':review.result.fieldStatus?.[key]?.basis||'확인 가능한 정보';}
    renderSources();renderStages();renderThumbnails();['categories','tools','tags'].forEach(renderChips);
    $('project-start').value=review.form.startDate||'';$('project-end').value=review.form.endDate||'';duration();renderProduction();renderDimensions();renderPalette();renderFonts();
    document.dispatchEvent(new CustomEvent('morogaro:review-rendered'));
  }
  function openDialog(id){lastDialogFocus=document.activeElement;const d=$(id);if(!d.open)d.showModal();}
  function openEvidence(field='all'){
    $('evidence-title').textContent='자동 입력의 근거';
    activeField=field;const body=$('evidence-content');body.replaceChildren();
    if(review.result.summary)body.append(E('p','analysis-summary',review.result.summary));
    for(const note of review.result.fieldNotes||[])if(field==='all'||field===note.field)body.append(E('p','review-quiet',(FIELDS[note.field]||note.field)+': '+note.note));
    if(review.result.aiCoverage&&field==='all'){const c=review.result.aiCoverage;body.append(E('p','review-quiet',`AI에 전달: 소스 ${c.sourcesSent}개 · 텍스트 ${c.textCharacters.toLocaleString()}자 · 캡처 ${c.imagesSent}개. 전체 페이지/프레임을 모두 확인한 것은 아니에요.`));}
    if(field==='all'||field.startsWith('source:')){
      for(const source of review.result.sources.filter(s=>field==='all'||field==='source:'+s.id)){
        const block=E('div','evidence-block');block.append(E('h3','',source.name),E('p','',source.coverage||'기본 정보만 확인'));
        for(const warning of source.warnings||[])block.append(E('p','review-quiet',warning));body.append(block);
      }
    }
    const evidence=(review.result.evidence||[]).filter(e=>field==='all'||e.field===field||field==='source:'+e.fileId);
    for(const e of evidence){const source=review.result.sources.find(s=>s.id===e.fileId);if(!source)continue;
      const block=E('div','evidence-block');block.append(E('h3','',FIELDS[e.field]||e.field),E('small','',`${source.name} · ${e.location||'파일'} · ${e.basis==='measured'?'직접 측정':e.basis==='visual'?'AI 시각적 제안':e.basis==='filename'?'파일명 기반':e.basis==='extension'?'확장자 기준':'본문/선언에서 확인'}`),E('blockquote','',e.quote));body.append(block);
    }
    if(!evidence.length && !field.startsWith('source:'))body.append(E('p','review-quiet','이 항목을 판단할 충분한 근거를 파일에서 확인하지 못했어요. 직접 입력한 값은 작성자의 선택으로 유지돼요.'));
    for(const warning of review.result.warnings||[])body.append(E('p','review-quiet',warning));
    openDialog('evidence-dialog');
  }
  const INFO={project:['프로젝트 유형','파일 올리기에서 선택한 유형을 유지했어요. 변경하려면 업로드 소스 확인의 수정하기를 눌러주세요.'],stage:['바톤 진척도','창작이 어디까지 이어졌는지 나타내는 단계예요. 파일을 올려 50%가 된 업로드 준비율과는 별개예요. 자동 제안을 확인하고 Seeding부터 Blooming까지 직접 선택할 수 있어요.'],flowering:['Flowering은 서비스가 선정해요','여기서는 Flowering을 직접 선택하거나 AI가 선정할 수 없어요. 서비스의 별도 선정 절차로 정해지는 단계예요.'],thumbnails:['바톤 썸네일 설정','실제 업로드 이미지와 읽을 수 있는 문서의 미리보기에서 최대 10개를 선택해요. 선택 순서대로 번호가 붙고 첫 번째가 대표 이미지예요. 대표 이미지를 바꾸려면 먼저 선택 해제 후 원하는 순서로 다시 선택하세요.']};
  function showInfo(key){const [title,message]=INFO[key];$('evidence-title').textContent=title;$('evidence-content').replaceChildren(E('p','',message));openDialog('evidence-dialog');}
  function askConsent(){return new Promise(resolve=>{consentResolve=resolve;openDialog('ai-consent-dialog');});}
  function consent(choice){if(choice!=='cancel'&&$('remember-ai-choice').checked)sessionChoice=choice;$('ai-consent-dialog').close();const resolve=consentResolve;consentResolve=null;resolve?.(choice);}
  function currentOutput(){return {schemaVersion:1,projectType:review.result.projectType,...clone(review.form),selectedThumbnails:review.selectedThumbnails.map(id=>review.result.thumbnails.find(t=>t.id===id)).filter(Boolean),sources:review.result.sources.map(s=>({id:s.id,parentId:s.parentId||null,name:s.name,size:s.size,ext:s.ext,kind:review.form.sourceKinds[s.id]})),urls:review.result.links,provenance:{mode:review.result.mode,manualFields:review.touched,evidence:review.result.evidence},modifiedAt:review.modifiedAt};}
  function showSummary(action='preview'){
    persist();if(!duration()){$('project-end').focus();return;}
    for(const id of ['dimension-width','dimension-height']){const input=$(id);if(!input.checkValidity()){input.reportValidity();input.focus();return;}}
    const note=action==='publish'?'작성 정보는 준비됐어요. 실제 바톤 발행 서버는 아직 연결되지 않았으며, 업로드된 것으로 처리하지 않아요.':action==='next'?'작성한 노트와 정보를 확인해 주세요.':'지금까지 정리한 바톤 정보예요. 실제 발행 전이며 자유롭게 수정할 수 있어요.';
    {
      const event=new CustomEvent(action==='publish'?'morogaro:publish-request':action==='next'?'morogaro:review-next':'morogaro:detail-preview',{cancelable:true,detail:{from:window.MorogaroStepper?.current()||2,to:action==='publish'?'publish':6,review:currentOutput(),payload:maker.getPayload()}});
      if(!document.dispatchEvent(event))return;
    }
    $('review-summary-note').textContent=note;const dl=E('dl','review-summary-list');
    for(const [name,value] of [['바톤 제목',review.form.title],['진척도',review.form.stage||'미확인'],['카테고리',review.form.categories.join(' · ')||'미입력'],['사용 툴',review.form.tools.join(' · ')||'미입력'],['썸네일',review.selectedThumbnails.length+'개'],['파일',review.result.sources.length+'개'],['스타일 태그',review.form.tags.join(' · ')||'미입력']])dl.append(E('dt','',name),E('dd','',value));
    $('review-summary-body').replaceChildren(dl);openDialog('review-summary-dialog');
  }
  async function begin({reanalyze=false}={}){
    if(starting||window.MorogaroLoading.isOpen())return;
    starting=true;forceAnalysis=reanalyze;
    try{
      const saved=savedReview(),config=await analysis.getConfig(reanalyze);
      const reusable=!reanalyze&&saved&&saved.fingerprint===fingerprint()&&saved.result.pipelineVersion==='2.0';
      if(reusable)useAI=false;
      else if(config.apps)useAI=true;
      else if(config.aiAvailable){const choice=sessionChoice||await askConsent();if(choice==='cancel')return;useAI=choice==='ai';}
      else {useAI=false;if(reanalyze)say('AI 자동 제안은 서버의 API 키 설정이 필요해요. 지금은 파일에서 읽을 수 있는 정보를 다시 추출해요.');}
      await window.MorogaroLoading.start(maker.getPayload());
    }finally{starting=false;forceAnalysis=false;}
  }
  window.MorogaroLoading.configure({minimumDuration:1400,timeout:295000,analyze:async(payload,{signal})=>{
    const key=fingerprint(),saved=savedReview();
    $('analysis-dialog').dataset.basic=String(!useAI);
    $('analysis-note').textContent=useAI?'파일 내용과 캡처를 바탕으로 AI가 입력을 제안하고 있어요.':'파일의 본문·미리보기를 직접 추출하고 있어요. AI 의미 분석은 실행하지 않아요.';
    if(!forceAnalysis&&saved&&saved.fingerprint===key&&saved.result.pipelineVersion==='2.0')return {cachedReview:saved};
    const result=await analysis.inspect(payload,{signal,useAI});return {review:makeReview(result,key)};
  }});
  document.addEventListener('morogaro:analysis-progress',event=>{
    if(!window.MorogaroLoading.isOpen())return;
    const d=event.detail;$('analysis-note').textContent=d.message+(d.file?' · '+d.file:'');
  });
  $('reanalyze-files').addEventListener('click',()=>void begin({reanalyze:true}));
  $('thumbnail-source-filter').addEventListener('change',()=>{thumbnailFilter=$('thumbnail-source-filter').value;renderThumbnails();});
  document.addEventListener('morogaro:next',event=>{if(event.detail?.from!==1)return;event.preventDefault();void begin();},{capture:true});
  document.addEventListener('morogaro:analysis-ready',event=>{
    review=event.detail.result.cachedReview||event.detail.result.review;if(!review)return;
    const destination=pendingReviewStep;pendingReviewStep=2;
    persist();renderAll();showPage(2);
    if(destination>2)requestAnimationFrame(()=>window.MorogaroStepper?.jumpTo(destination));
  });
  document.addEventListener('morogaro:step',event=>{
    const n=Number(event.detail?.step);
    if(!Number.isInteger(n)||n<1||n>6)return;
    event.preventDefault();
    if(window.MorogaroLoading.isOpen())return;
    if(n===1){window.MorogaroStepper?.collapse();showPage(1);return;}
    const data=maker.getState();
    if(!data.files.length&&!data.links.length){say('파일이나 링크를 먼저 올려주세요.');return;}
    window.MorogaroStepper?.collapse();
    if(review&&review.fingerprint===fingerprint()){
      if(currentPage!==2){showPage(2,{focus:false});requestAnimationFrame(()=>window.MorogaroStepper?.jumpTo(n));}
      else window.MorogaroStepper?.jumpTo(n);
    }else{
      pendingReviewStep=n;
      void begin().finally(()=>{pendingReviewStep=2;});
    }
  });
  $('review-back').addEventListener('click',()=>showPage(1));$('edit-sources').addEventListener('click',()=>showPage(1));
  document.querySelector('.edit-title').addEventListener('click',()=>$('review-title').focus());
  document.querySelectorAll('#review-intro [data-field],#review-content [data-field]').forEach(input=>input.addEventListener('input',()=>{if(!review)return;review.form[input.dataset.field]=input.type==='date'?(input.value||null):input.value;persist(input.dataset.field);if(input.type==='date')duration();if(input.dataset.field==='title')fitTitle();}));
  $('physical-made').addEventListener('change',()=>{review.form.physical=$('physical-made').checked;persist('physical');renderProduction();});
  for(const [id,key] of [['dimension-width','width'],['dimension-height','height'],['dimension-unit','unit']])$(id).addEventListener('input',()=>{const input=$(id);review.form.dimensions[key]=key==='unit'?input.value:input.value===''?null:Number(input.value);persist('dimensions');$('dimension-basis').textContent='수정한 규격이에요. 단위 변경 시 수치는 자동 환산되지 않아요.';});
  document.querySelectorAll('input[name="color-mode"]').forEach(r=>r.addEventListener('change',()=>{colorMode=r.value;review.form.colorMode=colorMode;persist('colorMode');renderPalette();}));
  $('custom-color').addEventListener('change',()=>{const hex=$('custom-color').value.toUpperCase();if(!review.result.colors.includes(hex))review.result.colors.push(hex);if(review.form.palette.length<6&&!review.form.palette.includes(hex))review.form.palette.push(hex);persist('palette');renderPalette();});
  $('add-font').addEventListener('click',()=>{if(review.form.fonts.length>=40){say('폰트는 최대 40개까지 정리할 수 있어요.');return;}review.form.fonts.push({name:'',weights:'',downloadUrl:'',basis:'직접 입력'});persist('fonts');renderFonts();$('review-fonts').lastElementChild?.querySelector('input')?.focus();});
  function applyRatio(){
    const r=review?.form?.thumbRatio||'original',box=$('cover-preview'),im=box.querySelector('img');
    box.dataset.ratio=r;
    if(r==='original'){if(im){const set=()=>{if(im.naturalWidth)box.style.aspectRatio=im.naturalWidth+'/'+im.naturalHeight;};im.complete?set():im.addEventListener('load',set,{once:true});}else box.style.aspectRatio='';}
    else box.style.aspectRatio=r;
    document.querySelectorAll('#ratio-picker [data-ratio]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.ratio===r)));
  }
  $('ratio-picker').addEventListener('click',e=>{const b=e.target.closest('[data-ratio]');if(!b||!review)return;review.form.thumbRatio=b.dataset.ratio;applyRatio();});
  $('custom-thumbnail').addEventListener('click',()=>$('thumbnail-input').click());
  $('thumbnail-input').addEventListener('change',async()=>{
    const f=$('thumbnail-input').files?.[0];if(!f)return;
    if(f.size>15*1024*1024){say('썸네일 이미지는 15MB 이하로 추가해주세요.');return;}
    const parsed=await analysis.inspectBrowser({projectType:review.result.projectType,files:[f],urls:[]});
    const thumb=parsed.thumbnails[0];if(!thumb){say('이미지 미리보기를 만들지 못했어요. PNG·JPG·WebP를 확인해주세요.');return;}
    thumb.id='custom-'+Date.now();thumb.sourceId='custom';review.result.thumbnails.push(thumb);if(review.selectedThumbnails.length<10)review.selectedThumbnails.unshift(thumb.id);persist('thumbnails');renderThumbnails();$('thumbnail-input').value='';
  });
  $('show-evidence').addEventListener('click',()=>{$('evidence-title').textContent='자동 입력의 근거';openEvidence();});
  document.querySelectorAll('[data-info]').forEach(b=>b.addEventListener('click',()=>showInfo(b.dataset.info)));
  document.querySelectorAll('[data-close-dialog]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
  document.querySelectorAll('.review-dialog').forEach(d=>d.addEventListener('close',()=>{if(lastDialogFocus?.isConnected)lastDialogFocus.focus({preventScroll:true});}));
  document.querySelectorAll('[data-consent]').forEach(b=>b.addEventListener('click',()=>consent(b.dataset.consent)));
  $('ai-consent-dialog').addEventListener('cancel',event=>{event.preventDefault();consent('cancel');});
  $('review-next').addEventListener('click',()=>showSummary('next'));$('review-publish').addEventListener('click',()=>showSummary('publish'));
  $('preview-button').addEventListener('click',event=>{if(currentPage!==2)return;event.preventDefault();event.stopImmediatePropagation();showSummary();},{capture:true});
  $('export-review').addEventListener('click',()=>{
    // 공유 사이트(claude.ai 아티팩트)에서는 파일 저장이 막혀 있어 클립보드 복사로 대신해요.
    if(window.MOROGARO_SITE){const button=$('export-review'),text=JSON.stringify(currentOutput(),null,2),done=label=>{button.textContent=label;setTimeout(()=>{button.textContent='작성 정보 저장하기';},2400);};
      try{navigator.clipboard.writeText(text).then(()=>done('클립보드에 복사했어요'),()=>done('복사하지 못했어요'));}catch{done('복사하지 못했어요');}return;}
    const blob=new Blob([JSON.stringify(currentOutput(),null,2)],{type:'application/json'}),href=URL.createObjectURL(blob),a=E('a');a.href=href;a.download='morogaro-baton-info.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),1000);
  });
  window.addEventListener('resize',()=>{if(currentPage===2)fitTitle();},{passive:true});
  document.fonts?.ready.then(()=>{if(currentPage===2)fitTitle();});
  window.addEventListener('popstate',()=>{if(location.hash.startsWith('#baton/'))return;if(location.hash==='#file-info'&&review)showPage(2,{replace:true});else showPage(1,{replace:true});});
  function initialize(){review=savedReview();if(review&&review.fingerprint!==fingerprint())review=null;if(review){renderAll();if(location.hash==='#file-info')showPage(2,{replace:true,focus:false});}}
  window.MorogaroStepper?.setPage(currentPage);
  if(document.documentElement.dataset.makerReady==='true')initialize();else document.addEventListener('morogaro:ready',initialize,{once:true});
  window.MorogaroReview=Object.freeze({
    getData:()=>review?currentOutput():null,currentPage:()=>currentPage,
    getContext:()=>review?{form:clone(review.form),result:clone(review.result),touched:[...review.touched],fingerprint:review.fingerprint}:null,
    updateNote(values){
      if(!review)return false;
      for(const key of ['batonNote','nextIdeas','noteChecklist','noteDraft','references'])if(Object.hasOwn(values,key)){review.form[key]=clone(values[key]);persist(key);}
      return true;
    },
    showEditor(step=6){if(!review)return false;showPage(2,{focus:false});requestAnimationFrame(()=>window.MorogaroStepper?.jumpTo(step));return true;},
    flush:()=>{persist();return maker.saveDraft();}
  });
})();
