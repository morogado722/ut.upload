"""v12 integration contracts. No real AI request or user file access."""
from pathlib import Path
from html.parser import HTMLParser
import unittest
from fastapi.testclient import TestClient
from server import app

ROOT=Path(__file__).resolve().parent.parent
class StepHTML(HTMLParser):
    def __init__(self):
        super().__init__(); self.steps=[]; self.labels=[]; self.label=False; self.ids=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if 'id' in a:self.ids.append(a['id'])
        if tag=='button' and 'data-step' in a:self.steps.append(a['data-step'])
        if tag=='span' and a.get('class')=='step-label':self.label=True
    def handle_endtag(self,tag):
        if tag=='span':self.label=False
    def handle_data(self,data):
        if self.label:self.labels.append(data)

class SixStepNavigation(unittest.TestCase):
    def setUp(self):
        self.doc=StepHTML();self.doc.feed((ROOT/'index.html').read_text())
    def test_six_labels_and_numbers(self):
        self.assertEqual(self.doc.steps,['1','2','3','4','5','6'])
        self.assertEqual(self.doc.labels,['파일 올리기','소스 확인','썸네일 설정','프로젝트 정보','파일 정보','바톤 노트 작성'])
    def test_unique_ids_and_section_anchors(self):
        self.assertEqual(len(self.doc.ids),len(set(self.doc.ids)))
        for name in ['review-sources-section','review-thumbnails-section','review-project-section','review-file-section']:
            self.assertIn(name,self.doc.ids)
    def test_original_connector_dimensions(self):
        svg=(ROOT/'assets/stepper-six-connectors.svg').read_text()
        self.assertIn('width="2" height="292"',svg)
        self.assertEqual(svg.count('<line '),5)
    def test_new_styles_and_script_are_served(self):
        with TestClient(app,base_url='http://127.0.0.1:8000') as c:
            for path in ['stepper.css','stepper.js','assets/stepper-six-connectors.svg']:
                r=c.get('/'+path)
                self.assertEqual(r.status_code,200,path)
                self.assertEqual(r.content,(ROOT/path).read_bytes())
    def test_private_server_files_still_not_served(self):
        with TestClient(app,base_url='http://127.0.0.1:8000') as c:
            for path in ['.env','.env.example','server.py','analysis_engine.py']:
                self.assertEqual(c.get('/'+path).status_code,404,path)
    def test_progress_rule_is_still_weighted_fifty_percent(self):
        self.assertIn('return state.files.length > 0 ? 50 : 0;', (ROOT/'app.js').read_text())
    def test_creative_progress_remains_five_stages(self):
        self.assertIn("const STAGES=['Seeding','Planting','Growing','Blooming','Flowering'];", (ROOT/'review.js').read_text())
if __name__=='__main__':unittest.main()
