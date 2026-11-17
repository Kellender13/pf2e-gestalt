import test from 'node:test';
import assert from 'node:assert/strict';
import { FORGE_SUPPLEMENTS, DEFAULT_SCHEDULE, parseSchedule, allocateGifts, availableGifts, activeGift, activeRelic, giftSource, giftConfig, relicOption } from '../scripts/relic-rules.mjs';
import { relicCatalog, openRelics, syncRelics, registerRelics, registerRelicHooks } from '../scripts/relics.mjs';
import { setRuntimeReady } from '../scripts/settings.mjs';
const ID='pf2e-gestalt';
const clone=x=>JSON.parse(JSON.stringify(x));
const settings={relics:true,relicGiftSchedule:DEFAULT_SCHEDULE,relicAspectLimit:2};
globalThis.game={user:{isGM:true},settings:{get:(_id,k)=>settings[k]},packs:new Map()};
globalThis.ui={notifications:{warn:()=>{},error:()=>{}}};
setRuntimeReady(true);
class Collection extends Map {
  filter(fn){return [...this.values()].filter(fn);}
  some(fn){return [...this.values()].some(fn);}
}
const grants=a=>a.items.filter(i=>giftConfig(i));
const gift=(name='Forge Weld',tier='Minor',aspect='Forge')=>({name,tier,aspect,uuid:`Compendium.test.gifts.Item.${name.replaceAll(' ','')}`});
const source=entry=>({type:'action',system:{rules:[]},toObject:()=>({name:entry.name,type:'action',_id:'old',_stats:{duplicateSource:'Actor.old.Item.old'},system:{rules:[{key:'FlatModifier',predicate:['original'],selector:'crafting',value:1}],description:{value:''}}})});
globalThis.fromUuid=async uuid=>source({name:uuid.split('.').at(-1)});
function actor(gifts=[gift()],level=5) {
  const a={type:'character',isOwner:true,level,items:new Collection(),flags:{[ID]:{relic:{active:true,aspects:['Forge','Dragon'],maxAspects:2,gifts:clone(gifts)}}},rollOptions:{all:{}}};
  const relic={id:'relicItem',type:'weapon',actor:a,system:{equipped:{carryType:'held',invested:null}},flags:{[ID]:{relic:a.flags[ID].relic}}};
  a.items.set(relic.id,relic);
  let serial=0;
  a.createEmbeddedDocuments=async(_type,entries)=>entries.map(data=>{
    const item={...clone(data),id:`grant${++serial}`,actor:a,sourceId:data._stats.compendiumSource};a.items.set(item.id,item);return item;
  });
  a.deleteEmbeddedDocuments=async(_type,ids)=>{for(const id of ids)a.items.delete(id);};
  return a;
}
function physical(a,gifts=[gift()]) {
  delete a.flags[ID].relic;
  const item={id:'relicItem',type:'weapon',isOwner:true,actor:a,system:{equipped:{carryType:'held',invested:null}},flags:{[ID]:{relic:{active:true,requireEquipped:true,maxAspects:2,aspects:['Forge','Dragon'],gifts:clone(gifts)}}}};
  a.items.set(item.id,item);return item;
}
test('default schedule unlocks one shared slot by level 3, two at 5, five at 17',()=>{
  assert.deepEqual([1,3,5,9,13,17].map(n=>allocateGifts([],n).remaining.length),[1,1,2,3,4,5]);
  const entries=[gift(),gift('Dragon Gift','Minor','Dragon')];
  assert.equal(allocateGifts(entries,3).active.length,1);
  assert.equal(allocateGifts(entries,5).active.length,2);
});
test('custom schedule supports delayed first gift and repeated levels but rejects invalid input',()=>{
  const schedule='3:minor,5:minor,5:major,15:grand';
  assert.equal(allocateGifts([],1,schedule).remaining.length,0);
  assert.equal(allocateGifts([],5,schedule).remaining.length,3);
  for(const invalid of ['', '1:legendary','0:minor','21:grand','3','1:minor,'])assert.throws(()=>parseSchedule(invalid));
});
test('major gifts cannot occupy minor slots; lower gifts can occupy major slots',()=>{
  assert.equal(allocateGifts([gift('Major','Major')],5).active.length,0);
  assert.equal(allocateGifts([gift(),gift('Second'),gift('Third')],9).active.length,3);
});
test('aspect limit restricts assignments and two aspects share one progression',()=>{
  const config={aspects:['Forge','Dragon','Fire'],maxAspects:2,gifts:[gift(),gift('Dragon','Minor','Dragon'),gift('Fire','Minor','Fire')]};
  assert.equal(availableGifts(config,17).length,2);
  config.maxAspects=1;assert.equal(availableGifts(config,17).length,1);
});
test('Forge supplements are available without external module; future upstream entries deduplicate',async()=>{
  assert.deepEqual((await relicCatalog()).map(e=>e.name).sort(),['Creative Spark','Elements of Creation']);
  const folders=new Map([['forge',{id:'forge',name:'Forge',folder:null}],['minor',{id:'minor',name:'Minor Gifts',folder:'forge'}]]);
  globalThis.game.packs.set('pf2e-relics.relic-gifts',{collection:'pf2e-relics.relic-gifts',folders,getIndex:async()=>[
    {_id:'upstream',name:'Creative Spark',type:'action',folder:'minor'},
    {_id:'helper',name:'Helper',type:'backpack',folder:'minor'}]});
  const catalog=await relicCatalog();assert.equal(catalog.length,2);assert.match(catalog.find(e=>e.name==='Creative Spark').uuid,/upstream$/);
  globalThis.game.packs.clear();
});
test('sync is idempotent, serialized, and preserves chosen options and daily uses',async()=>{
  const a=actor();await Promise.all([syncRelics(a),syncRelics(a)]);assert.equal(grants(a).length,1);
  const item=grants(a)[0];item.system.rules.push({key:'ChoiceSet',selection:'cold'});item.system.frequency={value:0,max:1,per:'day'};
  await syncRelics(a);assert.equal(grants(a).length,1);assert.equal(item.system.rules.at(-1).selection,'cold');assert.equal(item.system.frequency.value,0);
});
test('new actions keep canonical source, original predicates, and a relic predicate',()=>{
  const entry=gift(),data=giftSource(source(entry),entry,'soul');
  assert.equal(data._id,undefined);assert.equal(data._stats.duplicateSource,null);assert.equal(data._stats.compendiumSource,entry.uuid);
  assert.deepEqual(data.system.rules[0].predicate,['original',relicOption('soul')]);
});
test('preexisting actions are neither duplicated nor adopted or deleted',async()=>{
  const a=actor(),existing={id:'original',name:'Unrelated action',sourceId:gift().uuid};a.items.set(existing.id,existing);
  await syncRelics(a);assert.equal(a.items.size,2);assert.equal(giftConfig(existing),null);
  a.flags[ID].relic.gifts=[];await syncRelics(a);assert.equal(a.items.get('original'),existing);
});
test('gift removal deletes only matching managed actions',async()=>{
  const a=actor();a.items.set('other',{id:'other',name:'Other'});await syncRelics(a);
  a.flags[ID].relic.gifts=[];await syncRelics(a);assert.deepEqual([...a.items.keys()],['relicItem','other']);
});
test('unequipped and uninvested relics are inactive; explicit override supported',()=>{
  const a=actor(),item=physical(a),relic={doc:item,config:item.flags[ID].relic};
  assert.equal(activeRelic(relic),true);item.system.equipped.carryType='stowed';assert.equal(activeRelic(relic),false);
  item.system.equipped.carryType='worn';item.system.equipped.invested=false;assert.equal(activeRelic(relic),false);
  relic.config.requireEquipped=false;assert.equal(activeRelic(relic),true);
});
test('transferred relic leaves old gifts inactive, sync removes them and grants to new bearer',async()=>{
  const a=actor(),item=physical(a);await syncRelics(a);const action=a.items.filter(i=>giftConfig(i))[0];assert.ok(activeGift(a,action));
  a.items.delete(item.id);assert.equal(activeGift(a,action),false);await syncRelics(a);assert.equal(grants(a).length,0);
  const b=actor([]);b.items.set(item.id,{...item,actor:b});await syncRelics(b);assert.equal(b.items.filter(i=>giftConfig(i)).length,1);
});
test('level loss locks retained gifts without discarding choices, restored level reactivates them',async()=>{
  const a=actor([gift(),gift('Second')],5);await syncRelics(a);const second=a.items.filter(i=>giftConfig(i)?.name==='Second')[0];
  second.system.frequency={value:0};a.level=3;assert.equal(activeGift(a,second),false);
  await syncRelics(a);assert.equal(grants(a).length,2);a.level=5;assert.equal(activeGift(a,second),true);assert.equal(second.system.frequency.value,0);
});
test('future gifts on planned items are not imported early',async()=>{
  const a=actor([gift('Major','Major')],3);const result=await syncRelics(a);assert.equal(grants(a).length,0);assert.match(result.skipped[0],/locked/);
  a.level=9;await syncRelics(a);assert.equal(grants(a).length,1);
});
test('cancelled creation is attempted once per sync; no automatic ready hook retries',async()=>{
  const a=actor();let attempts=0;a.createEmbeddedDocuments=async()=>{attempts++;return [];};
  await syncRelics(a);assert.equal(attempts,1);
  const hooks=[];globalThis.Hooks={on:name=>hooks.push(name)};registerRelicHooks();assert.ok(hooks.every(h=>h==='renderItemSheetPF2e'||h==='deleteItem'));
});
test('Crafting supplements start toggles off and gate doubles and success improvements',()=>{
  const creative=giftSource(source(FORGE_SUPPLEMENTS[0]),FORGE_SUPPLEMENTS[0],'soul');
  const elements=giftSource(source(FORGE_SUPPLEMENTS[1]),FORGE_SUPPLEMENTS[1],'soul');
  assert.ok([...creative.system.rules,...elements.system.rules].filter(r=>r.key==='RollOption').every(r=>r.value===false));
  assert.ok(elements.system.rules.find(r=>r.key==='AdjustModifier').predicate.includes('forge-four-wisps'));
  assert.ok(elements.system.rules.find(r=>r.key==='AdjustDegreeOfSuccess').predicate.includes('forge-blacksmithing'));
  assert.ok(creative.system.rules.find(r=>r.key==='AdjustDegreeOfSuccess').predicate.some(p=>p.not==='forge-four-wisps'));
});
test('runtime suppresses rule preparation and activation for locked or disabled gifts',async()=>{
  const wrappers=new Map();globalThis.libWrapper={register:(_id,path,fn)=>wrappers.set(path,fn)};assert.equal(registerRelics(),true);
  const a=actor();await syncRelics(a);const item=grants(a)[0];
  const rules=wrappers.get('CONFIG.Item.documentClass.prototype.prepareRuleElements'),message=wrappers.get('CONFIG.Item.documentClass.prototype.toMessage');
  assert.deepEqual(rules.call(item,()=>['native']),['native']);
  settings.relics=false;assert.deepEqual(rules.call(item,()=>assert.fail()),[]);assert.equal(message.call(item,()=>assert.fail()),undefined);settings.relics=true;
  a.flags[ID].relic.active=false;assert.deepEqual(rules.call(item,()=>assert.fail()),[]);
});
test('non-GMs cannot grant relic gifts through the API',()=>{
  globalThis.game.user.isGM=false;assert.throws(()=>syncRelics(actor()),/GM/);globalThis.game.user.isGM=true;
});
test('Dragon origin helper precedes its gift, consumes no slot, and is not recreated',async()=>{
  const a=actor([gift('Breath of Dragons','Minor','Dragon')],3);
  const order=[],create=a.createEmbeddedDocuments;
  a.createEmbeddedDocuments=async(type,data)=>{order.push(data[0].flags[ID].relicGift.name);return create(type,data);};
  await syncRelics(a);assert.deepEqual(order,['Soul Seed Draconic Origin','Breath of Dragons']);assert.equal(grants(a).length,2);
  await syncRelics(a);assert.equal(grants(a).length,2);
});
test('Dragon actor flags and roll options are isolated per relic',()=>{
  const entry=gift('Origin','Setup','Dragon');
  const original={toObject:()=>({type:'action',system:{rules:[{key:'ChoiceSet',flag:'dragonRelic',actorFlag:true},{key:'RollOption',option:'dragon-relic-ancestor:{actor|flags.system.dragonRelic.dragon}'}],description:{value:'@actor.flags.pf2e.dragonRelic.damageType'}}})};
  const a=giftSource(original,entry,'item-a'),b=giftSource(original,entry,'item-b');
  assert.notEqual(a.system.rules[0].flag,b.system.rules[0].flag);
  assert.match(a.system.rules[0].flag,/^[-a-z0-9]+$/i);
  assert.match(a.system.rules[1].option,/relic:item-a:dragon-relic/);assert.match(a.system.description.value,/gestaltitemaDragon/);
});

test('relic setup rejects character documents; configuration is item-only',async()=>{
  await assert.rejects(openRelics(actor()),/physical item/);
});
