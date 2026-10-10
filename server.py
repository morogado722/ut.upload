"""Local prototype server. Starts on 127.0.0.1 only. Do not expose publicly
without authentication, quota controls, TLS and deployment-level file isolation.
Only explicitly allowlisted UI assets are served; .env and Python files are not.
"""
from __future__ import annotations
import asyncio, json, multiprocessing as mp, os, re, time, signal, tempfile
from collections import deque
from pathlib import Path
from urllib.parse import urlparse
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from starlette.datastructures import UploadFile
from dotenv import load_dotenv
from analysis_engine import extract_files, enrich_with_ai, safe_url
from analysis_config import MAX_FILE, MAX_TOTAL, MAX_FILES, PARSER_SECONDS, PIPELINE_VERSION
from file_extractors import public_capabilities

BASE=Path(__file__).resolve().parent
load_dotenv(BASE/'.env')
MAX_BODY=MAX_TOTAL+512*1024
STATIC={'index.html','app.js','styles.css','header.css','header.js','refinement.css','buttons.css','loading.css','loading.js','review.css','review.js','file-analysis.js','stepper.css','stepper.js','ambient.css','ambient.js','note.css','note.js','detail.css','detail.js','download-bundle.js','fonts.css','note-snap.js','research.js','research.css','vendor/modern-screenshot.js','config.js','vendor/pdfjs/pdf.min.js','vendor/pdfjs/pdf.worker.min.js'}
# v10 상세페이지(바톤 결과 화면). 메이커 안에서 iframe으로 열려요.
BATON_STATIC={'baton/index.html','baton/styles.css','baton/app.js','baton/baton-data.js','baton/baton-render.js','baton/baton-live.css'}
lock=asyncio.Semaphore(2);recent=deque()

# ── 배포 설정 ──
# 로컬 주소는 항상 허용. Render는 RENDER_EXTERNAL_HOSTNAME을 자동으로 넣어줘요. 다른 곳은 ALLOWED_HOSTS(쉼표로 구분).
ALLOWED_HOSTS={'127.0.0.1','localhost','::1'}|{h.strip().lower() for h in (os.getenv('ALLOWED_HOSTS','')+','+os.getenv('RENDER_EXTERNAL_HOSTNAME','')).split(',') if h.strip()}

# ── 하루 AI 사용 상한 (한국 시간 기준, 기본 300회) ──
# 넘으면 그날은 AI 없이 파일에서 직접 추출하는 방식으로 자동 전환돼요. 0이면 상한 없음.
AI_DAILY_LIMIT=int(os.getenv('AI_DAILY_LIMIT','300') or 0)
_ai_day={'date':None,'count':0}
def _kst_date():return time.strftime('%Y-%m-%d',time.gmtime(time.time()+9*3600))
def ai_remaining():
    if _ai_day['date']!=_kst_date():_ai_day.update(date=_kst_date(),count=0)
    return None if AI_DAILY_LIMIT<=0 else max(0,AI_DAILY_LIMIT-_ai_day['count'])
def ai_key(consume=True):
    key=os.getenv('OPENAI_API_KEY','')
    if not key:return ''
    left=ai_remaining()
    if left==0:return ''
    if consume:_ai_day['count']+=1
    return key

class SizeLimitMiddleware:
    def __init__(self,app):self.app=app
    async def __call__(self,scope,receive,send):
        if scope['type']!='http' or not scope.get('path','').startswith('/api/'):
            await self.app(scope,receive,send);return
        headers=dict(scope.get('headers',[]))
        try:length=int(headers.get(b'content-length',b'0'))
        except ValueError:length=MAX_BODY+1
        if length>MAX_BODY:
            await JSONResponse({'detail':'분석 요청은 합계 100MB까지 지원해요.'},status_code=413)(scope,receive,send);return
        used=0
        async def bounded():
            nonlocal used
            message=await receive();used+=len(message.get('body',b''))
            if used>MAX_BODY:raise HTTPException(413,'분석 요청은 합계 100MB까지 지원해요.')
            return message
        await self.app(scope,bounded,send)

app=FastAPI(title='morogaro local analysis',docs_url=None,redoc_url=None,openapi_url=None)
app.add_middleware(SizeLimitMiddleware)

