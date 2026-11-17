import test from 'node:test';
import assert from 'node:assert/strict';
import {CORE_SKILLS,paragonRank,paragonIncreases,eligibility,candidateFor,skillPrerequisite} from '../scripts/paragon-rules.mjs';
import {setRuntimeReady,ancestryParagonEnabled,skillParagonEnabled,moduleEnabled} from '../scripts/settings.mjs';
import {effectSource,syncSkillParagon,paragonReport,paragonBudget} from '../scripts/skill-paragon.mjs';
import {registerLadders} from '../scripts/ladders.mjs';
const settings={moduleEnabled:false,ancestryParagon:false,skillParagon:true};
const feat=(id,pre=['trained in Medicine'],level=1,extra={})=>({_id:id,name:id,type:'feat',system:{level:{value:level},prerequisites:{value:pre.map(value=>({value}))},traits:{value:['general','skill'],rarity:'common'},...extra}});
const entries=[feat('Battle Medicine'),feat('Ward Medic',['expert in Medicine'],2),feat('Religious Medic',['trained in Medicine','you follow a deity']), feat('Specialty Crafting',['trained in Crafting'],1,{rules:[{key:'ChoiceSet',flag:'specialtyCrafting'}]}), feat('Followup Crafting',['trained in Crafting','Specialty Crafting']), feat('Basic Craft',['trained in Crafting'])];
const uuid=f=>`Compendium.pf2e.feats-srd.Item.${f._id}`;
globalThis.game={settings:{get:(_id,k)=>settings[k]},packs:new Map([['pf2e.feats-srd',{getIndex:async()=>entries}]]),i18n:{localize:s=>s,format:s=>s},pf2e:{settings:{campaign:{feats:{sections:[]}}},system:{sluggify:s=>s.toLowerCase()}}};
globalThis.fromUuid=async u=>({toObject:()=>JSON.parse(JSON.stringify(entries.find(f=>uuid(f)===u)))});
globalThis.CONFIG={PF2E:{featTraits:{}}};
setRuntimeReady(true);
function actor(level=1){
 const items=new Map();const effect={...effectSource('medicine'),id:'effect'};items.set(effect.id,effect);
 const a={type:'character',isOwner:true,level,items,itemTypes:{feat:[],class:[]},system:{skills:Object.fromEntries(CORE_SKILLS.map(s=>[s,{rank:s==='medicine'?paragonRank(level):0}])),abilities:{int:{mod:0}}},getFlag:()=>undefined};
 a.createEmbeddedDocuments=async(_type,data)=>data.map(d=>{const i={...d,id:`item-${items.size}`,sourceId:d._stats.compendiumSource};items.set(i.id,i);a.itemTypes.feat.push(i);return i;});
 a.deleteEmbeddedDocuments=async(_type,ids)=>{for(const id of ids)items.delete(id);a.itemTypes.feat=a.itemTypes.feat.filter(i=>!ids.includes(i.id));};
 return a;
}
test('rank progression and bonus increases at boundaries',()=>{
 assert.deepEqual([1,2,3,6,7,14,15,20].map(paragonRank),[1,1,2,2,3,3,4,4]);
 assert.deepEqual([1,3,7,15].map(paragonIncreases),[0,1,2,3]);
});
test('settings independently enable variants without dual class',()=>{
 assert.equal(moduleEnabled(),false);assert.equal(skillParagonEnabled(),true);assert.equal(ancestryParagonEnabled(),false);
 settings.ancestryParagon=true;assert.equal(ancestryParagonEnabled(),true);settings.ancestryParagon=false;
});
test('candidate excludes non-general, uncommon, other-skill and generic Assurance feats',()=>{
 assert.equal(candidateFor(feat('A'),'medicine'),true);
 assert.equal(candidateFor(feat('A',['trained in Athletics']),'medicine'),false);
 assert.equal(candidateFor(feat('A',['trained in at least one skill']),'medicine'),false);
 assert.equal(candidateFor(feat('A',undefined,1,{traits:{rarity:'uncommon',value:['general','skill']}}),'medicine'),false);
 assert.equal(candidateFor(feat('A',undefined,1,{traits:{rarity:'common',value:['skill','archetype']}}),'medicine'),false);
});
test('OR and AND skill requirements retain their meanings',()=>{
 assert.deepEqual(skillPrerequisite('expert in Arcana, Nature, Occultism, or Religion').skills,['arcana','nature','occultism','religion']);
 const a=actor();a.system.skills.arcana.rank=2;
 assert.equal(eligibility(feat('A',['expert in Arcana or Nature']),a,'arcana',new Set()).state,'eligible');
 assert.equal(eligibility(feat('A',['expert in Arcana and Nature']),a,'arcana',new Set()).state,'future');
});
test('unknown Lore alternatives require review instead of being omitted',()=>{
 const f=feat('A',['trained in Alcohol Lore, Cooking Lore, or Crafting']);
 assert.equal(candidateFor(f,'crafting'),true);
 assert.equal(eligibility(f,actor(),'crafting',new Set()).state,'review');
});
test('level and rank restrictions remain enforced even with GM approval',()=>{
 assert.equal(eligibility(feat('A',undefined,5),actor(),'medicine',new Set(),true).state,'future');
 assert.equal(eligibility(feat('A',['expert in Medicine']),actor(),'medicine',new Set(),true).state,'future');
});
test('narrative prerequisites need explicit approval; attribute requirements are numeric',()=>{
 const a=actor();
 assert.equal(eligibility(entries[2],a,'medicine',new Set()).state,'review');
 assert.equal(eligibility(entries[2],a,'medicine',new Set(),true).state,'eligible');
 assert.equal(eligibility(feat('A',['trained in Medicine','Intelligence +1']),a,'medicine',new Set()).state,'future');
});
test('effect uses upgrade and replacement training, not stored skill mutation',()=>{
 const data=effectSource('medicine','nature');
 assert.equal(data.system.rules.length,2);assert.equal(data.system.rules[0].mode,'upgrade');
 assert.equal(data.system.rules[1].path,'system.skills.nature.rank');
 assert.equal(data.system.rules[1].value,1);assert.ok(data.system.rules.every(r=>r.predicate.length));
});
test('sync is idempotent, adds level-qualified feats, and removes only owned grants on level down',async()=>{
 const a=actor();await Promise.all([syncSkillParagon(a),syncSkillParagon(a)]);
 assert.equal(a.itemTypes.feat.length,1);await syncSkillParagon(a);assert.equal(a.itemTypes.feat.length,1);
 a.level=3;a.system.skills.medicine.rank=2;await syncSkillParagon(a);assert.equal(a.itemTypes.feat.length,2);
 a.level=1;a.system.skills.medicine.rank=1;await syncSkillParagon(a);assert.equal(a.itemTypes.feat.length,1);
 assert.equal((await paragonReport(a)).review.length,1);
});
test('preexisting feats are preserved and reported as replacement-benefit choices',async()=>{
 const a=actor();const existing={...entries[0],id:'original',sourceId:uuid(entries[0])};a.items.set(existing.id,existing);a.itemTypes.feat.push(existing);
 await syncSkillParagon(a);assert.equal(a.itemTypes.feat.length,1);assert.equal(a.itemTypes.feat[0],existing);
 assert.equal((await paragonReport(a)).duplicates.length,1);
 settings.skillParagon=false;await syncSkillParagon(a);assert.equal(a.itemTypes.feat[0],existing);settings.skillParagon=true;
});
test('disabling removes automatic feats but preserves configuration; reenabling restores them',async()=>{
 const a=actor();await syncSkillParagon(a);
 settings.skillParagon=false;await syncSkillParagon(a);assert.equal(a.itemTypes.feat.length,0);assert.ok(a.items.has('effect'));
 settings.skillParagon=true;await syncSkillParagon(a);assert.equal(a.itemTypes.feat.length,1);
 assert.deepEqual(paragonBudget(a),{training:1,increases:0});
});
test('Ancestry Paragon has 11 unique slots and restores the class getter with Dual Class off',()=>{
 const wraps=new Map();globalThis.libWrapper={register:(_id,k,f)=>wraps.set(k,f)};
 registerLadders();settings.ancestryParagon=true;
 const a=actor(20);a.items.delete('effect');
 const base={ancestry:[1,5,9,13,17],class:[1,2,4],skill:[2,4],general:[3]};
 a.class={};Object.defineProperty(a.class,'grantedFeatSlots',{get:()=>base,configurable:true});a.feats=new Map([['ancestry',{}]]);
 wraps.get('CONFIG.PF2E.Actor.documentClasses.character.prototype.prepareFeats').call(a,()=>{
   const slots=a.class.grantedFeatSlots.ancestry;
   assert.equal(slots.length,11);assert.equal(new Set(slots.map(s=>s.id)).size,11);
   assert.deepEqual(slots.map(s=>s.level),[1,1,3,5,7,9,11,13,15,17,19]);
   assert.equal(slots.find(s=>s.id==='dc-paragon-1').level,1);
 });
 assert.equal(a.class.grantedFeatSlots,base);settings.ancestryParagon=false;
});


