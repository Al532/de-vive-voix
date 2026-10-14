/* Deliberately narrow, traceable Roman ecclesiastical Latin prototype.
 * Every output token retains its source letter span and MusicXML syllable.
 * Not a universal G2P model; accent, fine vowel quality and gemination require review.
 */
(function (root) {
  'use strict';
  const vowel = c => /^[aeiouy]$/.test(c || '');
  const clean = s => s.toLowerCase().replace(/æ/g,'ae').replace(/œ/g,'oe').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z]/g,'');
  const tokenize = s => Array.from(s.normalize('NFC').replace(/g/g,'ɡ').replace(/[\s./\[\]ˈˌ͜͡]/g,''));
  function convert(syllables) {
    const issues=[], units=[], tokens=[], owners=[], chunks=syllables.map(clean);
    syllables.forEach((s,i)=> {
      if(!chunks[i]) issues.push('Syllabe sans lettres reconnues : '+s);
      if(/[^a-zæœ\s.,;:!?'-]/i.test(s.normalize('NFD').replace(/[\u0300-\u036f]/g,''))) issues.push('Caractère hors du latin pris en charge : '+s);
      for(let j=0;j<chunks[i].length;j++) owners.push(i);
    });
    const word=chunks.join('');
    const front=i=>/^(e|i|y|ae|oe)/.test(word.slice(i));
    const emit=(start,len,ipa,rule)=>{
      const ids=[...new Set(owners.slice(start,start+len))];
      const unit={letters:word.slice(start,start+len),ipa,start,end:start+len,syllable:owners[start],rule,crossing:ids.length>1};
      if(unit.crossing) issues.push('Le groupe « '+unit.letters+' » traverse une frontière de la partition : répartition à vérifier.');
      units.push(unit);
      for(const sound of tokenize(ipa)) tokens.push({sound,syllable:owners[start]});
      return start+len;
    };
    for(let i=0;i<word.length;) {
      const c=word[i], rest=word.slice(i); let len=1,ipa=c,rule='Correspondance simple';
      const pair=rest.slice(0,2);
      if(['ae','oe'].includes(pair) && owners[i]===owners[i+1] && !/[ëË]/.test(syllables[owners[i]])) {len=2;ipa='e';rule=pair+' → e';}
      else if(pair==='ch') {len=2;ipa='k';rule='ch → k';}
      else if(pair==='ph') {len=2;ipa='f';rule='ph → f';}
      else if(pair==='th') {len=2;ipa='t';rule='th → t';}
      else if(pair==='rh') {len=2;ipa='r';rule='rh → r';}
      else if(pair==='gn') {len=2;ipa='ɲ';rule='gn → ɲ (durée à vérifier)';issues.push('Consonne gn : durée et partage entre syllabes à vérifier.');}
      else if(pair==='sc' && front(i+2)) {len=2;ipa='ʃ';rule='sc devant e/i/ae/oe/y';}
      else if(pair==='xc' && front(i+2)) {len=2;ipa='kʃ';rule='xc devant e/i/ae/oe/y';}
      else if(pair==='qu') {len=2;ipa='kw';rule='qu → kw';}
      else if(c==='c') {ipa=front(i+1)?'tʃ':'k';rule=front(i+1)?'c adouci par la voyelle suivante':'c dur';}
      else if(c==='g') {ipa=front(i+1)?'dʒ':'ɡ';rule=front(i+1)?'g adouci par la voyelle suivante':'g dur';}
      else if(c==='t' && word[i+1]==='i' && vowel(word[i+2]) && i>0 && !/[stx]/.test(word[i-1])) {ipa='ts';rule='ti devant une voyelle, hors sti/tti/xti';}
      else if(c==='h') {ipa='';rule='h muet';if(['mihi','nihil'].includes(word)){ipa='k';rule='Exception mihi / nihil';}}
      else if(c==='x') ipa='ks';
      else if(c==='y') ipa='i';
      else if(c==='j') ipa='j';
      else if(c==='w'||c==='q') issues.push('Lettre hors des règles couvertes dans ce contexte : '+c);
      else if(c==='z') {ipa='dz';issues.push('z : réalisation et durée à vérifier.');}
      else if(c==='i' && vowel(word[i+1])) {
        if(owners[i]===owners[i+1]) {ipa='j';rule='i devant voyelle dans la même syllabe';issues.push('i consonantique proposé : vérifier selon le mot.');}
        else {ipa='i';rule='i vocalique conservé : syllabes séparées dans la partition';}
      }
      else if(c==='u' && i>0 && /[gs]/.test(word[i-1]) && vowel(word[i+1])) issues.push('u après g/s devant voyelle : vérifier voyelle ou semi-consonne.');
      if(c==='s' && vowel(word[i-1]) && vowel(word[i+1])) issues.push('s entre voyelles : variante s/z à vérifier.');
      if(!'abcdefghijklmnopqrstuvwxyz'.includes(c)) issues.push('Lettre non reconnue : '+c);
      if(i>0 && c===word[i-1] && !vowel(c)) issues.push('Consonne double : durée et répartition à vérifier.');
      i=emit(i,len,ipa,rule);
    }
    const result=syllables.map((text,index)=>({text,ipa:tokens.filter(t=>t.syllable===index).map(t=>t.sound).join('')}));
    result.forEach(s=>{
      s.nucleus=(s.ipa.match(/[aeiouɛɔɪʊə]+/g)||[]).join(' · ');
      if((s.ipa.match(/[aeiouɛɔɪʊə]/g)||[]).length>1) issues.push('Plusieurs sons vocaliques dans « '+s.text+' » : vérifier diphtongue ou élision.');
      if(!s.nucleus) issues.push('Pas de voyelle identifiée dans « '+s.text+' ».');
    });
    return {word,syllables:result,units,tokens,issues:[...new Set(issues)]};
  }
  // Global edit alignment with explicit accounting of ambiguous backtraces.
  // Non-exact results are always review-only, never marked validated.
  function align(reference, input) {
    const target=tokenize(input), a=reference.tokens, n=a.length,m=target.length;
    if(n>300||m>300) throw new Error('Limite : 300 signes phonétiques par mot.');
    const dp=Array.from({length:n+1},()=>new Array(m+1).fill(0));
    const count=Array.from({length:n+1},()=>new Array(m+1).fill(1));
    for(let i=0;i<=n;i++) dp[i][0]=i;
    for(let j=0;j<=m;j++) dp[0][j]=j;
    for(let i=1;i<=n;i++) for(let j=1;j<=m;j++) {
      const v=[dp[i-1][j-1]+(a[i-1].sound===target[j-1]?0:1),dp[i-1][j]+1,dp[i][j-1]+1];
      dp[i][j]=Math.min(...v);
      count[i][j]=Math.min(2,v.reduce((s,x,k)=>s+(x===dp[i][j]?[count[i-1][j-1],count[i-1][j],count[i][j-1]][k]:0),0));
    }
    const assigned=reference.syllables.map(()=>[]);let i=n,j=m;
    while(i||j) {
      if(i&&j&&dp[i][j]===dp[i-1][j-1]+(a[i-1].sound===target[j-1]?0:1)) {assigned[a[i-1].syllable].unshift(target[j-1]);i--;j--;}
      else if(i&&dp[i][j]===dp[i-1][j]+1) i--;
      else {assigned[a[Math.max(0,i-1)]?.syllable??0].unshift(target[j-1]);j--;}
    }
    return {syllables:assigned.map(s=>s.join('')),distance:dp[n][m],ambiguous:count[n][m]>1,normalized:target.join('')};
  }
  const api={convert,align};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else root.LatinPhonetics=api;
})(typeof window!=='undefined'?window:globalThis);