@app.middleware('http')
async def local_guard(request,call_next):
    host=(urlparse('//'+request.headers.get('host','')).hostname or '').lower()
    if host not in ALLOWED_HOSTS:return JSONResponse({'detail':'허용되지 않은 주소예요. ALLOWED_HOSTS를 확인해 주세요.'},status_code=403)
    origin=request.headers.get('origin')
    # 배포 서버(https 프록시 뒤)에서도 맞도록 주소의 호스트 이름만 비교해요.
    if origin and (urlparse(origin).hostname or '').lower()!=host:
        return JSONResponse({'detail':'같은 출처의 화면에서 요청해 주세요.'},status_code=403)
    response=await call_next(request)
    response.headers['X-Content-Type-Options']='nosniff'
    response.headers['Referrer-Policy']='no-referrer'
    if request.url.path.startswith('/api/'):
        response.headers['Cache-Control']='no-store'
    return response

@app.get('/api/config')
async def config():
    return dict(service='morogaro-analysis-v2',pipelineVersion=PIPELINE_VERSION,aiAvailable=bool(ai_key(consume=False)),provider='OpenAI',limits=dict(files=MAX_FILES,fileBytes=MAX_FILE,totalBytes=MAX_TOTAL,thumbnails=60),capabilities=public_capabilities())

def parse_worker(connection,files,project_type,urls,temporary):
    try:
        if os.name=='posix':os.setsid() # one killable group including any subprocess converter
        tempfile.tempdir=temporary
        try:
            import resource
            resource.setrlimit(resource.RLIMIT_CPU,(100,110))
            # RLIMIT_AS on macOS is not consistently supported.
            if __import__('sys').platform.startswith('linux'):resource.setrlimit(resource.RLIMIT_AS,(3*1024**3,3*1024**3))
        except (ImportError,ValueError,OSError):pass
        def progress(message):connection.send(('progress',message))
        connection.send(('ok',extract_files(files,project_type,urls,progress)))
    except BaseException:
        try:connection.send(('error',None))
        except (BrokenPipeError,EOFError,OSError):pass
    finally:connection.close()

async def parse_isolated(files,project_type,urls,request=None):
    with tempfile.TemporaryDirectory(prefix='morogaro-job-') as temp:
        ctx=mp.get_context('spawn');parent,child=ctx.Pipe(duplex=False)
        process=ctx.Process(target=parse_worker,args=(child,files,project_type,urls,temp),daemon=True)
        process.start();child.close();deadline=time.monotonic()+PARSER_SECONDS
        try:
            while True:
                if parent.poll():
                    status,value=await asyncio.to_thread(parent.recv)
                    if status=='progress':yield {'event':'progress',**value};continue
                    if status=='ok':yield {'event':'extracted','result':value};return
                    raise HTTPException(422,'파일 해석 중 문제가 발생했어요.')
                if time.monotonic()>deadline:raise HTTPException(408,'파일 해석 시간이 초과됐어요. 파일을 나눠 올려주세요.')
                if not process.is_alive():raise HTTPException(422,'파일을 해석하지 못했어요.')
                if request and await request.is_disconnected():raise asyncio.CancelledError()
                await asyncio.sleep(.06)
        finally:
            if os.name=='posix':
                try:os.killpg(process.pid,signal.SIGTERM)
                except ProcessLookupError:pass
            elif process.is_alive():process.terminate()
            await asyncio.to_thread(process.join,2)
            if process.is_alive():process.kill();await asyncio.to_thread(process.join,1)
            parent.close()

def public_result(result):
    for source in result['sources']:
        for key in ('text','_audio'):source.pop(key,None)
    return result

async def read_request(request):
    if request.headers.get('x-morogaro-client') not in ('maker-v11','maker-v10'):raise HTTPException(403,'허용되지 않은 요청이에요.')
    now=time.monotonic()
    while recent and recent[0]<now-60:recent.popleft()
    if len(recent)>=12:raise HTTPException(429,'잠시 후 다시 분석해 주세요.')
    recent.append(now)
    async with request.form(max_files=MAX_FILES,max_fields=8,max_part_size=MAX_FILE) as form:
        uploads=form.getlist('files');project_type=str(form.get('projectType','design'))
        if project_type not in ('design','planning'):raise HTTPException(422,'프로젝트 유형을 확인해 주세요.')
        try:urls=json.loads(str(form.get('urls','[]')))
        except ValueError:raise HTTPException(422,'URL 목록 형식이 올바르지 않아요.')
        if not isinstance(urls,list) or len(urls)>30 or any(not isinstance(u,str) or len(u)>2000 or not safe_url(u) for u in urls):raise HTTPException(422,'웹 주소를 확인해 주세요.')
        if not uploads and not urls:raise HTTPException(422,'파일이나 링크를 추가해 주세요.')
        file_data=[];total=0
        for upload in uploads:
            if not isinstance(upload,UploadFile):raise HTTPException(422,'올바른 파일을 추가해 주세요.')
            data=await upload.read(MAX_FILE+1);total+=len(data)
            if len(data)>MAX_FILE or total>MAX_TOTAL:raise HTTPException(413,'파일당 50MB, 합계 100MB까지 분석할 수 있어요.')
            file_data.append(dict(name=(upload.filename or '이름 없는 파일')[:255],data=data))
        return file_data,project_type,urls,str(form.get('useAI','false'))=='true'

