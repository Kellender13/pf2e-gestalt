import { setSecondClassBoost } from '../scripts/boosts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { setRuntimeReady } from '../scripts/settings.mjs';
import { registerCoexistence, validateClassAdd } from '../scripts/coexist.mjs';
import { registerMerge } from '../scripts/merge.mjs';
import { syncSecondaryClassFeatures } from '../scripts/features.mjs';
const wrappers = new Map();
globalThis.libWrapper = { register: (_id, target, fn) => wrappers.set(target, fn) };
globalThis.game = { settings: { get: () => true }, i18n: { format: (s) => s, localize: (s) => s }, system: {version:'8.7.0'}, pf2e: {system:{sluggify: s => s.toLowerCase()}} };
globalThis.ui = { notifications: { warn(){}, info(){}, error(){} } };
setRuntimeReady(true);
registerCoexistence(); registerMerge();
const create = wrappers.get('CONFIG.Item.documentClass.createDocuments');
const del = wrappers.get('CONFIG.Actor.documentClass.prototype.deleteEmbeddedDocuments');
const merge = wrappers.get('CONFIG.PF2E.Item.documentClasses.class.prototype.prepareActorData');
function actor(id = 'a') {
  const first = { id:'fighter', type:'class', slug:'fighter', name:'Fighter', system: {hp:10, keyAbility:{value:['str','dex'], selected:'str'}} };
  const feat = {id:'feature',type:'feat',system:{location:'fighter'}};
  const flags = {};
  return {id,type:'character',level:5,class:first,itemTypes:{class:[first],feat:[feat]},items:new Map([[first.id,first],[feat.id,feat]]),
    getFlag:(_,key)=>flags[key],setFlag:async(_,key,value)=>{flags[key]=value;},
    system:{attributes:{},build:{attributes:{boosts:{}}},details:{keyability:{}},proficiencies:{classDCs:{fighter:{rank:1},wizard:{rank:1}}}}
  };
}
test('rejects third, duplicate, batch overflow and overlapping adds', () => {
  assert.ok(validateClassAdd([{slug:'fighter'},{slug:'wizard'}],[{system:{slug:'rogue'}}]));
  assert.ok(validateClassAdd([{slug:'fighter'}],[{system:{slug:'fighter'}}]));
  assert.ok(validateClassAdd([], [{name:'A'},{name:'B'},{name:'C'}]));
  assert.ok(validateClassAdd([], [{name:'A'}],true));
  assert.equal(validateClassAdd([{slug:'fighter'}],[{system:{slug:'wizard'}}]), null);
});
test('second class creation protects first class and features from purge', async () => {
  const a=actor(); let actuallyDeleted=[];
  const wizard={id:'wizard',type:'class',slug:'wizard'};
  await create(async()=>{
    await del.call(a,async(_type,ids)=>{actuallyDeleted=ids;},'Item',['fighter','feature','expired-effect']);
    a.items.set('wizard',wizard);a.itemTypes.class.push(wizard);return [wizard];
  },[{type:'class',system:{slug:'wizard'}}],{parent:a});
  assert.deepEqual(actuallyDeleted,['expired-effect']);
  assert.deepEqual(a.getFlag('', 'extraClasses'),['wizard']);
});
test('rejecting a third class never invokes destructive core creation', async()=>{
  const a=actor();a.itemTypes.class.push({id:'wizard',slug:'wizard'});
  let called=false;
  assert.deepEqual(await create(async()=>{called=true;},[{type:'class',name:'Rogue'}],{parent:a}),[]);
  assert.equal(called,false);
});
test('failed creation releases preservation state', async()=>{
  const a=actor();
  await assert.rejects(create(async()=>{throw Error('cancelled');},[{type:'class',name:'Wizard'}],{parent:a}));
  let ids;
  await del.call(a,async(_type,v)=>{ids=v;},'Item',['fighter']);
  assert.deepEqual(ids,['fighter']);
});
test('simultaneous adds to different actors preserve both independently', async()=>{
  const a=actor('a'),b=actor('b');let release;
  const gate=new Promise(r=>{release=r;});
  const first=create(async()=>{await gate;await del.call(a,()=>assert.fail('first actor lost protection'),'Item',['fighter']);return [];},[{type:'class',name:'Wizard'}],{parent:a});
  await create(async()=>{await del.call(b,()=>assert.fail('second actor lost protection'),'Item',['fighter']);return [];},[{type:'class',name:'Wizard'}],{parent:b});
  release();await first;
});
test('merge retains higher HP, both DC attributes, and both distinct key boosts',async()=>{
  const a=actor();const w={id:'wizard',type:'class',slug:'wizard',system:{hp:6,keyAbility:{value:['int'],selected:'int'}}};
  a.itemTypes.class.push(w);a.items.set(w.id,w);await a.setFlag('','extraClasses',['wizard']);
  merge.call({actor:a},()=>{});
  assert.equal(a.system.attributes.classhp,10);
  assert.deepEqual(a.system.build.attributes.boosts.class,['str','int']);
  assert.equal(a.system.proficiencies.classDCs.wizard.attribute,'int');
  assert.equal(a.system.proficiencies.classDCs.wizard.primary,false);
  w.system.keyAbility.selected='str';merge.call({actor:a},()=>{});
  assert.deepEqual(a.system.build.attributes.boosts.class,['str']);
});
test('simultaneous feature syncs create once; later sync is idempotent',async()=>{
  const a=actor();let count=0;
  const w={id:'wizard',type:'class',name:'Wizard',system:{items:{grant:{uuid:'Compendium.test.feature',level:5}}},createGrantedItems:async()=>[{sourceId:'Compendium.test.feature',toObject:()=>({sourceId:'Compendium.test.feature',category:'classfeature'})}]};
  a.items.set(w.id,w);a.itemTypes.class.push(w);await a.setFlag('','extraClasses',['wizard']);
  a.createEmbeddedDocuments=async(_type,data)=>{count++;a.itemTypes.feat.push(...data);return data;};
  await Promise.all([syncSecondaryClassFeatures(a),syncSecondaryClassFeatures(a)]);
  await syncSecondaryClassFeatures(a);
  assert.equal(count,1);
});

