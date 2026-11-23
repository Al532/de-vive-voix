/* Piece identities stay in links; practice settings stay in per-piece storage. */
(function(root){'use strict';
const title=score=>score.title+(score.composer?' — '+score.composer:'');
function entries(records,pilot){return [{id:'',title:title(pilot)},...records.filter(r=>r&&typeof r.id==='string'&&r.id&&r.score&&typeof r.score.title==='string').map(r=>({id:r.id,title:title(r.score)})).sort((a,b)=>a.title.localeCompare(b.title,'fr'))];}
const readerUrl=id=>'index.html'+(id?'?score='+encodeURIComponent(id):'');
const importUrl=id=>'importer.html'+(id?'?score='+encodeURIComponent(id):'');
const noFolder='unfiled';
function folderOptions(folders){
 return [{id:'',name:'Tous les dossiers'},{id:noFolder,name:'Sans dossier'},...folders];
}
function folderAssignments(locations){
 return new Map(locations.map(({score_id,folder_id})=>[score_id,folder_id]));
}
function scoresInFolder(scores,assignments,folder){
 return folder?scores.filter(score=>(assignments.get(score.id)||noFolder)===folder):scores;
}
root.ScoreNavigation={entries,readerUrl,importUrl,folderOptions,folderAssignments,scoresInFolder,noFolder};if(typeof module!=='undefined')module.exports=root.ScoreNavigation;
})(globalThis);