async def analysis_events(args,request):
    files,project_type,urls,use_ai=args
    async with lock:
        yield {'event':'progress','phase':'extract','message':'파일 형식을 확인하고 내용을 읽고 있어요.'}
        result=None
        async for item in parse_isolated(files,project_type,urls,request):
            if item['event']=='extracted':result=item['result']
            else:yield item
        if result is None:raise HTTPException(422,'추출 결과가 없어요.')
        key=ai_key() if use_ai else ''
        if use_ai and key:
            yield {'event':'progress','phase':'ai','message':'캡처와 본문을 함께 보고 제목·진척도·분류를 제안하고 있어요.'}
            job=asyncio.create_task(enrich_with_ai(result,key,os.getenv('OPENAI_MODEL','gpt-4.1-mini')))
            start=time.monotonic()
            try:
                while not job.done():
                    if await request.is_disconnected():job.cancel();raise asyncio.CancelledError()
                    if time.monotonic()-start>170:job.cancel();await asyncio.gather(job,return_exceptions=True);result['mode']='server_fallback';result['warnings'].insert(0,'AI 응답 시간이 초과됐어요. 직접 추출 결과는 유지해요.');break
                    await asyncio.sleep(.15)
                if not job.cancelled() and job.done():result=await job
            finally:
                if not job.done():job.cancel()
        elif use_ai:result['warnings'].insert(0,'오늘 AI 사용량을 다 써서 기본 추출만 진행했어요.' if os.getenv('OPENAI_API_KEY') else '서버에 AI 키가 없어 기본 추출만 진행했어요.')
        yield {'event':'progress','phase':'apply','message':'추출한 값과 썸네일 후보를 정리하고 있어요.'}
        yield {'event':'result','result':public_result(result)}

@app.post('/api/analyze')
async def analyze(request:Request):
    args=await read_request(request)
    async for item in analysis_events(args,request):
        if item['event']=='result':return item['result']
    raise HTTPException(422,'분석 결과를 받지 못했어요.')

@app.post('/api/analyze/stream')
async def analyze_stream(request:Request):
    args=await read_request(request)
    async def generate():
        try:
            async for event in analysis_events(args,request):yield json.dumps(event,ensure_ascii=False)+'\n'
        except HTTPException as error:yield json.dumps({'event':'error','message':str(error.detail)},ensure_ascii=False)+'\n'
        except (asyncio.CancelledError,GeneratorExit):raise
        except Exception:yield json.dumps({'event':'error','message':'분석 중 문제가 발생했어요. 파일을 나눠서 다시 시도해 주세요.'},ensure_ascii=False)+'\n'
    return StreamingResponse(generate(),media_type='application/x-ndjson',headers={'Cache-Control':'no-store','X-Accel-Buffering':'no'})

@app.post('/api/baton-note')
async def baton_note(request:Request):
    from note_ai import create_note, NoteAIError
    if request.headers.get('x-morogaro-client')!='maker-v14':raise HTTPException(403,'허용되지 않은 요청이에요.')
    raw=await request.body()
    if len(raw)>120000:raise HTTPException(413,'노트 자료가 너무 커요.')
    try:data=json.loads(raw)
    except ValueError:raise HTTPException(422,'노트 요청 형식이 올바르지 않아요.')
    if not isinstance(data,dict) or data.get('useAI') is not True:raise HTTPException(403,'AI 도움에 먼저 동의해 주세요.')
    if data.get('action') not in ('draft','ideas') or not isinstance(data.get('context'),dict):raise HTTPException(422,'노트 요청을 확인해 주세요.')
    key=ai_key()
    if not key:raise HTTPException(503,'오늘 AI 사용량을 다 썼어요. 가이드를 보며 직접 적어주세요.' if os.getenv('OPENAI_API_KEY') else '서버에 API 키를 먼저 설정해 주세요.')
    now=time.monotonic()
    while recent and recent[0]<now-60:recent.popleft()
    if len(recent)>=12:raise HTTPException(429,'잠시 후 다시 요청해 주세요.')
    recent.append(now)
    async with lock:
        try:return await asyncio.wait_for(create_note(data['context'],data['action'],key,os.getenv('OPENAI_MODEL','gpt-4.1-mini')),timeout=55)
        except (NoteAIError,ValueError) as error:raise HTTPException(502,str(error))
        except asyncio.TimeoutError:raise HTTPException(504,'초안 작성 시간이 초과됐어요. 현재 노트는 유지돼요.')

