import test from 'node:test';
import assert from 'node:assert/strict';
import { relicPermissions, chooseRelic, syncRelics, registerRelicHooks } from '../scripts/relics.mjs';
import { FORGE_SUPPLEMENTS, DEFAULT_SCHEDULE } from '../scripts/relic-rules.mjs';
import { setRuntimeReady } from '../scripts/settings.mjs';
const ID='pf2e-gestalt';
class Collection extends Map {
 filter(fn){return [...this.values()].filter(fn);}
 some(fn){return [...this.values()].some(fn);}
}
function fixture(permissions={}) {
 globalThis.game={user:{isGM:false},settings:{get:(_id,k)=>k==='relicGiftSchedule'?DEFAULT_SCHEDULE:true},packs:new Map()};
 globalThis.ui={notifications:{error:message=>assert.fail(message),info:()=>{}}};
 setRuntimeReady(true);
 const actor={type:'character',isOwner:true,level:1,items:new Collection()};
 const doc={id:'relic',isOwner:true,type:'weapon',actor,system:{description:{value:'Original lore'},traits:{value:[]},equipped:{carryType:'held',invested:null}},flags:{[ID]:{relic:{active:true,requireEquipped:true,maxAspects:2,planningLevel:20,aspects:['Forge'],gifts:[],playerChoices:permissions}}}};
 doc.update=async changes=>{for(const [path,value] of Object.entries(changes)){const keys=path.split('.');let obj=doc;for(const key of keys.slice(0,-1))obj=obj[key]??={};obj[keys.at(-1)]=value;}};
 actor.items.set(doc.id,doc);
 actor.deleteEmbeddedDocuments=async(_type,ids)=>{for(const id of ids)actor.items.delete(id);};
 actor.createEmbeddedDocuments=async(_type,items)=>items.map((item,n)=>{const created={...item,id:`gift${actor.items.size+n}`};actor.items.set(created.id,created);return created;});
 globalThis.fromUuid=async uuid=>({type:'action',system:{rules:[]},toObject:()=>({name:FORGE_SUPPLEMENTS.find(g=>g.uuid===uuid)?.name,type:'action',system:{rules:[],description:{value:''}}})});
 return {doc,actor,config:()=>doc.flags[ID].relic};
}
test('legacy relics default to no player choices; GM retains both controls',()=>{
 const {doc}=fixture();assert.deepEqual(relicPermissions(doc),{gm:false,aspects:false,gifts:false});
globalThis.game.user.isGM=true;assert.deepEqual(relicPermissions(doc),{gm:true,aspects:true,gifts:true});
});
test('player choices require item and character ownership outside compendiums',()=>{
 const {doc}=fixture({aspects:true,gifts:true});
 assert.equal(relicPermissions(doc).gifts,true);
 doc.isOwner=false;assert.equal(relicPermissions(doc).gifts,false);doc.isOwner=true;
 doc.actor.isOwner=false;assert.equal(relicPermissions(doc).gifts,false);doc.actor.isOwner=true;
 doc.pack='test';assert.equal(relicPermissions(doc).gifts,false);delete doc.pack;
 delete doc.actor;assert.equal(relicPermissions(doc).aspects,false);
});
test('aspect permission alone preserves GM configuration and does not allow gift changes',async()=>{
 const {doc,config}=fixture({aspects:true,gifts:false});
 await chooseRelic(doc,'aspects',[]);
 assert.deepEqual(config().aspects,[]);assert.equal(config().maxAspects,2);assert.equal(config().planningLevel,20);assert.equal(config().requireEquipped,true);assert.equal(config().playerChoices.aspects,true);
 await assert.rejects(chooseRelic(doc,'add',FORGE_SUPPLEMENTS[0].uuid),/not enabled/);
 await assert.rejects(chooseRelic(doc,'remove','any'),/not enabled/);
});
test('gift permission alone grants a canonical gift and preserves GM-selected aspects',async()=>{
 const {doc,actor,config}=fixture({gifts:true});
 await chooseRelic(doc,'add',FORGE_SUPPLEMENTS[0].uuid);
 assert.equal(config().gifts[0].name,'Creative Spark');assert.equal(actor.items.size,2);
 await assert.rejects(chooseRelic(doc,'aspects',[]),/not enabled/);
 await chooseRelic(doc,'remove',FORGE_SUPPLEMENTS[0].uuid);assert.equal(actor.items.size,1);assert.deepEqual(config().aspects,['Forge']);
});
test('player aspect selection rejects unknown aspects and excess selections',async()=>{
 const {doc,config}=fixture({aspects:true});config().maxAspects=1;config().aspects=['Forge','Dragon'];
 await assert.rejects(chooseRelic(doc,'aspects',['Forge','Dragon']),/limit/);
 await assert.rejects(chooseRelic(doc,'aspects',['Invented']),/valid aspects/);
});
test('player gifts enforce bearer level, slots, aspects, canonical IDs and duplicates',async()=>{
 const {doc,config}=fixture({gifts:true});
 await assert.rejects(chooseRelic(doc,'add',FORGE_SUPPLEMENTS[1].uuid),/unlocked slots/);
 await assert.rejects(chooseRelic(doc,'add','Actor.custom.Item.fake'),/unlocked slots/);
 config().aspects=[];await assert.rejects(chooseRelic(doc,'add',FORGE_SUPPLEMENTS[0].uuid),/unlocked slots/);
 config().aspects=['Forge'];await chooseRelic(doc,'add',FORGE_SUPPLEMENTS[0].uuid);
 await assert.rejects(chooseRelic(doc,'add',FORGE_SUPPLEMENTS[0].uuid),/unlocked slots/);
});
test('player sync only touches its permitted relic and rechecks revoked permissions',async()=>{
 const {doc,actor,config}=fixture({gifts:true});
 actor.items.set('other',{id:'other',flags:{[ID]:{relicGift:{key:'item-other',uuid:'missing'}}}});
 await syncRelics(actor,doc);assert.ok(actor.items.has('other'));
 assert.throws(()=>syncRelics(actor),/GM must sync/);
 const queued=syncRelics(actor,doc);config().playerChoices.gifts=false;
 await assert.rejects(queued,/permissions changed/);
 await assert.rejects(chooseRelic(doc,'add',FORGE_SUPPLEMENTS[0].uuid),/not enabled/);
});
test('player gift-only sheet renders selection but no GM or aspect-edit controls',async()=>{
 const {doc}=fixture({gifts:true});const callbacks=new Map();
 globalThis.Hooks={on:(name,fn)=>callbacks.set(name,fn)};
 globalThis.HTMLElement=class {};
 const control={addEventListener:()=>{}};
 const panel={isConnected:true,innerHTML:'',addEventListener:()=>{},querySelector:()=>control,querySelectorAll:()=>[]};
 globalThis.document={createElement:()=>panel};
 const root=new globalThis.HTMLElement();root.querySelector=selector=>selector.includes('details')?{querySelector:()=>null,prepend:()=>{}}:null;
 registerRelicHooks();await callbacks.get('renderItemSheetPF2e')({item:doc},root);
 assert.match(panel.innerHTML,/data-choice="add"/);assert.doesNotMatch(panel.innerHTML,/data-aspect|data-relic="limit"|player-aspects|data-relic="enabled"/);
});

