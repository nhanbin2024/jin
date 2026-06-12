import fs from 'fs';
import path from 'path';
const root = process.cwd();
const banned = ['$2.41T','66,835','3,278','18 Gwei','Thị trường','Bitcoin ETF flow remains','Ethereum liquidity improves','0x7f3'];
const files = [];
function walk(dir){ for(const f of fs.readdirSync(dir)){ const p=path.join(dir,f); if(p.includes('node_modules')||p.includes('.next')||p.includes('.git')) continue; const s=fs.statSync(p); if(s.isDirectory()) walk(p); else if(/\.(ts|tsx|js|jsx|json|css|md)$/.test(f)) files.push(p); } }
walk(root);
const hits=[];
for(const file of files){ const text=fs.readFileSync(file,'utf8'); for(const b of banned){ if(text.includes(b)) hits.push(`${file}: ${b}`); } }
if(hits.length){ console.error('Mock or Vietnamese UI strings found:\n'+hits.join('\n')); process.exit(1); }
console.log('Live-only verification passed.');
