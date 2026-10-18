// A small text-only format: paragraphs, bullet lists and numbered steps.
// No HTML, images or links are interpreted from an assistant response.
export function replyBlocks(value) {
 const blocks=[];
 let current=null;
 for(const line of String(value??'').replace(/\r\n?/g,'\n').split('\n')){
  const marker=line.match(/^\s*(?:([-*•])\s+|(\d+)[.)]\s+)(.+)$/);
  if(marker){
   const type=marker[2]?'steps':'list';
   if(current?.type!==type){current={type,items:[],...(type==='steps'?{start:Number(marker[2])}:{})};blocks.push(current);}
   current.items.push([marker[3]]);
  }else if(!line.trim()){
   current=null;
  }else if(current&&(current.type==='list'||current.type==='steps')&&/^\s+/.test(line)){
   current.items.at(-1).push(line.trim());
  }else{
   if(current?.type!=='paragraph'){current={type:'paragraph',lines:[]};blocks.push(current);}
   current.lines.push(line.trim());
  }
 }
 return blocks;
}
export function replyEmphasis(value) {
 return String(value).split(/(\*\*[^*\n]+\*\*)/g).filter(Boolean).map(text=>({text:text.startsWith('**')&&text.endsWith('**')?text.slice(2,-2):text,strong:text.startsWith('**')&&text.endsWith('**')}));
}
