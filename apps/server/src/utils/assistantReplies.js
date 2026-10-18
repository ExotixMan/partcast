export const replyText=value=>String(value??'').replace(/\s+/g,' ').trim();
export function partReply(part,details=[]) {
 return [replyText(part.description)||'Part',part.part_number?`Part no. ${replyText(part.part_number)}`:null,...details].filter(Boolean).join('\n  ');
}
export function replyList(title,items,note='') {
 return [title,items.map(item=>`- ${item}`).join('\n'),note].filter(Boolean).join('\n\n');
}
export function partUnit(part,fil=false) {
 const unit=replyText(part.unit);
 if(/^(pcs?|pieces?)\.?$/i.test(unit))return fil?'piraso':'pcs';
 return unit||(fil?'unit':'units');
}
