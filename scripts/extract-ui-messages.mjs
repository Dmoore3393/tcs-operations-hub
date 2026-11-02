import fs from 'node:fs';import path from 'node:path';import ts from 'typescript';
const found=new Map();const add=(value,file,kind)=>{value=value.replace(/\s+/g,' ').trim();if(!/[A-Za-z]{2}/.test(value)||value.length>2500||/^[./#@]|^(?:https?:|data:|mailto:)|=>|className|^\w+(?:-\w+){2}/.test(value))return;const entry=found.get(value)||{text:value,files:[],kinds:[]};if(!entry.files.includes(file))entry.files.push(file);if(!entry.kinds.includes(kind))entry.kinds.push(kind);found.set(value,entry);};
const uiKeys=new Set(['title','label','description','subtitle','helper','placeholder','detail','heading','error','message','body','name','text']);
function walk(folder){for(const item of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,item.name);if(item.isDirectory()){if(!['i18n','localized-jsx'].includes(item.name))walk(file);continue;}if(!/\.tsx?$/.test(file))continue;const raw=fs.readFileSync(file,'utf8'),source=ts.createSourceFile(file,raw,ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 function visit(n){if(ts.isJsxText(n))add(n.text,file,'jsx');
 if(ts.isStringLiteralLike(n)){
  const p=n.parent,attribute=ts.isJsxAttribute(p),prop=ts.isPropertyAssignment(p)?p.name.getText(source).replace(/["']/g,''):'';
  if(attribute&&['title','label','description','subtitle','helper','placeholder','aria-label','alt'].includes(p.name.getText(source)))add(n.text,file,'attribute');
  else if(uiKeys.has(prop))add(n.text,file,'copy');
  else if(file.endsWith('.tsx')&&/\s/.test(n.text)&&!/[{};]|(?:\b(?:bg|text|border|rounded|flex|grid|mt|px|gap|py|w|h)-)|\[|\]|@/.test(n.text))add(n.text,file,'ui-string');
  else if((ts.isThrowStatement(p)||ts.isNewExpression(p)&&p.expression.getText(source)==='Error')&&/\s/.test(n.text))add(n.text,file,'error');
 }
 ts.forEachChild(n,visit);}
 visit(source);
}}
walk('src');const values=[...found.values()].sort((a,b)=>a.text.localeCompare(b.text));fs.writeFileSync('ui-message-inventory.json',JSON.stringify(values,null,2)+'\n');console.log(JSON.stringify({messages:values.length,words:values.reduce((n,v)=>n+v.text.split(' ').length,0)}));