async function renderFixture(doc) {
 const callbacks=new Map();globalThis.Hooks={on:(name,fn)=>callbacks.set(name,fn)};
 globalThis.HTMLElement=class {};
 const controls=new Map();
 const element=()=>({isConnected:false,innerHTML:'',addEventListener:()=>{},querySelector:selector=>{
  if(!controls.has(selector))controls.set(selector,{addEventListener:(type,fn)=>{controls.get(selector)[type]=fn;}});
  return controls.get(selector);
 },querySelectorAll:()=>[],append:()=>{},prepend:()=>{}});
 const nodes=[];globalThis.document={createElement:()=>{const node=element();nodes.push(node);return node;}};
 const tab={querySelector:()=>null,prepend:()=>{}},description={querySelector:()=>null,prepend:()=>{}};
 const root=new globalThis.HTMLElement();root.querySelector=selector=>selector.includes('description')?description:tab;
 registerRelicHooks();await callbacks.get('renderItemSheetPF2e')({item:doc,render:()=>{}},root);
 return {panel:nodes[0],nodes,controls};
}
test('detached player sheet renders choices and a description link without saving',async()=>{
 const {doc}=fixture({aspects:true,gifts:true});doc.update=()=>assert.fail('render must not save');
 const {panel,nodes}=await renderFixture(doc);
 assert.match(panel.innerHTML,/Save aspects/);assert.match(panel.innerHTML,/Add gift/);
 assert.equal(nodes[1].textContent,'Relic choices');
});
test('disabled permissions explain why player choices are unavailable',async()=>{
 const {doc}=fixture();const {panel}=await renderFixture(doc);
 assert.match(panel.innerHTML,/GM has not enabled/);assert.doesNotMatch(panel.innerHTML,/data-choice="add"/);
});
test('world item tells player to open the character inventory copy',async()=>{
 const {doc}=fixture({gifts:true});delete doc.actor;
 const {panel}=await renderFixture(doc);assert.match(panel.innerHTML,/character’s inventory/);
});
test('GM permission checkbox saves immediately without saving other unfinished settings',async()=>{
 const {doc,config}=fixture();globalThis.game.user.isGM=true;
 const {controls}=await renderFixture(doc);
 await controls.get('[data-relic="player-gifts"]').change({stopPropagation:()=>{},currentTarget:{checked:true}});
 assert.equal(config().playerChoices.gifts,true);assert.equal(config().maxAspects,2);assert.deepEqual(config().aspects,['Forge']);
});
