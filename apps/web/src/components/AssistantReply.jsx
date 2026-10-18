import {replyBlocks,replyEmphasis} from '../lib/assistantText.js';
function Inline({text}) {
 return replyEmphasis(text).map((part,index)=>part.strong?<strong key={index} className="font-bold text-slate-950">{part.text}</strong>:part.text);
}
export default function AssistantReply({text}) {
 return <div className="assistant-reply space-y-4 text-base leading-7 text-slate-800 [overflow-wrap:anywhere]">
  {replyBlocks(text).map((block,index)=>{
   if(block.type==='paragraph')return <p key={index} className="whitespace-pre-line"><Inline text={block.lines.join('\n')} /></p>;
   const List=block.type==='steps'?'ol':'ul';
   return <List key={index} {...(block.type==='steps'?{start:block.start}:{})} className={block.type==='steps'?'list-decimal space-y-3 pl-6 marker:font-bold marker:text-red-700':'space-y-3'}>
    {block.items.map((lines,item)=><li key={item} className={block.type==='list'?'border-l-2 border-slate-200 pl-3':'pl-1'}>
      <p className="font-semibold text-slate-950"><Inline text={lines[0]} /></p>
      {lines.slice(1).map((line,detail)=><p key={detail} className={/^Part no\./.test(line)?'mt-0.5 font-mono text-sm text-slate-600':'mt-1'}><Inline text={line}/></p>)}
    </li>)}
   </List>;
  })}
 </div>;
}
