/* Figma 3579:35 — optional story, grounded AI suggestions, no fabricated memories.
 * Drafts, ideas and reference images live in the existing persisted review form.
 */
(() => {
  'use strict';
  const $=id=>document.getElementById(id), review=window.MorogaroReview, analysis=window.MorogaroAnalysis;
  if(!review||!$('baton-note'))return;
  const E=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const B=(text,cls,fn)=>{const n=E('button',cls,text);n.type='button';n.addEventListener('click',fn);return n;};
  const I=(src)=>{const n=E('img');n.src=src;n.alt='';return n;};
  const say=message=>document.dispatchEvent(new CustomEvent('morogaro:feedback',{detail:{message}}));
  // Figma 3666:4151 바톤노트 가이드 — 질문 7개, 2·2·3개씩 묶음. 체크는 '노트에 적었어요' 표시예요(필수 아님).
  const questions=[
    ['who','누구를 위한 건가요','이 작업을 누가 보거나 쓰길 바랐는지 적어주세요.','예: 제철 과일을 챙겨 먹고 싶은 자취생'],
    ['feel','어떤 느낌을 원했나요','색·분위기·톤처럼 의도한 느낌을 알려주면 방향을 잃지 않아요.','예: 손으로 만진 듯 따뜻하고 통통 튀는 느낌'],
    ['block','어디서 막혔나요','멈춘 지점을 구체적으로 알려주면, 이어받는 사람이 거기서 바로 시작할 수 있어요','예: 뒷면에 넣을 제철 정보를 어떻게 정리할지 정하지 못했어요'],
    ['stop','왜 그만뒀나요','시간·자원·방향 전환처럼 멈춘 이유를 솔직하게 남겨주세요.','예: 학기가 끝나서 인쇄 테스트까지 가지 못했어요'],
    ['learn','하다가 알게 된 점이 있나요','직접 해보며 알게 된 것은 이어받는 사람에게 가장 큰 힌트예요.','예: 형광 별색은 모니터와 인쇄 색이 꽤 달라요'],
    ['care','조심해야 할 점이 있나요','같은 실수를 피할 수 있게 주의할 점을 적어주세요.','예: 원본 파일의 일부 글자는 아웃라인 처리돼 있어요'],
    ['next','어디부터 이어가면 좋을까요','다음 사람이 가장 먼저 손대면 좋을 부분을 알려주세요.','예: 복숭아 버전 컬러부터 다듬어 주세요'],
  ];
  const groups=[[0,2],[2,4],[4,7]];
  let openQuestion='block';
  let busy=false,controller=null,consentResolver=null,lastFocus=null,pendingDraft=null,editRevision=0;
  const state=()=>review.getContext()?.form||{};
  function write(values){return review.updateNote(values);}
  function noteCount(){const length=Array.from($('baton-note').value).length;$('note-count').textContent=`${length} 자`;syncBubble();updateChecks();}
  // 말풍선(Figma 3668:4255): AI 초안 안내와 오류를 노트 위에 보여줘요.
  function syncBubble(){const status=$('note-draft-status'),draft=state().noteDraft,current=$('baton-note').value;
    const showClear=Boolean(draft?.origin==='ai'&&draft.text&&current&&current===draft.text);
    $('clear-draft').hidden=!showClear;$('note-bubble').hidden=!status.textContent.trim();$('note-bubble').classList.toggle('is-error',status.classList.contains('is-error'));}
  function clearStatus(){for(const id of ['note-draft-status','idea-status']){$(id).textContent='';$(id).classList.remove('is-error');}syncBubble();}
  // 가이드 체크는 사용자가 누르지 않아요. 노트에 그 항목([항목 이름] …)이 적혀 있으면 자동으로 체크돼요.
  const guideDrafts={};
  // AI가 쓴 노트처럼 [항목] 표시가 없어도, 그 이야기가 들어 있으면 체크돼요(낱말로 판단).
  const GUIDE_WORDS={who:/(위한|대상|사용자|타깃|타겟|누구|관객|독자|학생|사람들?에게)/,feel:/(느낌|분위기|인상|톤|감성|무드|따뜻|차분|강렬|산뜻)/,block:/(막혔|막힌|어려웠|어려운|고민|해결하지|정하지 못)/,stop:/(그만|멈췄|멈춘|중단|미완|시간이 부족|끝내지 못)/,learn:/(알게|배웠|배운|깨달|느꼈|발견)/,care:/(주의|조심|유의|아웃라인|깨질|다를 수)/,next:/(이어가|이어받|이어서|다음 사람|다음 작업|시작하면|부터 손)/};
  const isDone=label=>{const t=$('baton-note').value;const i=t.indexOf(`[${label}]`);if(i>=0){const rest=t.slice(i+label.length+2).split(/\n\s*\n|\n\[/)[0];if(rest.trim())return true;}const key=(questions.find(q=>q[1]===label)||[])[0];return !!(key&&GUIDE_WORDS[key]&&GUIDE_WORDS[key].test(t.replace(/\[[^\]]*\]/g,'')));};
  function updateChecks(){
    for(const [key,label] of questions){const item=document.querySelector(`.guide-item[data-key="${key}"]`);if(!item)continue;const done=isDone(label);item.classList.toggle('is-done',done);const img=item.querySelector('.guide-check img');if(img)img.src='./assets/note-check-'+(done?'on':'off')+'.svg';item.querySelector('.guide-check')?.setAttribute('aria-label',`${label} — ${done?'노트에 적었어요':'아직 적지 않았어요'}`);}
  }
  function insertQuestion(key,label){
    const area=$('baton-note'),value=area.value.replace(/\s+$/,''),typed=(guideDrafts[key]||'').trim(),line=`[${label}] ${typed}`;
    const text=(value?value+'\n\n':'')+line;area.value=text;editRevision++;write({batonNote:text});
    guideDrafts[key]='';openQuestion=null;
    noteCount();renderRail();area.focus();area.setSelectionRange(text.length,text.length);area.scrollTop=area.scrollHeight;
  }
  function renderRail(){
    $('story-groups').replaceChildren();
    for(const [from,to] of groups){
      const group=E('div','guide-group');
      for(const [key,label,help,example] of questions.slice(from,to)){
        const done=isDone(label),open=openQuestion===key;
        const item=E('div','guide-item'+(open?' is-open':'')+(done?' is-done':''));item.dataset.key=key;
        const line=E('div','guide-line');
        const check=E('span','guide-check');check.setAttribute('role','img');check.setAttribute('aria-label',`${label} — ${done?'노트에 적었어요':'아직 적지 않았어요'}`);
        check.title='노트에 이 이야기가 있으면 자동으로 체크돼요.';check.append(I('./assets/note-check-'+(done?'on':'off')+'.svg'));
        const name=B(label,'guide-name',()=>{openQuestion=open?null:key;renderRail();});name.setAttribute('aria-expanded',String(open));
        line.append(check,name);item.append(line);
        if(open){
          const input=document.createElement('textarea');input.className='guide-example';input.rows=2;input.placeholder=example;input.value=guideDrafts[key]||'';input.setAttribute('aria-label',label);
          input.addEventListener('input',()=>{guideDrafts[key]=input.value;});
          input.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();insertQuestion(key,label);}});
          item.append(E('p','guide-help',help),input);const actions=E('div','guide-actions');actions.append(B('글에 넣기','guide-insert',()=>insertQuestion(key,label)));item.append(actions);
          setTimeout(()=>input.focus(),0);
        }
        group.append(item);
      }
      $('story-groups').append(group);
    }
  }
  function renderIdeas(){
    const ideas=(state().nextIdeas||['']).slice(0,3);if(!ideas.length)ideas.push('');
    $('idea-fields').replaceChildren();
    ideas.forEach((value,index)=>{const row=E('div','idea-field'),input=E('input');input.className='idea-input';input.type='text';input.maxLength=240;input.value=value;input.placeholder=index?'예: 다른 주제로 확장해보세요':'어떤 방향으로 이어가면 좋을까요?';input.setAttribute('aria-label',`이어받을 아이디어 ${index+1}`);
      input.addEventListener('input',()=>{const next=(state().nextIdeas||ideas).slice(0,3);next[index]=input.value;write({nextIdeas:next});$('suggest-ideas').querySelector('span').textContent=next.filter(v=>String(v).trim()).length>=3?'다시 생각해보기':'AI 추천 방향 보기';});
      const remove=B('×','idea-remove',()=>{const next=(state().nextIdeas||ideas).filter((_,i)=>i!==index);write({nextIdeas:next.length?next:['']});renderIdeas();});remove.setAttribute('aria-label',`아이디어 ${index+1} 삭제`);row.append(E('span','idea-number',String(index+1)),input,remove);$('idea-fields').append(row);
    });$('add-idea').disabled=ideas.length>=3;$('add-idea').hidden=false;$('add-idea').title=ideas.length>=3?'아이디어는 최대 3개예요':'';
    // AI가 이미 3개를 채웠으면 추천 버튼은 숨겨요(지우면 다시 보여요).
    const full=ideas.filter(v=>String(v).trim()).length>=3;$('suggest-ideas').querySelector('span').textContent=full?'다시 생각해보기':'AI 추천 방향 보기';if(full)$('idea-suggestions').replaceChildren();
  }
  function renderReferences(){
    const refs=(state().references||[]).filter(ref=>analysis.isPreviewURL(ref.dataUrl));$('reference-images').replaceChildren();
    for(const ref of refs){const tile=E('div','reference-tile'),img=I(ref.dataUrl);img.alt=ref.label||'레퍼런스 이미지';img.title=ref.label||'';const remove=B('','reference-remove',()=>{write({references:(state().references||[]).filter(r=>r.id!==ref.id)});renderReferences();});remove.setAttribute('aria-label',(ref.label||'레퍼런스')+' 삭제');tile.append(img,remove);$('reference-images').append(tile);}
    // 이미지가 생기면 위에 말풍선으로 몇 장인지 알려줘요.
    const bubble=$('reference-bubble');bubble.hidden=!refs.length;
    if(refs.length){bubble.replaceChildren('레퍼런스 이미지를 ',Object.assign(document.createElement('strong'),{textContent:`${refs.length}장`}),' 담았어요');}
  }
  function render(){if(!review.getData())return;$('baton-note').value=state().batonNote||'';noteCount();renderRail();renderIdeas();renderReferences();$('note-ai-label').textContent=state().noteDraft?.origin==='ai'?'다시 쓰기':'AI로 초안 쓰기';syncBubble();}
  function consent(){lastFocus=document.activeElement;return new Promise(resolve=>{consentResolver=resolve;$('note-ai-consent').showModal();});}
  function resolveConsent(value){$('note-ai-consent').close();const resolve=consentResolver;consentResolver=null;resolve?.(value);lastFocus?.focus({preventScroll:true});}
  function contextForAI(){const ctx=review.getContext();return {title:ctx.form.title||'',stage:ctx.form.stage||null,categories:ctx.form.categories||[],tools:ctx.form.tools||[],materials:ctx.form.materials||'',physical:ctx.form.physical??null,summary:ctx.result.mode==='ai'?(ctx.result.summary||''):'',tags:ctx.form.tags||[],stageReason:ctx.result.values?.stageReason||'',images:(()=>{const d=review.getData?.();const th=(d?.selectedThumbnails||[]).map(t=>t?.dataUrl).filter(Boolean);const all=th.length?th:(ctx.result.thumbnails||[]).map(t=>t.dataUrl);return all.filter(u=>/^data:image\//.test(u||'')).slice(0,3);})(),evidence:(ctx.result.evidence||[]).slice(0,35).map((e,i)=>({id:'e'+i,field:e.field,quote:String(e.quote||'').slice(0,1400),location:String(e.location||''),sourceName:ctx.result.sources.find(s=>s.id===e.fileId)?.name||''}))};}
  function showSuggestions(ideas){
    $('idea-suggestions').replaceChildren();$('idea-suggestions').hidden=!ideas.length;
    for(const text of ideas){const pick=B('','idea-suggestion',()=>{const next=(state().nextIdeas||['']).slice(0,3);const empty=next.findIndex(v=>!v.trim());if(next.some(v=>v.trim()===text.trim()))return;if(empty>=0)next[empty]=text;else if(next.length<3)next.push(text);else{say('아이디어는 최대 3개예요. 기존 아이디어를 지우고 추가해 주세요.');return;}write({nextIdeas:next});renderIdeas();pick.disabled=true;pick.lastElementChild.textContent='추가했어요';});pick.append(E('span','',text),E('span','','+ 담기'));$('idea-suggestions').append(pick);}
  }
  async function generate(action){
    if(busy||!review.getData())return;
    clearStatus();const status=$(action==='ideas'?'idea-status':'note-draft-status');
    const config=await analysis.getConfig(true);
    if(!config.aiAvailable){status.textContent=window.MOROGARO_SITE?'공유 사이트에서는 AI 초안을 쓸 수 없어요. 가이드를 보며 직접 적어주세요.':'AI 초안은 서버의 API 키를 연결한 뒤 사용할 수 있어요. 지금은 직접 작성할 수 있어요.';syncBubble();return;}
    if(!(window.MOROGARO_CONFIG?.appsScriptUrl)&&!await consent())return;   // Apps Script 사이트는 묻지 않고 바로 써요
    const fingerprint=review.getContext().fingerprint,rev=editRevision;
    busy=true;controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),60000);$('generate-note').disabled=true;$('suggest-ideas').disabled=true;
    status.textContent='확인한 자료로 제안을 작성하고 있어요…';syncBubble();
    try{
      // Apps Script 주소가 설정돼 있으면 그쪽으로, 아니면 파이썬 서버로 보내요.
      const apps=(window.MOROGARO_CONFIG?.appsScriptUrl||'').trim();
      const response=apps
        ?await fetch(apps,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'note',noteAction:action,context:contextForAI()}),signal:controller.signal})
        :await fetch('/api/baton-note',{method:'POST',headers:{'Content-Type':'application/json','X-Morogaro-Client':'maker-v14'},body:JSON.stringify({useAI:true,action,context:contextForAI()}),signal:controller.signal});
      let data;try{data=await response.json();}catch{throw new Error('AI 응답을 읽지 못했어요. 작성한 내용은 그대로예요.');}
      if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:'AI 제안을 받지 못했어요.');
      if(apps&&data.ok===false)throw new Error(String(data.error||'AI 제안을 받지 못했어요.'));
      if(review.getContext()?.fingerprint!==fingerprint)return;
      if(data.mode!=='ai')throw new Error('AI 초안이 없어 내용을 변경하지 않았어요.');
      let text=typeof data.note==='string'?data.note.slice(0,5000):'';
      // 예전 서버처럼 한 덩어리로 오면 두 문장씩 단락을 나눠요.
      if(text&&!text.includes('\n')){const ss=text.match(/[^.!?。]+[.!?。]+[\s]*/g)||[text];const paras=[];for(let i=0;i<ss.length;i+=2)paras.push(ss.slice(i,i+2).join('').trim());text=paras.join('\n\n');}
      if(action==='draft'&&text){
        pendingDraft={text,origin:'ai',generatedAt:new Date().toISOString(),evidence:data.evidence||[]};write({noteDraft:pendingDraft});
        if(!$('baton-note').value.trim()&&editRevision===rev){write({batonNote:text});$('baton-note').value=text;noteCount();pendingDraft=null;status.textContent='기획서와 카테고리, 제작 정보를 읽고 초안을 써봤어요.';}
        else{$('apply-note-draft').hidden=false;status.textContent='새 초안을 준비했어요. 현재 노트는 덮어쓰지 않았어요. 적용 버튼으로 비교하고 선택해 주세요.';}
      }else if(action==='draft'){status.textContent='시작과 진행을 설명할 근거가 부족해 초안을 비워두었어요. 직접 이야기해 주세요.';}
      const ideas=Array.isArray(data.ideas)?data.ideas.filter(v=>typeof v==='string'&&v.trim()).slice(0,3).map(s=>s.slice(0,240)):[];
      if(action==='ideas'){showSuggestions(ideas);status.textContent=ideas.length?'미래의 방향에 대한 AI 제안이에요. 필요한 아이디어만 골라 담아주세요.':'제안을 받지 못했어요. 아이디어는 직접 추가할 수 있어요.';}
      if(action==='draft')$('note-ai-label').textContent='다시 쓰기';
    }catch(error){status.textContent=error.name==='AbortError'?'AI 제안 요청이 중단됐어요. 작성한 내용은 그대로예요.':error.message;status.classList.add('is-error');}
    finally{clearTimeout(timeout);busy=false;controller=null;$('generate-note').disabled=false;$('suggest-ideas').disabled=false;syncBubble();}
  }
  $('baton-note').addEventListener('input',()=>{editRevision++;write({batonNote:$('baton-note').value});noteCount();});
  $('add-idea').addEventListener('click',()=>{const next=[...(state().nextIdeas||[''])];if(next.length>=3)return;next.push('');write({nextIdeas:next});renderIdeas();$('idea-fields').lastElementChild.querySelector('input').focus();});
  $('generate-note').addEventListener('click',()=>void generate('draft'));$('suggest-ideas').addEventListener('click',()=>{const filled=(state().nextIdeas||[]).filter(v=>String(v).trim()).length;if(filled>=3)void rethinkIdeas();else void generate('ideas');});
  $('note-ai-yes').addEventListener('click',()=>resolveConsent(true));$('note-ai-no').addEventListener('click',()=>resolveConsent(false));$('note-ai-consent').addEventListener('cancel',e=>{e.preventDefault();resolveConsent(false);});
  let replaceDraft=false;
  $('apply-note-draft').addEventListener('click',()=>{if(!pendingDraft)return;replaceDraft=true;$('note-clear-title').textContent='현재 노트를 새 AI 초안으로 바꿀까요?';$('note-clear-dialog').showModal();});
  $('clear-draft').addEventListener('click',()=>$('clear-note').click());
  $('clear-note').addEventListener('click',()=>{if(!$('baton-note').value)return;replaceDraft=false;$('note-clear-title').textContent='작성한 노트를 지울까요?';$('note-clear-dialog').showModal();});
  $('note-clear-no').addEventListener('click',()=>$('note-clear-dialog').close());
  $('note-clear-yes').addEventListener('click',()=>{const text=replaceDraft&&pendingDraft?pendingDraft.text:'';editRevision++;write({batonNote:text,noteChecklist:{}});$('baton-note').value=text;noteCount();renderRail();$('note-clear-dialog').close();$('apply-note-draft').hidden=true;pendingDraft=null;clearStatus();$('baton-note').focus();});
  $('add-reference').addEventListener('click',()=>$('reference-input').click());
  // 파일 선택 · 끌어다 놓기 모두 같은 길로 들어와요.
  async function addReferences(fs){
    fs=fs.filter(f=>/^image\//.test(f.type));if(!fs.length)return;
    const fingerprint=review.getContext()?.fingerprint;let added=0;$('reference-status').textContent='';
    for(const f of fs){if(f.size>15*1024*1024){$('reference-status').textContent='이미지 한 장은 15MB 이하로 올려주세요.';continue;}
      if((state().references||[]).length>=60){$('reference-status').textContent='이 브라우저 구현에서는 레퍼런스 이미지를 최대 60장까지 보관해요.';break;}
      try{const parsed=await analysis.inspectBrowser({projectType:review.getData().projectType,files:[f],urls:[]});if(review.getContext()?.fingerprint!==fingerprint)return;const t=parsed.thumbnails[0];if(!t)throw new Error();const refs=[...(state().references||[]),{id:crypto.randomUUID?.()||Date.now()+'-'+Math.random(),dataUrl:t.dataUrl,label:f.name}];write({references:refs});added++;}catch{$('reference-status').textContent='미리보기를 만들 수 없는 이미지가 있어요. PNG·JPG·WebP를 확인해주세요.';}
    }renderReferences();
    // 새로 넣은 이미지가 보이도록 끝으로 스크롤해요.
    if(added){const strip=$('reference-strip');strip.scrollTo({left:strip.scrollWidth,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
  }
  $('reference-input').addEventListener('change',()=>{const fs=[...$('reference-input').files];$('reference-input').value='';void addReferences(fs);});
  // 끌어다 놓기: 레퍼런스 줄 어디에 놓아도 돼요.
  {const field=$('reference-field');let depth=0;
    const hasFiles=e=>[...(e.dataTransfer?.types||[])].includes('Files');
    field.addEventListener('dragenter',e=>{if(!hasFiles(e))return;e.preventDefault();e.stopPropagation();depth++;field.classList.add('is-dragover');});
    field.addEventListener('dragover',e=>{if(!hasFiles(e))return;e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='copy';});
    field.addEventListener('dragleave',e=>{if(!hasFiles(e))return;depth=Math.max(0,depth-1);if(!depth)field.classList.remove('is-dragover');});
    field.addEventListener('drop',e=>{if(!hasFiles(e))return;e.preventDefault();e.stopPropagation();depth=0;field.classList.remove('is-dragover');void addReferences([...e.dataTransfer.files]);});
    // 세로 휠로도 옆으로 넘겨볼 수 있어요(넘칠 때만).
    const strip=$('reference-strip');
    strip.addEventListener('wheel',e=>{if(Math.abs(e.deltaX)>Math.abs(e.deltaY)||strip.scrollWidth<=strip.clientWidth+1)return;const max=strip.scrollWidth-strip.clientWidth;const next=Math.max(0,Math.min(max,strip.scrollLeft+e.deltaY));if(next===strip.scrollLeft)return;e.preventDefault();e.stopPropagation();strip.scrollLeft=next;},{passive:false});
  }
  document.addEventListener('morogaro:review-rendered',render);
  /* AI로 분석한 바톤이면, 이어받을 아이디어를 업로드 단계에서 미리 채워 둬요(비어 있을 때만, 바톤마다 한 번).
     바톤 상세페이지의 '바톤 아이디어'에 그대로 보여요. */
  const autoIdeasDone=new Set();
  async function autoIdeas(){
    const ctx=review.getContext();if(!ctx||ctx.result.mode!=='ai'||autoIdeasDone.has(ctx.fingerprint))return true;
    if((ctx.form.nextIdeas||[]).some(v=>String(v).trim()))return true;
    autoIdeasDone.add(ctx.fingerprint);
    const apps=(window.MOROGARO_CONFIG?.appsScriptUrl||'').trim();
    try{
      const response=apps
        ?await fetch(apps,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'note',noteAction:'ideas',context:contextForAI()})})
        :await fetch('/api/baton-note',{method:'POST',headers:{'Content-Type':'application/json','X-Morogaro-Client':'maker-v14'},body:JSON.stringify({useAI:true,action:'ideas',context:contextForAI()})});
      const data=await response.json();
      const ideas=Array.isArray(data.ideas)?data.ideas.filter(v=>typeof v==='string'&&v.trim()).slice(0,3).map(v=>v.slice(0,240)):[];
      if(!ideas.length||review.getContext()?.fingerprint!==ctx.fingerprint)return false;
      if((state().nextIdeas||[]).some(v=>String(v).trim()))return true;   // 그사이 직접 적었으면 그대로 둬요
      write({nextIdeas:ideas});renderIdeas();
      $('idea-status').textContent='AI가 이어받을 방향을 미리 적어뒀어요. 자유롭게 고치거나 지울 수 있어요.';
      return true;
    }catch{return false;}
  }
  // 3개가 다 찬 상태에서 '다시 생각해보기': 새 방향 3개로 바꿔요.
  async function rethinkIdeas(){
    const btn=$('suggest-ideas'),label=btn.querySelector('span'),status=$('idea-status');if(btn.disabled)return;
    btn.disabled=true;label.textContent='다시 생각하는 중…';status.textContent='지금 아이디어와 다른 방향으로 다시 생각하고 있어요…';
    const apps=(window.MOROGARO_CONFIG?.appsScriptUrl||'').trim(),before=(state().nextIdeas||[]).filter(v=>String(v).trim());
    try{
      const base=contextForAI(),ctx={...base,summary:`${base.summary||''}\n[요청] 아래 아이디어와 겹치지 않는 새로운 방향 3개를 제안해 주세요: ${before.join(' / ')}`.trim()};
      const response=apps?await fetch(apps,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'note',noteAction:'ideas',context:ctx})})
        :await fetch('/api/baton-note',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({useAI:true,action:'ideas',context:ctx})});
      const data=await response.json();
      const ideas=Array.isArray(data.ideas)?data.ideas.filter(v=>typeof v==='string'&&v.trim()&&!before.includes(v.trim())).slice(0,3).map(v=>v.slice(0,240)):[];
      if(!ideas.length)throw new Error();
      write({nextIdeas:ideas});renderIdeas();status.textContent='새로운 방향으로 바꿔봤어요. 마음에 드는 것만 남겨도 돼요.';
    }catch{status.textContent='다시 생각하지 못했어요. 잠시 뒤 다시 눌러 주세요.';}
    finally{btn.disabled=false;renderIdeas();}
  }
  // AI가 노트·아이디어를 쓰는 동안엔 '상세페이지로' · '이대로 업로드'를 잠가요(최대 70초).
  function lockNext(on){
    document.documentElement.classList.toggle('ai-writing',on);
    for(const id of ['review-next','review-publish']){const b=$(id);if(!b)continue;b.disabled=on;b.setAttribute('aria-disabled',String(on));b.title=on?'AI가 바톤 노트와 아이디어를 쓰고 있어요':'';}
  }
  async function autoFill(){
    const ctx=review.getContext();if(!ctx||ctx.result.mode!=='ai')return;
    lockNext(true);const guard=setTimeout(()=>lockNext(false),70000);
    $('idea-status').textContent='AI가 바톤 노트와 이어받을 아이디어를 쓰고 있어요…';
    const note=$('baton-note');
    if(!note.value.trim()){note.dataset.placeholder=note.placeholder;note.placeholder='올려주신 작업을 보면서 AI가 노트 초안을 쓰고 있어요…';note.classList.add('is-ai-writing');$('note-draft-status').textContent='AI가 작업을 살펴보고 바톤 노트를 쓰는 중이에요 ✍️';syncBubble();}
    try{
      if(!await autoIdeas()){autoIdeasDone.delete(ctx.fingerprint);await autoIdeas();}   // 실패하면 한 번 더
      for(let i=0;i<2&&!$('baton-note').value.trim();i++){while(busy)await new Promise(r=>setTimeout(r,300));await generate('draft');}
    }finally{const n=$('baton-note');n.classList.remove('is-ai-writing');if(n.dataset.placeholder){n.placeholder=n.dataset.placeholder;delete n.dataset.placeholder;}if($('note-draft-status').textContent.includes('쓰는 중이에요'))$('note-draft-status').textContent='';syncBubble();clearTimeout(guard);lockNext(false);if($('idea-status').textContent.startsWith('AI가 바톤 노트와'))$('idea-status').textContent='';}
  }
  document.addEventListener('morogaro:analysis-ready',()=>setTimeout(()=>void autoFill(),300));
  window.addEventListener('pagehide',()=>controller?.abort());
  window.MorogaroNote=Object.freeze({render,cancel:()=>controller?.abort()});render();
})();
