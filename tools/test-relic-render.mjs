import test from 'node:test';
import assert from 'node:assert/strict';
import { registerRelicHooks } from '../scripts/relics.mjs';
import { setRuntimeReady } from '../scripts/settings.mjs';
test('repeated sheet renders never save or rerender an item with normalized relic HTML',async()=>{
 const callbacks=new Map();globalThis.Hooks={on:(name,fn)=>callbacks.set(name,fn)};
 globalThis.game={user:{isGM:true},settings:{get:(_id,key)=>key==='relicGiftSchedule'?'1:minor,5:minor,9:major,13:major,17:grand':true},packs:new Map()};
 globalThis.ui={notifications:{error:message=>assert.fail(message)}};
 globalThis.HTMLElement=class {};
 globalThis.document={createElement:()=>({className:'',isConnected:false,innerHTML:'',querySelector:()=>({addEventListener:()=>{}}),querySelectorAll:()=>[],prepend:()=>{},append:()=>{},addEventListener:()=>{}})};
 const root=new globalThis.HTMLElement();root.querySelector=()=>({querySelector:()=>null,prepend:()=>{},append:()=>{}});
 const item={type:'weapon',isOwner:true,system:{traits:{value:['relic']},description:{value:'<div class="pf2e-gestalt-relic-summary"><p>Wyrm\'s Flight</p></div>\n'}},flags:{'pf2e-gestalt':{relic:{aspects:['Dragon'],gifts:[{name:"Wyrm's Flight"}],active:true}}},update:()=>assert.fail('render must never update a document')};
 const sheet={item,render:()=>assert.fail('render hook must not recursively render')};
 setRuntimeReady(true);registerRelicHooks();
 for(let n=0;n<20;n++)await callbacks.get('renderItemSheetPF2e')(sheet,root);
});
