"""Deterministic and mocked-provider regression tests; never call a paid API."""
import asyncio, io, json, unittest, zipfile, copy
from PIL import Image
import fitz
import httpx
from analysis_engine import extract_files, enrich_with_ai, AIResult

TEXT='''제목: 검증용 바톤
카테고리: 그래픽 디자인, 굿즈
사용 툴: Figma
진척도: Planting
스타일 태그: 밝은, 여름
프로젝트 시작일: 2026.09.08
프로젝트 종료일: 2026.09.14
실물 제작: 아니오
소재 및 후가공: 종이
규격: 210 x 148 mm
'''
def file(name,data):return {'name':name,'data':data}
def png():
 im=Image.new('RGB',(120,80),'#00F998');b=io.BytesIO();im.save(b,format='PNG');return b.getvalue()
def base():return extract_files([file('notes.txt',TEXT.encode()),file('image.png',png())],'design',[])
class Extraction(unittest.TestCase):
 def test_explicit_text_values(self):
  r=base();v=r['values'];self.assertEqual(v['title'],'검증용 바톤');self.assertEqual(v['stage'],'Planting');self.assertFalse(v['physical']);self.assertEqual(v['startDate'],'2026-09-08');self.assertEqual(v['endDate'],'2026-09-14');self.assertIn('굿즈',v['categories']);self.assertEqual(r['dimensions'][0]['unit'],'mm');self.assertEqual(len(r['thumbnails']),1)
 def test_raster_no_fabricated_dates_fonts_stage(self):
  r=extract_files([file('2030-01-01_Flowering.png',png())],'design',[])
  self.assertIsNone(r['values']['stage']);self.assertIsNone(r['values']['startDate']);self.assertIsNone(r['values']['physical']);self.assertEqual(r['fonts'],[]);self.assertEqual(r['dimensions'][0]['width'],120);self.assertIn('#00F998',r['colors'])
 def test_pdf_pages_font_metadata_and_coverage(self):
  doc=fitz.open()
  for i in range(8):doc.new_page(width=595.276,height=841.89).insert_text((30,40),'PDF text',fontname='helv')
  r=extract_files([file('document.pdf',doc.tobytes())],'design',[]);s=r['sources'][0]
  self.assertEqual(s['pagesRead'],8);self.assertEqual(s['pagesTotal'],8);self.assertEqual(s['status'],'read');self.assertEqual(len(r['thumbnails']),1);self.assertAlmostEqual(r['dimensions'][0]['width'],210,places=1);self.assertIn('Helvetica',[f['name'] for f in r['fonts']]);self.assertIsNone(r['values']['physical'])
 def test_docx_text_without_execution(self):
  b=io.BytesIO()
  with zipfile.ZipFile(b,'w') as z:
   z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:rFonts w:ascii="ExampleFont"/></w:rPr><w:t>제목: 문서 제목</w:t></w:r></w:p></w:body></w:document>')
  r=extract_files([file('document.docx',b.getvalue())],'planning',[]);self.assertEqual(r['values']['title'],'문서 제목');self.assertEqual(r['fonts'][0]['name'],'ExampleFont');self.assertEqual(r['fonts'][0]['downloadUrl'],'')
 def test_links_not_fetched_or_date_inferred(self):
  r=extract_files([file('plan.fig',b'opaque fig format')],'planning',['https://example.com']);self.assertEqual(r['sources'][0]['status'],'metadata');self.assertIsNone(r['values']['stage']);self.assertTrue(any('조회하지' in w for w in r['warnings']))
 def test_svg_is_not_executed(self):
  data=b'<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="30mm"><script>alert(1)</script><rect fill="#ff0099"/></svg>'
  r=extract_files([file('source.svg',data)],'design',[]);self.assertEqual(len(r['thumbnails']),1);self.assertNotIn('script',r['sources'][0]['text']);self.assertEqual(r['dimensions'][0]['unit'],'mm');self.assertIn('#FF0099',r['colors'])
 def test_bad_dates_not_autofilled(self):
  r=extract_files([file('x.txt','프로젝트 시작일: 2026.02.30\n프로젝트 종료일: 2026.01.01'.encode())],'design',[]);self.assertIsNone(r['values']['startDate'])
 def test_malformed_pdf_retains_source(self):
  r=extract_files([file('bad.pdf',b'%PDF-invalid')],'design',[]);self.assertEqual(len(r['sources']),1);self.assertTrue(r['sources'][0]['warnings']);self.assertIsNone(r['values']['stage'])
 def test_native_ai_pdf_compatibility(self):
  d=fitz.open();d.new_page().insert_text((10,20),'PDF-compatible Illustrator file')
  r=extract_files([file('art.ai',d.tobytes())],'design',[]);self.assertEqual(r['sources'][0]['status'],'partial');self.assertIn('Adobe Illustrator',r['values']['tools'])
