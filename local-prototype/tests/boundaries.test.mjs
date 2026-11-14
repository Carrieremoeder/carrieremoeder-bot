import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {restore,persist} from '../privacy.js';
test('malformed saved data fails closed',()=>{
 for(const raw of ['{','null','{}',JSON.stringify([{role:'system',content:'x'}])]) assert.throws(()=>restore({getItem:()=>raw}));
});
test('saving never produces a conversation that exceeds restore limits',()=>{
 assert.throws(()=>persist({setItem:()=>assert.fail('must not write')},Array.from({length:101},()=>({role:'user',content:'x'})),true));
 assert.throws(()=>persist({setItem:()=>assert.fail('must not write')},[{role:'user',content:'x'.repeat(200001)}],true));
});
test('app has no network chat, auth, analytics, or cloud fallback code',()=>{
 const source=readFileSync(new URL('../main.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|\/api\/|console\./);
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.doesNotMatch(html,/type=["']file["']/);
 assert.match(source,/engine\.chat\.completions\.create/);
});
