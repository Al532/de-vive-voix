const assert=require('node:assert/strict');
const {convert,align}=require('./dist/phonetics-engine.js');
const ipa=s=>convert(s.split('-')).syllables.map(s=>s.ipa).join('.');
assert.equal(ipa('Glo-ri-a'),'ɡlo.ri.a');
assert.equal(ipa('sae-cu-lo-rum'),'se.ku.lo.rum');
assert.equal(ipa('prin-ci-pi-o'),'prin.tʃi.pi.o');
assert.equal(ipa('Spi-ri-tu-i'),'spi.ri.tu.i');
assert.equal(ipa('gra-ti-a'),'ɡra.tsi.a');
assert.equal(ipa('hos-ti-a'),'os.ti.a');
assert.equal(ipa('a-er'),'a.er');
assert.equal(ipa('aër'),'aer');
assert.equal(ipa('ex-cel-sis').replaceAll('.',''),'ekʃelsis'); // cross-boundary group must be flagged
assert(convert(['ag','nus']).issues.some(s=>s.includes('frontière')));
assert(convert(['ex','cel','sis']).issues.some(s=>s.includes('frontière')));
let r=convert(['Glo','ri','a']),a=align(r,'/ˈɡlo.ri.a/');
assert.equal(a.distance,0);assert.deepEqual(a.syllables,['ɡlo','ri','a']);
a=align(r,'ɡlɔrja');assert(a.distance>0);assert.equal(a.syllables.join(''),'ɡlɔrja');
a=align(convert(['a','a']),'a');assert(a.ambiguous);
for(const input of ['ɡloːria','ɡloriax','ɡoria','xloria']) assert.equal(align(r,input).syllables.join(''),input);
const score=require('./dist/phonetics-score.json');let count=0;
for(const p of score.parts)for(const w of p.words){
 const r=convert(w.syllables.map(s=>s.text));
 assert.equal(r.syllables.length,w.syllables.length);
 assert.equal(r.units.map(u=>u.letters).join(''),r.word);
 assert.equal(r.syllables.map(s=>s.ipa).join(''),r.tokens.map(t=>t.sound).join(''));
 for(const s of w.syllables)assert(s.notes.length);
 count++;
}
console.log('Phonétique : cas contextuels, frontières ambiguës, alignement externe et '+count+' occurrences vérifiés.');
