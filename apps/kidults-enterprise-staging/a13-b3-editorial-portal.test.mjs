import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve('apps/kidults-enterprise-staging/public/a13-b3');
const pages=['index.html','markets/index.html','kidult-100/index.html','research/index.html','canon/index.html','enterprise/index.html','methodology/index.html','archive/index.html','status/index.html','about/index.html'];

test('all A13-B3 pages exist and use shared editorial system',()=>{
  for(const page of pages){
    const file=path.join(root,page);
    assert.equal(fs.existsSync(file),true,page);
    const html=fs.readFileSync(file,'utf8');
    assert.match(html,/editorial\.css/);
    assert.match(html,/data-global-header/);
    assert.match(html,/data-global-footer/);
    assert.doesNotMatch(html,/data-global-trust/);
  }
});

test('major product pages contain substantive sections',()=>{
  for(const page of ['index.html','markets/index.html','kidult-100/index.html','research/index.html','canon/index.html','enterprise/index.html']){
    const html=fs.readFileSync(path.join(root,page),'utf8');
    assert.ok((html.match(/<section/g)||[]).length>=7,page);
  }
});

test('editorial system raises type scale and limits footer columns',()=>{
  const css=fs.readFileSync(path.join(root,'assets/editorial.css'),'utf8');
  assert.match(css,/font-size:18px/);
  assert.match(css,/grid-template-columns:1\.5fr 1fr 1fr/);
  assert.doesNotMatch(css,/background:var\(--forest\);color:white;padding:34px/);
});