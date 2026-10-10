"""v15 file-tab/asset contracts and actual offline JavaScript ZIP round-trips.
Uses a local Node runtime when installed; no API keys or network calls.
"""
from pathlib import Path
from unittest import TestCase, skipUnless
from fastapi.testclient import TestClient
from server import app
import json, shutil, subprocess, io, zipfile

ROOT = Path(__file__).resolve().parent.parent
NODE = shutil.which('node')

def javascript(body):
    code = "require(" + json.dumps(str(ROOT/'download-bundle.js')) + ");\n" + \
        "(async()=>{\n" + body + "\n})().catch(e=>{console.error(e);process.exit(1)});"
    proc = subprocess.run([NODE, '-e', code], capture_output=True, timeout=15, check=True)
    return json.loads(proc.stdout)

class DetailContracts(TestCase):
    def test_green_layer_removed_not_just_hidden(self):
        h = (ROOT/'index.html').read_text()
        self.assertNotIn('header-underlay', h)
        self.assertIn('src="./assets/header-surface.svg"', h)
    def test_new_design_ids_and_two_art_states(self):
        h = (ROOT/'index.html').read_text()
        for s in ['3625:3446', '3635:3855', 'detail-layers-info', 'detail-layers-files']:
            self.assertIn(s, h)
        self.assertNotIn('src="./assets/detail-bottom.svg"', h)
    def test_new_module_and_assets_served_exactly(self):
        with TestClient(app, base_url='http://127.0.0.1:8000') as c:
            for name in ['download-bundle.js','assets/detail-download.svg','assets/detail-files-front.svg',
                         'assets/detail-files-inactive.svg','assets/detail-evidence-check.svg',
                         'assets/detail-stage-planting.svg','assets/detail-files-divider.svg']:
                r=c.get('/'+name)
                self.assertEqual(r.status_code, 200, name)
                self.assertEqual(r.content, (ROOT/name).read_bytes(), name)
    def test_ambient_is_client_side(self):
        source = (ROOT/'ambient.js').read_text()
        self.assertNotIn('fetch(', source)
        self.assertNotIn('OPENAI_API_KEY', source)
        self.assertIn('MorogaroAmbient', source)

@skipUnless(NODE, 'Node is optional and only needed for JavaScript ZIP tests')
class OfflineZip(TestCase):
    def test_actual_bytes_korean_names_duplicates_and_empty_file(self):
        import base64
        result=javascript("""
          const a = new File(['바톤의 원본 내용'], '달력.txt');
          const b = new File([new Uint8Array([0,1,2,255])], 'folder/달력.txt');
          const c = new File([], 'empty.txt');
          const zip=await MorogaroBundle.create([a,b,c]);
          console.log(JSON.stringify({type:zip.type, bytes:Buffer.from(await zip.arrayBuffer()).toString('base64')}));
        """)
        self.assertEqual(result['type'], 'application/zip')
        with zipfile.ZipFile(io.BytesIO(base64.b64decode(result['bytes']))) as z:
            self.assertIsNone(z.testzip())
            self.assertEqual(z.namelist(), ['달력.txt','달력 (2).txt','empty.txt'])
            self.assertEqual(z.read('달력.txt'), '바톤의 원본 내용'.encode())
            self.assertEqual(z.read('달력 (2).txt'), bytes([0,1,2,255]))
            self.assertEqual(z.read('empty.txt'), b'')
            for info in z.infolist():
                self.assertEqual(info.compress_type, zipfile.ZIP_STORED)
                self.assertTrue(info.flag_bits & 0x800)
    def test_font_binary_is_not_included(self):
        r=javascript("""
          const zip = await MorogaroBundle.create([new File(['safe'],'note.txt'),new File(['not-a-real-font'],'private.WOFF2')]);
          console.log(JSON.stringify({bytes:Buffer.from(await zip.arrayBuffer()).toString('base64')}));
        """)
        import base64
        with zipfile.ZipFile(io.BytesIO(base64.b64decode(r['bytes']))) as z:
            self.assertEqual(z.namelist(), ['note.txt'])
    def test_pre_cancelled_rejects(self):
        r=javascript("""
          const controller=new AbortController();controller.abort();
          try {await MorogaroBundle.create([new File(['a'],'a.txt')],{signal:controller.signal});console.log('false')}
          catch(e){console.log(JSON.stringify(e.name==='AbortError'))}
        """)
        self.assertTrue(r)
    def test_empty_and_oversize_rejected(self):
        r=javascript("""
          const tests=[];
          for(const files of [[],[new File(['not-a-real-font'],'a.ttf')],Array.from({length:1001},()=>new File([],'a.txt'))]){
            try{await MorogaroBundle.create(files);tests.push(false)}catch(e){tests.push(true)}
          }
          const large=new File([],'large.bin');Object.defineProperty(large,'size',{value:MorogaroBundle.maxBytes+1});
          try{await MorogaroBundle.create([large]);tests.push(false)}catch(e){tests.push(true)}
          console.log(JSON.stringify(tests));
        """)
        self.assertEqual(r,[True]*4)
    def test_no_path_traversal_names(self):
        r=javascript("""
          const zip = await MorogaroBundle.create([new File(['data'],'../../a.txt'),new File(['x'],'..hidden.txt')]);
          console.log(JSON.stringify({bytes:Buffer.from(await zip.arrayBuffer()).toString('base64')}));
        """)
        import base64
        with zipfile.ZipFile(io.BytesIO(base64.b64decode(r['bytes']))) as z:
            self.assertEqual(z.namelist(), ['a.txt','_hidden.txt'])
