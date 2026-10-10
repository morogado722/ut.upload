"""v14 contracts and mocked provider tests. No live AI calls or user documents."""
from pathlib import Path
from unittest.mock import patch, AsyncMock
import os, unittest, json
from fastapi.testclient import TestClient
from server import app
from note_ai import bounded_context, normalize_proposal, NoteProposal, create_note, NoteAIError

P=Path(__file__).resolve().parent.parent

class NoteAndResultContracts(unittest.TestCase):
    def test_removed_selector_inputs_kept(self):
        h=(P/'index.html').read_text();self.assertNotIn('id="dimension-source"',h)
        for name in ['dimension-width','dimension-height','dimension-unit','baton-note','review-note-section','baton-detail']:self.assertIn('id="'+name+'"',h)
    def test_optional_notes_and_three_ideas(self):
        self.assertIn('0/300 · 권장',(P/'index.html').read_text())
        self.assertIn("next.length>=3",(P/'note.js').read_text())
        self.assertNotIn("step === 6 ||",(P/'stepper.js').read_text())
    def test_new_modules_served(self):
        with TestClient(app,base_url='http://127.0.0.1:8000') as c:
            for name in ['ambient.js','ambient.css','note.js','note.css','detail.js','detail.css','assets/note-check-on.svg','assets/detail-panel-front.svg']:
                r=c.get('/'+name);self.assertEqual(r.status_code,200,name);self.assertEqual(r.content,(P/name).read_bytes())
    def test_private_files_not_served(self):
        with TestClient(app,base_url='http://127.0.0.1:8000') as c:
            for name in ['.env','.env.example','note_ai.py','README.md']:self.assertEqual(c.get('/'+name).status_code,404)
    def test_theme_has_neutral_and_five_colors(self):
        css=(P/'ambient.css').read_text()
        for name in ['neutral','Seeding','Planting','Growing','Blooming','Flowering']:self.assertIn('.ambient-'+name,css)
        self.assertIn('1100ms',css);self.assertIn('prefers-reduced-motion',css)
    def test_no_consent_no_note_call(self):
        with TestClient(app,base_url='http://127.0.0.1:8000') as c,patch('note_ai.create_note',new_callable=AsyncMock) as fn:
            response=c.post('/api/baton-note',headers={'X-Morogaro-Client':'maker-v14'},json={'action':'draft','context':{},'useAI':False})
            self.assertEqual(response.status_code,403);fn.assert_not_called()
    def test_no_key_honest(self):
        with TestClient(app,base_url='http://127.0.0.1:8000') as c,patch.dict(os.environ,{'OPENAI_API_KEY':''}):
            response=c.post('/api/baton-note',headers={'X-Morogaro-Client':'maker-v14'},json={'action':'draft','context':{},'useAI':True})
            self.assertEqual(response.status_code,503)
    def test_other_origin_rejected(self):
        with TestClient(app,base_url='http://127.0.0.1:8000') as c:
            r=c.post('/api/baton-note',headers={'Origin':'https://other.example','X-Morogaro-Client':'maker-v14'},json={'useAI':True})
            self.assertEqual(r.status_code,403)
    def test_oversize_context(self):
        with TestClient(app,base_url='http://127.0.0.1:8000') as c:
            r=c.post('/api/baton-note',headers={'X-Morogaro-Client':'maker-v14'},content='a'*120001)
            self.assertEqual(r.status_code,413)
    def test_unknown_evidence_dropped(self):
        ctx=bounded_context({'title':'계절 달력','evidence':[{'id':'e1','quote':'앞면 편집을 했어요.'}]})
        prop=NoteProposal.model_validate({'sentences':[{'text':'앞면 편집을 했어요.','evidenceIds':['e1'],'section':'how'},{'text':'알 수 없는 이야기','evidenceIds':['absent'],'section':'why'}],'ideas':['새 방향1','새 방향2','새 방향3','새 방향4']})
        r=normalize_proposal(prop,ctx,'draft');self.assertEqual(r['note'],'앞면 편집을 했어요.');self.assertEqual(r['ideas'],[])
        r=normalize_proposal(prop,ctx,'ideas');self.assertEqual(r['note'],'');self.assertEqual(len(r['ideas']),3)
    def test_context_does_not_send_original_files(self):
        c=bounded_context({'title':'달력','files':['secret'],'images':['secret'],'stage':'Flowering'})
        self.assertNotIn('files',c);self.assertNotIn('images',c);self.assertIsNone(c['stage'])
    def test_no_private_story_fields(self):
        c=bounded_context({'title':'달력','stopReason':'unknown','care':'unknown','physical':False})
        self.assertNotIn('stopReason',c);self.assertNotIn('care',c)
        self.assertIn('false',[e['quote'] for e in c['evidence']])

class NoteProvider(unittest.IsolatedAsyncioTestCase):
    async def test_responses_request_and_real_schema(self):
        proposal={'sentences':[{'text':'계절 달력을 만들고 있어요.','evidenceIds':['form:title'],'section':'how'}],'ideas':[]}
        answer={'status':'completed','output':[{'type':'message','content':[{'type':'output_text','text':json.dumps(proposal,ensure_ascii=False)}]}]}
        from unittest.mock import MagicMock
        client=AsyncMock();response=MagicMock(status_code=200);response.json.return_value=answer;client.post.return_value=response
        manager=MagicMock();manager.__aenter__=AsyncMock(return_value=client);manager.__aexit__=AsyncMock(return_value=None)
        with patch('note_ai.httpx.AsyncClient',return_value=manager):
            result=await create_note({'title':'계절 달력'},'draft','test-only-key','gpt-4.1-mini')
        self.assertEqual(result['note'],'계절 달력을 만들고 있어요.')
        body=client.post.call_args.kwargs['json']
        self.assertFalse(body['store']);self.assertTrue(body['text']['format']['strict']);self.assertNotIn('test-only-key',json.dumps(result))
        self.assertEqual(body['text']['format']['schema']['additionalProperties'],False)
    async def test_incomplete_response_does_not_fabricate(self):
        from unittest.mock import MagicMock
        client=AsyncMock();response=MagicMock(status_code=200);response.json.return_value={'status':'incomplete','output':[]};client.post.return_value=response
        manager=MagicMock();manager.__aenter__=AsyncMock(return_value=client);manager.__aexit__=AsyncMock(return_value=None)
        with patch('note_ai.httpx.AsyncClient',return_value=manager):
            with self.assertRaises(NoteAIError):await create_note({'title':'계절 달력'},'draft','test-only-key','gpt-4.1-mini')

if __name__=='__main__':unittest.main()