class MockedAI(unittest.IsolatedAsyncioTestCase):
 async def test_success_with_grounded_evidence(self):
  r=base();proposal={'values':{**r['values'],'title':'AI 제안 제목'},'sourceKinds':[{'fileId':'f0','kind':'기획서'}], 'thumbnailOrder':[], 'fieldNotes':[], 'summary':'검증용 응답', 'evidence':[{'field':'title','fileId':'f0','location':'본문','quote':'검증용 바톤','basis':'text','value':'AI 제안 제목','previewId':None,'confidence':'high'},{'field':'stage','fileId':'f0','location':'본문','quote':'진척도: Planting','basis':'text','value':'Planting','previewId':None,'confidence':'high'},{'field':'sourceKind','fileId':'f0','location':'본문','quote':'카테고리: 그래픽 디자인, 굿즈','basis':'text','value':'기획서','previewId':None,'confidence':'high'}]}
  captured={}
  def handle(req):
   captured.update(json.loads(req.content));return httpx.Response(200,json={'status':'completed','output':[{'type':'message','content':[{'type':'output_text','text':json.dumps(proposal,ensure_ascii=False)}]}]})
  out=await enrich_with_ai(r,'TEST_KEY_NOT_REAL','gpt-4.1-mini',httpx.MockTransport(handle));self.assertEqual(out['mode'],'ai');self.assertEqual(out['values']['title'],'AI 제안 제목');self.assertFalse(captured['store']);self.assertTrue(captured['text']['format']['strict']);self.assertTrue(any(c['type']=='input_image' for c in captured['input'][0]['content']));self.assertNotIn('TEST_KEY_NOT_REAL',json.dumps(out))
 async def test_unknown_evidence_does_not_overwrite(self):
  r=base();p={'values':{**r['values'],'startDate':'2099-01-01'},'sourceKinds':[],'thumbnailOrder':[],'fieldNotes':[],'summary':'테스트','evidence':[{'field':'startDate','fileId':'f99','location':'x','quote':'made up','basis':'text','value':'2099-01-01','previewId':None,'confidence':'high'}]}
  out=await enrich_with_ai(r,'TEST','model',httpx.MockTransport(lambda req:httpx.Response(200,json={'status':'completed','output':[{'content':[{'type':'output_text','text':json.dumps(p)}]}]})));self.assertEqual(out['values']['startDate'],'2026-09-08')
 async def test_flowering_rejected_and_fallback(self):
  r=base();p={'values':{**r['values'],'stage':'Flowering'},'sourceKinds':[],'thumbnailOrder':[],'fieldNotes':[],'summary':'테스트','evidence':[]}
  out=await enrich_with_ai(r,'TEST','model',httpx.MockTransport(lambda req:httpx.Response(200,json={'status':'completed','output':[{'content':[{'type':'output_text','text':json.dumps(p)}]}]})));self.assertEqual(out['mode'],'server_fallback');self.assertNotEqual(out['values']['stage'],'Flowering')
 async def test_provider_failure_retains_extracted_values(self):
  r=base();out=await enrich_with_ai(r,'TEST','model',httpx.MockTransport(lambda req:httpx.Response(401,json={'error':{'message':'secret'}})));self.assertEqual(out['mode'],'server_fallback');self.assertEqual(out['values']['title'],'검증용 바톤');self.assertNotIn('secret',json.dumps(out))
 async def test_refusal_is_not_an_analysis_result(self):
  out=await enrich_with_ai(base(),'TEST','model',httpx.MockTransport(lambda req:httpx.Response(200,json={'status':'completed','output':[{'content':[{'type':'refusal','refusal':'not available'}]}]})));self.assertEqual(out['mode'],'server_fallback')
if __name__=='__main__':unittest.main()