# ── 사용성 연구 기록 → 구글 시트 · 드라이브 (Apps Script) ──
# RESEARCH_WEBHOOK_URL(Apps Script 웹 앱 주소)과 RESEARCH_TOKEN(같은 비밀값)을 넣으면 그쪽으로 전달해요.
# 설정이 없으면 이 폴더의 research-logs/ 에 JSON으로 남겨요(로컬 확인용).
RESEARCH_MAX=25*1024*1024
research_jobs=set()
async def forward_research(data:dict):
    url=os.getenv('RESEARCH_WEBHOOK_URL','').strip()
    if not url:
        folder=BASE/'research-logs';folder.mkdir(exist_ok=True)
        name=f"{time.strftime('%Y%m%d-%H%M%S')}-{data.get('sessionId','?')}-{data.get('type')}.json"
        (folder/name).write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8');return
    import httpx
    body=dict(data,token=os.getenv('RESEARCH_TOKEN',''))
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=60,follow_redirects=True) as client:
                r=await client.post(url,content=json.dumps(body,ensure_ascii=False).encode('utf-8'),headers={'Content-Type':'text/plain;charset=utf-8'})
                if r.status_code<500:return
        except Exception:pass
        await asyncio.sleep(2*(attempt+1))

research_hits={}
@app.post('/api/research')
async def research(request:Request):
    # 같은 기기에서 1분에 60번 넘게 보내면 무시해요(장난 방지).
    ip=(request.headers.get('x-forwarded-for','').split(',')[0].strip() or (request.client.host if request.client else '?'))
    now=time.monotonic();hits=[t for t in research_hits.get(ip,[]) if t>now-60]
    if len(hits)>=60:raise HTTPException(429,'잠시 후 다시 시도해 주세요.')
    hits.append(now);research_hits[ip]=hits
    if len(research_hits)>5000:research_hits.clear()
    raw=await request.body()
    if len(raw)>RESEARCH_MAX:raise HTTPException(413,'기록이 너무 커요.')
    try:data=json.loads(raw)
    except ValueError:raise HTTPException(422,'기록 형식이 올바르지 않아요.')
    if not isinstance(data,dict) or data.get('type') not in ('progress','leave','complete') or not re.fullmatch(r's-[0-9]{8}-[A-Za-z0-9]{4,12}',str(data.get('sessionId',''))):
        raise HTTPException(422,'기록 형식이 올바르지 않아요.')
    data['receivedAt']=time.strftime('%Y-%m-%dT%H:%M:%S+09:00',time.gmtime(time.time()+9*3600))
    job=asyncio.create_task(forward_research(data));research_jobs.add(job);job.add_done_callback(research_jobs.discard)
    return JSONResponse({'ok':True},status_code=202)

@app.get('/')
async def index():return FileResponse(BASE/'index.html')
@app.get('/{path:path}')
async def static_file(path:str):
    target=(BASE/path).resolve()
    allowed=(path in STATIC or path in BATON_STATIC
        or (path.startswith('assets/') and target.suffix in ('.svg','.png') and (BASE/'assets').resolve() in target.parents)
        or (path.startswith('vendor/pdfjs/') and target.suffix in ('.bcmap','.pfb','.ttf') and (BASE/'vendor'/'pdfjs').resolve() in target.parents)
        or (path.startswith('baton/assets/') and target.suffix in ('.svg','.png') and target.parent==(BASE/'baton'/'assets').resolve()))
    if not allowed or not target.is_file():raise HTTPException(404,'Not found')
    return FileResponse(target)

if __name__=='__main__':
    import uvicorn
    uvicorn.run(app,host='127.0.0.1',port=int(os.getenv('PORT','8000')),access_log=False)
