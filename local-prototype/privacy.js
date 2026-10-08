export const KEY = 'aic-local-prototype-v1';
export function textMessages(messages) {
  if (!Array.isArray(messages) || messages.some(m => !['user','assistant'].includes(m?.role) || typeof m.content !== 'string')) throw new Error('Alleen tekst is toegestaan.');
  return messages.map(m => ({role:m.role,content:m.content}));
}
export function contextFor(messages, limit=6000) {
  const clean=textMessages(messages); let total=0; const result=[];
  for(let i=clean.length-1;i>=0;i--){if(total+clean[i].content.length>limit)break;result.unshift(clean[i]);total+=clean[i].content.length;}
  while(result[0]?.role==='assistant')result.shift();
  return result;
}
export function restore(storage) {
  const raw=storage.getItem(KEY);
  if(!raw)return [];
  const messages=textMessages(JSON.parse(raw));
  if(messages.length>100 || raw.length>200000)throw new Error('Opgeslagen gesprek is te groot.');
  return messages;
}
export function persist(storage,messages,enabled) {
  if(!enabled){storage.removeItem(KEY);return;}
  const data=JSON.stringify(textMessages(messages));
  if(messages.length>100 || data.length>200000)throw new Error('Opslag is vol. Wis het gesprek of zet bewaren uit.');
  storage.setItem(KEY,data);
}

