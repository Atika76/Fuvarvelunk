"""Focused static SEO and functional-markup preservation checks; no API writes."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse, unquote
import json, re, subprocess, unittest, xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
BASE='https://fuvarvelunk.hu/'
BASELINE='4565812c8413a492ed653d1fccfd674088e21d9f'
PRIVATE=['admin.html','belepes.html','fuvar-feladas.html','driver.html','trip.html']

class Page(HTMLParser):
    def __init__(self,s):
        super().__init__();self.source=s;self.tags=[];self.feed(s)
    def handle_starttag(self,t,a):self.tags.append((t,dict(a)))
    def attrs(self,t,**match):return [a for tag,a in self.tags if tag==t and all(a.get(k)==v for k,v in match.items())]

PAGES={p.name:Page(p.read_text(encoding='utf-8-sig')) for p in ROOT.glob('*.html') if not p.name.startswith('google')}
URLS=[e.text for e in ET.parse(ROOT/'sitemap.xml').findall('.//{*}loc')]

class SEO(unittest.TestCase):
    def test_sitemap_only_existing_canonical_public_pages(self):
        self.assertCountEqual(URLS,[BASE,BASE+'fuvarok.html',BASE+'kapcsolat.html'])
        for url in URLS:
            p=PAGES[urlparse(url).path.lstrip('/') or 'index.html']
            self.assertEqual([a['href'] for a in p.attrs('link',rel='canonical')],[url])
            self.assertNotIn('noindex',p.attrs('meta',name='robots')[0]['content'])
    def test_unique_metadata_and_correct_open_graph(self):
        titles=[];descriptions=[]
        for name,p in PAGES.items():
            title=re.findall(r'<title>(.*?)</title>',p.source,re.S)
            self.assertEqual(len(title),1,name);self.assertNotIn('.hu.hu',title[0]);titles+=title
            desc=p.attrs('meta',name='description');self.assertEqual(len(desc),1,name);descriptions.append(desc[0]['content'])
            canonical=p.attrs('link',rel='canonical')[0]['href']
            self.assertEqual(p.attrs('meta',property='og:url')[0]['content'],canonical)
            for value in re.findall(r'<script type="application/ld\+json">(.*?)</script>',p.source,re.S):json.loads(value)
        self.assertEqual(len(titles),len(set(titles)));self.assertEqual(len(descriptions),len(set(descriptions)))
    def test_private_pages_noindex_and_robot_crawl_permitted(self):
        for name in PRIVATE:self.assertIn('noindex',PAGES[name].attrs('meta',name='robots')[0]['content'])
        robots=(ROOT/'robots.txt').read_text();self.assertIn('Sitemap: '+BASE+'sitemap.xml',robots)
        self.assertNotRegex(robots,r'(?im)^Disallow:\s*/\s*$')
    def test_internal_links_and_anchors_exist(self):
        for name,p in PAGES.items():
            for a in p.attrs('a'):
                u=urlparse(urljoin(BASE+name,a.get('href','')))
                if u.netloc!='fuvarvelunk.hu':continue
                target=unquote(u.path).lstrip('/') or 'index.html';self.assertTrue((ROOT/target).is_file(),(name,target))
                if u.fragment and target in PAGES:self.assertTrue(any(b.get('id')==unquote(u.fragment) for _,b in PAGES[target].tags),(name,u.fragment))
    def test_existing_forms_ids_and_executable_scripts_preserved(self):
        for name,p in PAGES.items():
            before=Page(subprocess.check_output(['git','show',BASELINE+':'+name],cwd=ROOT).decode('utf-8-sig'))
            self.assertTrue({a['id'] for _,a in before.tags if 'id' in a}.issubset({a['id'] for _,a in p.tags if 'id' in a}),name)
            self.assertEqual(before.attrs('form'),p.attrs('form'),name)
            self.assertEqual(before.attrs('input'),p.attrs('input'),name)
            self.assertEqual(before.attrs('script',src='js/app.js'),p.attrs('script',src='js/app.js'))
    def test_trip_help_is_server_visible_without_fabricated_route_pages(self):
        text=PAGES['fuvarok.html'].source
        self.assertIn('id="keresesi-utmutato"',text);self.assertIn('Miért lehet üres a találati lista?',text)
        self.assertIn('regisztrálj',text);self.assertEqual(len(URLS),3)

if __name__=='__main__':unittest.main()