function crafter() {
 const a=actor();a.items.get('effect').flags['pf2e-gestalt'].paragonSource.skill='crafting';
 a.system.skills.crafting.rank=1;return a;
}
const specialtyUuid='Compendium.pf2e.feats-srd.Item.Specialty Crafting';
test('background loading defers choices; explicit Sync persists them and repeated loads preserve them',async()=>{
 const a=crafter(),create=a.createEmbeddedDocuments;let prompts=0;
 a.createEmbeddedDocuments=async(type,data)=>{
   for (const d of data) if(d.system.rules?.[0]?.key==='ChoiceSet') {
     prompts++;d.system.rules[0].selection='blacksmithing';d.name='Specialty Crafting (Blacksmithing)';
     d.flags.pf2e={rulesSelections:{specialtyCrafting:'blacksmithing'}};
   }
   const result=await create(type,data);
   for(const i of result) if(i.flags['pf2e-gestalt']?.paragonGrant.uuid===specialtyUuid) {
     i.sourceId='Actor.test.Item.other';i._stats={duplicateSource:i.sourceId};
   }
   return result;
 };
 await syncSkillParagon(a);assert.equal(prompts,0);
 await syncSkillParagon(a,{interactive:true});assert.equal(prompts,1);
 const selected=a.itemTypes.feat.find(f=>f.flags['pf2e-gestalt'].paragonGrant.uuid===specialtyUuid);
 // Both the persistent marker and canonical name must work without matching core metadata.
 for(let i=0;i<3;i++)await syncSkillParagon(a);
 assert.equal(prompts,1);assert.equal(selected.system.rules[0].selection,'blacksmithing');
 assert.equal(a.itemTypes.feat.filter(f=>f.flags['pf2e-gestalt'].paragonGrant.uuid===specialtyUuid).length,1);
 assert.ok(a.itemTypes.feat.some(f=>f.name==='Followup Crafting'));
 assert.ok(a.items.has(selected.id));
});
test('preexisting choice feat is matched by compendium source even if duplicateSource wins sourceId',async()=>{
 const a=crafter();
 const existing={id:'existing',name:'Specialty Crafting (Woodworking)',type:'feat',sourceId:'Actor.original.Item.copy',_stats:{compendiumSource:specialtyUuid,duplicateSource:'Actor.original.Item.copy'},system:{rules:[{key:'ChoiceSet',selection:'woodworking'}]}};
 a.items.set(existing.id,existing);a.itemTypes.feat.push(existing);
 await syncSkillParagon(a,{interactive:true});
 assert.equal(a.itemTypes.feat.filter(f=>f.name.startsWith('Specialty Crafting')).length,1);
 assert.equal(existing.system.rules[0].selection,'woodworking');
 assert.ok((await paragonReport(a)).duplicates.some(f=>f.uuid===specialtyUuid));
});
test('a cancelled creation is attempted once per explicit sync, never retried by background loads',async()=>{
 const a=crafter(),create=a.createEmbeddedDocuments;let prompts=0;
 a.createEmbeddedDocuments=async(t,data)=>{
   if(data[0].system.rules?.[0]?.key==='ChoiceSet'){prompts++;return [];}
   return create(t,data);
 };
 await syncSkillParagon(a,{interactive:true});assert.equal(prompts,1);
 await syncSkillParagon(a);assert.equal(prompts,1);
 await syncSkillParagon(a,{interactive:true});assert.equal(prompts,2);
});
test('explicit sync queued behind background sync still processes a choice feat',async()=>{
 const a=crafter();
 await Promise.all([syncSkillParagon(a),syncSkillParagon(a,{interactive:true})]);
 assert.ok(a.itemTypes.feat.some(f=>f.flags['pf2e-gestalt'].paragonGrant.uuid===specialtyUuid));
});
function importedParagonActor(location=null) {
 const a=actor();
 const f={...JSON.parse(JSON.stringify(entries[0])),id:'imported',sourceId:uuid(entries[0]),flags:{pathmuncher:{imported:true},pf2e:{rulesSelections:{choice:'saved'}}}};
 f.system.location=location;a.items.set(f.id,f);a.itemTypes.feat.push(f);
 a.updateEmbeddedDocuments=async(_type,updates)=>{
  for(const u of updates){const item=a.items.get(u._id);if('system.location' in u)item.system.location=u['system.location'];item.flags['pf2e-gestalt']??={};
   if(u['flags.pf2e-gestalt.paragonPlacement'])item.flags['pf2e-gestalt'].paragonPlacement=u['flags.pf2e-gestalt.paragonPlacement'];
   if('flags.pf2e-gestalt.-=paragonPlacement' in u)delete item.flags['pf2e-gestalt'].paragonPlacement;
  }
 };return {a,f};
}
test('eligible imported bonus feat moves to Paragon without duplicates or changed choices',async()=>{
 const {a,f}=importedParagonActor();await syncSkillParagon(a);
 assert.equal(f.system.location,'gestalt-skill-paragon');assert.equal(a.itemTypes.feat.length,1);
 assert.equal(f.flags.pf2e.rulesSelections.choice,'saved');assert.equal(f.flags['pf2e-gestalt'].paragonGrant,undefined);
 await syncSkillParagon(a);assert.equal(a.itemTypes.feat.length,1);
});
test('slotted, granted, and manually added feats are not refiled',async()=>{
 for(const mode of ['slot','grant','manual']){
  const {a,f}=importedParagonActor(mode==='slot'?'skill-2':null);
  if(mode==='grant')f.flags.pf2e.grantedBy={id:'background'};
  if(mode==='manual')delete f.flags.pathmuncher;
  await syncSkillParagon(a);assert.equal(f.system.location,mode==='slot'?'skill-2':null);
 }
});
test('disabling Paragon restores imported bonus placement without deleting the feat',async()=>{
 const {a,f}=importedParagonActor();await syncSkillParagon(a);settings.skillParagon=false;
 try{await syncSkillParagon(a);assert.equal(f.system.location,null);assert.ok(a.items.has(f.id));assert.equal(f.flags['pf2e-gestalt'].paragonPlacement,undefined);}
 finally{settings.skillParagon=true;}
});