test('Rogue secondary adds odd skill-feat levels without doubling shared slots or hiding custom groups',async()=>{
  const {registerLadders}=await import('../scripts/ladders.mjs');registerLadders();
  const prepare=wrappers.get('CONFIG.PF2E.Actor.documentClasses.character.prototype.prepareFeats');
  const a=actor();a.itemTypes.feat=[];
  const base={ancestry:[1,5],class:[1,2,4],skill:[2,4],general:[3]};
  Object.defineProperty(a.class,'grantedFeatSlots',{get:()=>base,configurable:true});
  const r={id:'rogue',type:'class',name:'Rogue',slug:'rogue',grantedFeatSlots:{ancestry:[1,5],class:[1,2,4],skill:[1,2,3,4,5],general:[3]}};
  a.items.set(r.id,r);a.itemTypes.class.push(r);await a.setFlag('','extraClasses',['rogue']);
  globalThis.CONFIG={PF2E:{featTraits:{rogue:'Rogue'}}};
  const custom={id:'custom',supported:['class']};
  globalThis.game.pf2e.settings={campaign:{feats:{sections:[custom]}}};
  a.feats=new Map([['class',{}],['skill',{}]]);
  prepare.call(a,()=>{
    assert.deepEqual(a.class.grantedFeatSlots.skill,[1,2,3,4,5]);
    assert.deepEqual(a.class.grantedFeatSlots.general,[3]);
    assert.deepEqual(globalThis.game.pf2e.settings.campaign.feats.sections[1].slots,[1,2,4]);
    assert.equal(globalThis.game.pf2e.settings.campaign.feats.sections[0],custom);
  });
  assert.equal(a.class.grantedFeatSlots,base);
  assert.deepEqual(globalThis.game.pf2e.settings.campaign.feats.sections,[custom]);
  assert.throws(()=>prepare.call(a,()=>{throw Error('render failure');}));
  assert.equal(a.class.grantedFeatSlots,base);
  assert.deepEqual(globalThis.game.pf2e.settings.campaign.feats.sections,[custom]);
});

test('second-class boost selector changes only its allowed key attribute',async()=>{
  const a=actor();a.isOwner=true;
  const second={id:'wizard',name:'Wizard',type:'class',system:{keyAbility:{value:['int'],selected:null}},update:async change=>{second.system.keyAbility.selected=change['system.keyAbility.selected'];}};
  a.items.set(second.id,second);a.itemTypes.class.push(second);await a.setFlag('', 'extraClasses',[second.id]);
  await setSecondClassBoost(a,'int');assert.equal(second.system.keyAbility.selected,'int');assert.equal(a.class.system.keyAbility.selected,'str');
  await assert.rejects(setSecondClassBoost(a,'cha'),/allowed key attribute/);
  a.system.build.attributes.manual=true;await assert.rejects(setSecondClassBoost(a,'int'),/manual attribute scores/);
});
test('duplicate class boost applies a different attribute without changing either class DC key',async()=>{
  const a=actor();a.isOwner=true;
  const second={id:'barbarian',name:'Barbarian',slug:'barbarian',type:'class',system:{hp:12,keyAbility:{value:['str'],selected:'str'}}};
  a.items.set(second.id,second);a.itemTypes.class.push(second);await a.setFlag('', 'extraClasses',[second.id]);
  a.system.proficiencies.classDCs.barbarian={rank:1};
  await setSecondClassBoost(a,'wis');merge.call({actor:a},()=>{});
  assert.deepEqual(a.system.build.attributes.boosts.class,['str','wis']);
  assert.equal(second.system.keyAbility.selected,'str');assert.equal(a.system.proficiencies.classDCs.barbarian.attribute,'str');
  await assert.rejects(setSecondClassBoost(a,'str'),/different attribute/);
  second.system.keyAbility.selected='dex';merge.call({actor:a},()=>{});
  assert.deepEqual(a.system.build.attributes.boosts.class,['str','dex']);
});
