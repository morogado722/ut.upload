/* API-independent UI state. No API calls, model, key or server is used here.
 * Upload/unknown = grey. Review manual selection, local extraction and AI results
 * all pass the same stage string; the renderer has no knowledge of the provider.
 *
 * 진척도 강조색: 진척도가 정해지면 업로드 페이지의 초록 요소(버튼 테두리, 진행 바,
 * 아이콘, 포커스 링 등)가 모두 그 단계의 색으로 바뀌어요. 정해지기 전에는 기본 초록이에요.
 *   --accent       단계 색 (Planting = #00F998)
 *   --accent-rgb   같은 색의 r g b 값 (투명도용)
 *   --accent-ink   흰 배경에서 읽히는 진한 글자색
 *   --accent-deep  아주 진한 색 (포커스 링 등)
 *   --accent-soft  옅은 배경색
 * 초록이 들어간 아이콘은 assets/tint/<단계>/ 아래의 같은 이름 파일로 바꿔 끼워요.
 */
(() => {
  'use strict';
  const colors=Object.freeze({Seeding:'#00FFEE',Planting:'#00F998',Growing:'#E3EA2D',Blooming:'#F9B200',Flowering:'#FF4093'});
  const accents=Object.freeze({
    Seeding:  {accent:'#00FFEE',rgb:'0 255 238',  ink:'#00757A',deep:'#06302F',soft:'#E6FFFD'},
    Planting: {accent:'#00F998',rgb:'0 249 152',  ink:'#00874F',deep:'#0E2A18',soft:'#E8FFF5'},
    Growing:  {accent:'#E3EA2D',rgb:'227 234 45', ink:'#6B6E00',deep:'#2E3000',soft:'#FBFCE3'},
    Blooming: {accent:'#F9B200',rgb:'249 178 0',  ink:'#8A5A00',deep:'#3A2600',soft:'#FFF6E0'},
    Flowering:{accent:'#FF4093',rgb:'255 64 147', ink:'#B0105A',deep:'#45061F',soft:'#FFE8F1'},
  });
  // 초록(#00F998)이 들어간 업로드 페이지 아이콘. 헤더 로고·아바타는 브랜드 요소라 그대로 둬요.
  const TINTED=new Set(['link','note-spark','ai-spark','send','upload','review-bubble','project-design','project-planning-active','path-top','glow-top','glow-bottom','glow-top-loaded','glow-bottom-loaded']);
  const ICON=/^(.*?assets\/)(?:tint\/[A-Za-z]+\/)?([a-z-]+)\.svg$/;
  let tintStage=null;
  function tintImage(img){
    const src=img.getAttribute('src');if(!src)return;
    const m=src.match(ICON);if(!m||!TINTED.has(m[2]))return;
    const next=tintStage&&tintStage!=='Planting'?`${m[1]}tint/${tintStage}/${m[2]}.svg`:`${m[1]}${m[2]}.svg`;
    if(next!==src)img.setAttribute('src',next);
  }
  function tintAll(root=document){for(const img of root.querySelectorAll?.('img')||[])tintImage(img);}
  function set(stage){
    const theme=Object.hasOwn(colors,stage)?stage:'neutral';
    const root=document.documentElement;
    root.dataset.batonTheme=theme;root.style.setProperty('--baton-stage-color',colors[theme]||'#A2A2A2');
    const a=accents[theme]||accents.Planting;
    root.style.setProperty('--accent',a.accent);root.style.setProperty('--accent-rgb',a.rgb);
    root.style.setProperty('--accent-ink',a.ink);root.style.setProperty('--accent-deep',a.deep);root.style.setProperty('--accent-soft',a.soft);
    tintStage=theme==='neutral'?null:theme;tintAll();
    return theme;
  }
  // 나중에 그려지는 아이콘(파일 목록, 썸네일, 노트 가이드 등)도 같은 색으로 맞춰요.
  if('MutationObserver' in window){
    new MutationObserver(records=>{for(const r of records){
      if(r.type==='attributes'&&r.target.tagName==='IMG')tintImage(r.target);
      for(const n of r.addedNodes||[]){if(n.nodeType!==1)continue;if(n.tagName==='IMG')tintImage(n);else tintAll(n);}
    }}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
  }
  set(null);
  window.MorogaroAmbient=Object.freeze({set,colors,accents,current:()=>document.documentElement.dataset.batonTheme});
})();
