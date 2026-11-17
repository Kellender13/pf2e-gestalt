import { processDualBuild, processDualGrants } from '../scripts/pathmuncher-dual.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { protectedImportItems, preserveImportResult, repairImportedSlots, runProtectedImport, installPathmuncherBridge } from '../scripts/pathmuncher.mjs';
import { variantImportRunning } from '../scripts/import-state.mjs';
import { setRuntimeReady } from '../scripts/settings.mjs';
const ID='pf2e-gestalt';
const settings={moduleEnabled:true,ancestryParagon:true,skillParagon:false,pathmuncherBridge:true};
globalThis.game={user:{id:'gm',isGM:true},settings:{get:(_id,k)=>settings[k]},packs:new Map(),modules:new Map()};
globalThis.ui={notifications:{warn:()=>{}}};
globalThis.libWrapper={register:()=>{}};setRuntimeReady(true);
class Collection extends Map {filter(fn){return [...this.values()].filter(fn);}some(fn){return [...this.values()].some(fn);}}
function actor(){
  const a={type:'character',isOwner:true,level:5,items:new Collection(),flags:{[ID]:{extraClasses:['second']}}};
  a.getFlag=(_id,k)=>a.flags[ID][k];a.setFlag=async(_id,k,v)=>{a.flags[ID][k]=v;};a.unsetFlag=async(_id,k)=>{delete a.flags[ID][k];};
  Object.defineProperty(a,'itemTypes',{get:()=>({class:a.items.filter(i=>i.type==='class'),feat:a.items.filter(i=>i.type==='feat')})});
  const data=[
    {id:'primary',type:'class',name:'Wizard',slug:'wizard',system:{items:{}}},
    {id:'second',type:'class',name:'Fighter',slug:'fighter',system:{items:{}}},
    {id:'secondaryFeature',type:'feat',name:'Bravery',system:{location:'second'},_stats:{compendiumSource:'Compendium.pf2e.features.Item.bravery'}},
    {id:'child',type:'action',name:'Child',flags:{pf2e:{grantedBy:{id:'secondaryFeature'}}}},
    {id:'paragon',type:'effect',name:'Skill Paragon',flags:{[ID]:{paragonSource:{skill:'crafting'}}}},
    {id:'relic',type:'weapon',name:'Relic sword',flags:{[ID]:{relic:{gifts:[]}}}},
    {id:'ordinary',type:'feat',name:'Ordinary',system:{}}
  ];for(const i of data)a.items.set(i.id,i);
  return a;
}
const pm=a=>({actor:a,processed:true,source:{class:'Wizard',dualClass:'Fighter'},options:{addClass:true},result:{character:{},class:[],feats:[]},parsed:{feats:[]},findHandAddedItems:()=>[]});
test('protects second class, its descendants, paragon source, and relic items',()=>{
  assert.deepEqual(protectedImportItems(actor()).map(i=>i.id),['second','secondaryFeature','child','paragon','relic']);
});
test('deduplicates protected imports and rewrites incoming grant references',()=>{
  const a=actor(),p=pm(a);p.result.feats=[{_id:'newBravery',name:'Bravery',type:'feat',_stats:{compendiumSource:'Compendium.pf2e.features.Item.bravery'}},{_id:'child2',name:'New',type:'feat',flags:{pf2e:{grantedBy:{id:'newBravery'}}}}];
  preserveImportResult(p,protectedImportItems(a));assert.equal(p.result.feats.length,1);assert.equal(p.result.feats[0].flags.pf2e.grantedBy.id,'secondaryFeature');
});
test('assigns duplicate level-one ancestry slot and second-class feat slot using import provenance',()=>{
  const p=pm(actor());
  p.result.feats=[{_id:'a1',system:{category:'ancestry'}},{_id:'a2',system:{category:'ancestry'}},{_id:'f',system:{category:'class'}}];
  p.parsed.feats=[{itemId:'a1',type:'Ancestry Feat',level:1},{itemId:'a2',type:'Ancestry Feat',level:1},{itemId:'f',type:'Fighter Feat',level:4}];
  repairImportedSlots(p,'fighter');assert.deepEqual(p.result.feats.map(f=>f.system.location),['ancestry-1','dc-paragon-1','dc-class-fighter-4']);
});
test('pauses background sync during import, preserves keep choices, and resumes afterward',async()=>{
  const a=actor(),p=pm(a);let called=0;
  await runProtectedImport(p,async function(args){called++;assert.equal(variantImportRunning(a),true);assert.ok(args.keepItemIds.includes('second'));assert.ok(args.keepItemIds.includes('ordinary'));},{keepItemIds:['ordinary']});
  assert.equal(called,1);assert.equal(variantImportRunning(a),false);assert.deepEqual(a.flags[ID].extraClasses,['second']);
});
test('clears the import pause after errors without pretending the import succeeded',async()=>{
  const a=actor();await assert.rejects(runProtectedImport(pm(a),async()=>{throw Error('write failed');}),/write failed/);assert.equal(variantImportRunning(a),false);
});
test('class mismatch and kept primary are rejected before actor mutation',async()=>{
  const a=actor(),p=pm(a);p.source.dualClass='Cleric';
  await assert.rejects(runProtectedImport(p,()=>assert.fail()),/differs/);
  p.source.dualClass='Fighter';await assert.rejects(runProtectedImport(p,()=>assert.fail(),{keepItemIds:['primary']}),/Uncheck/);assert.equal(variantImportRunning(a),false);
});
test('unprocessed and overlapping imports are rejected',async()=>{
  const a=actor(),p=pm(a);p.processed=false;await assert.rejects(runProtectedImport(p,()=>assert.fail()),/finished processing/);
  p.processed=true;a.flags[ID].pathmuncherImport={started:Date.now()};await assert.rejects(runProtectedImport(p,()=>assert.fail()),/already running/);
});
test('first dual import adds a core second class without immediate duplicate grants',async()=>{
  const a=actor();a.flags[ID].extraClasses=[];a.items.delete('second');const p=pm(a);
  globalThis.game.packs.set('pf2e.classes',{getIndex:async()=>[{_id:'fighter',name:'Fighter',type:'class'}],getDocument:async()=>({uuid:'Compendium.pf2e.classes.Item.fighter',toObject:()=>({_id:'fighter',name:'Fighter',type:'class',system:{slug:'fighter',items:{}}})})});
  a.createEmbeddedDocuments=async(_type,entries)=>entries.map(data=>{assert.deepEqual(data.system.items,{});const i={...data,id:'newSecond',slug:'fighter',update:async()=>{}};a.items.set(i.id,i);return i;});
  await runProtectedImport(p,async()=>{});assert.deepEqual(a.flags[ID].extraClasses,['newSecond']);assert.equal(a.itemTypes.class.length,2);
  globalThis.game.packs.clear();
});
test('API patch installs once and declines unknown versions',()=>{
  class PM{updateActor(){} processCharacter(){} addGrantedItems(){} findHandAddedItems(){return [];}}
  globalThis.game.modules.set('pathmuncher',{active:true,version:'1.0.0',api:{Pathmuncher:PM}});assert.equal(installPathmuncherBridge(),false);
  globalThis.game.modules.get('pathmuncher').version='2.0.1';assert.equal(installPathmuncherBridge(),true);const fn=PM.prototype.updateActor;assert.equal(installPathmuncherBridge(),true);assert.equal(PM.prototype.updateActor,fn);
});

test('processed dual root remaps to a preserved secondary class on reimport',async()=>{
  globalThis.foundry={utils:{deepClone:v=>JSON.parse(JSON.stringify(v)),randomID:()=> 'processedSecond'}};
  const a=actor(),p=pm(a);
  const plan={data:{name:'Fighter',type:'class',system:{keyAbility:{value:['str'],selected:'str'},items:{}}},slug:'fighter'};
  await processDualBuild(p,async function(){const first={_id:'newPrimary',name:'Wizard',type:'class'};this.result.class.push(first);await processDualGrants(this,async()=>{},first,{});return true;},plan);
  a.createEmbeddedDocuments=()=>assert.fail('must not recreate preserved secondary');
  await runProtectedImport(p,async function(){
    assert.deepEqual(this.result.class.map(c=>c.name),['Wizard']);
    assert.deepEqual(this.result.character.flags['pf2e-gestalt'].extraClasses,['second']);
  });
  assert.deepEqual(a.flags[ID].extraClasses,['second']);
});
