/* Piece identities stay in links; practice settings stay in per-piece storage. */
(function(root){'use strict';
const title=score=>score.title+(score.composer?' — '+score.composer:'');
function entries(records,pilot){return [{id:'',title:title(pilot)},...records.filter(r=>r&&typeof r.id==='string'&&r.id&&r.score&&typeof r.score.title==='string').map(r=>({id:r.id,title:title(r.score)})).sort((a,b)=>a.title.localeCompare(b.title,'fr'))];}
const readerUrl=id=>'index.html'+(id?'?score='+encodeURIComponent(id):'');
const importUrl=id=>'importer.html'+(id?'?score='+encodeURIComponent(id):'');
root.ScoreNavigation={entries,readerUrl,importUrl};if(typeof module!=='undefined')module.exports=root.ScoreNavigation;
})(globalThis);
