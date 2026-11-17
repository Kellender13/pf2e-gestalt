import { processDualBuild, processDualGrants, preparedDual, installDualWarningFilter } from './pathmuncher-dual.mjs';
import { MODULE_ID, EXTRA_CLASSES_FLAG, PARAGON_SECTION, SECTION_PREFIX } from './constants.mjs';
import { moduleEnabled, ancestryParagonEnabled, skillParagonEnabled } from './settings.mjs';
import { getExtraClassIds } from './util.mjs';
import { syncSecondaryClassFeatures } from './features.mjs';
import { syncSkillParagon } from './skill-paragon.mjs';
import { variantImportRunning } from './import-state.mjs';

const installed=new WeakSet();
const normalize=s=>String(s??'').trim().toLowerCase();
const identity=i=>i.flags?.[MODULE_ID]?.paragonGrant?.uuid??i.flags?.[MODULE_ID]?.relicGift?.uuid??i._stats?.compendiumSource??i.sourceId;
export const pathmuncherStatus={installed:false,version:null,reason:'Pathmuncher is not active.'};
export function protectedImportItems(actor) {
  const extras=new Set(getExtraClassIds(actor));
  const keep=new Set(actor.items.filter(i=>{
    const flags=i.flags?.[MODULE_ID];
    return extras.has(i.id)||flags?.paragonSource||flags?.paragonGrant||flags?.relic||flags?.relicGift;
  }).map(i=>i.id));
  // Keep descendants of protected items, including saved class/subclass choices.
  let changed=true;
  while(changed){changed=false;for(const item of actor.items.values()) {
    if(keep.has(item.id))continue;
    if(keep.has(item.system?.location)||keep.has(item.flags?.pf2e?.grantedBy?.id)) {keep.add(item.id);changed=true;}
  }}
  return actor.items.filter(i=>keep.has(i.id));
}
/** Rewrite references when an import would create a second copy of a preserved item. */
export function preserveImportResult(pm,items) {
  const replacements=new Map();
  for(const [key,list]of Object.entries(pm.result)) {
    if(!Array.isArray(list))continue;
    pm.result[key]=list.filter(data=>{
      const same=items.find(i=>i.type===data.type && (identity(i)&&identity(i)===identity(data) || i.name===data.name));
      if(!same)return true;
      if(data._id)replacements.set(data._id,same.id);return false;
    });
  }
  const rewrite=value=>{
    if(typeof value==='string')return replacements.get(value)??value;
    if(Array.isArray(value))return value.map(rewrite);
    if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rewrite(v)]));
    return value;
  };
  pm.result=rewrite(pm.result);
  return replacements;
}
/** Use Pathmuncher's parsed provenance, never a feat's name alone, to identify its class slot. */
export function repairImportedSlots(pm,secondarySlug) {
  const used=new Set();
  const parsed=pm.parsed?.feats??[];
  for(const feat of pm.result.feats??[]) {
    const entry=parsed.find(e=>(e.addedId??e.itemId)===feat._id);
    if(!entry||entry.isChild)continue;
    const level=Number(entry.level);if(!Number.isInteger(level)||level<1)continue;
    const category=feat.system?.category;
    if(ancestryParagonEnabled()&&category==='ancestry'&&entry.type==='Ancestry Feat') {
      const standard=`ancestry-${level}`;
      // Extra feats granted by ancestry features retain their grant relationship.
      if(feat.flags?.pf2e?.grantedBy)continue;
      if(level%2===1) {
        const target=used.has(standard)&&level===1?`${PARAGON_SECTION}-1`:standard;
        if(!used.has(target)){feat.system.location=target;feat.system.level??={};feat.system.level.taken=level;used.add(target);}
      }
    }
    if(secondarySlug&&category==='class'&&(entry.type===`${pm.source.dualClass} Feat` || String(entry.featChoiceRef??'').startsWith(`${pm.source.dualClass} Feat `))) {
      feat.system.location=`${SECTION_PREFIX.CLASS}-${secondarySlug}-${level}`;
      feat.system.level??={};feat.system.level.taken=level;
    }
  }
}
async function secondaryPlan(pm) {
  if(!moduleEnabled()||!pm.options.addClass)return null;
  const extras=getExtraClassIds(pm.actor).map(id=>pm.actor.items.get(id)).filter(Boolean);
  if(extras.length>1)throw Error('Pathmuncher bridge supports standard Dual Class only.');
  const name=pm.source.dualClass;
  if(extras.length && name && normalize(extras[0].name)!==normalize(name))throw Error('The imported second class differs from the existing one. Remove or retrain the old second class explicitly before importing.');
  if(extras.length && normalize(extras[0].name)===normalize(pm.source.class))throw Error('This import swaps the primary and second class. Match the existing class order before importing.');
  if(extras.length)return {existing:extras[0],slug:extras[0].slug??extras[0].system.slug};
  if(!name)return null;
  const pack=game.packs.get('pf2e.classes');
  if(!pack)throw Error('PF2e Classes compendium is unavailable. Import stopped before modifying the actor.');
  const index=await pack.getIndex({fields:['type','system.slug']});
  const match=Array.from(index).filter(e=>normalize(e.name)===normalize(name)&&e.type==='class');
  if(match.length!==1)throw Error(`Could not uniquely resolve second class ${name}. Add that class manually before importing.`);
  const original=await pack.getDocument(match[0]._id);
  const data=original.toObject();delete data._id;
  data._stats={...data._stats,compendiumSource:original.uuid,duplicateSource:null};
  return {data,slug:data.system.slug??normalize(name).replaceAll(' ','-')};
}
export async function runProtectedImport(pm,original,args={}) {
  const actor=pm.actor;
  if(variantImportRunning(actor))throw Error('An import is already running for this actor.');
  if(!pm.processed)throw Error('Pathmuncher has not finished processing this build.');
  const plan=await secondaryPlan(pm);
  const processedDual=preparedDual(pm);
  const protectedItems=protectedImportItems(actor);
  const keepItemIds=[...new Set([...(args.keepItemIds??pm.findHandAddedItems().map(i=>i.id)),...protectedItems.map(i=>i.id)])];
  // Keeping an old primary while importing its replacement would violate the two-class limit.
  if(pm.options.addClass && actor.itemTypes.class.some(c=>keepItemIds.includes(c.id)&&!getExtraClassIds(actor).includes(c.id))) {
    throw Error('Uncheck the old primary class in Pathmuncher’s items-to-keep list before replacing it. Your second class is protected automatically.');
  }
  const remapped=preserveImportResult(pm,protectedItems);
  const processedSecondaryId=processedDual ? remapped.get(processedDual.secondary._id)??processedDual.secondary._id : null;
  repairImportedSlots(pm,plan?.slug);
  await actor.setFlag(MODULE_ID,'pathmuncherImport',{started:Date.now(),userId:game.user.id});
  let complete=false;
  try {
    const result=await original.call(pm,{...args,keepItemIds});
    let secondary=plan?.existing;
    if(processedSecondaryId && pm.options.addClass) {
      secondary=actor.items.get(processedSecondaryId);
      if(!secondary)throw Error('The processed second class was not created. Restore the import backup and report this error.');
    } else if(plan?.data) {
      const data=plan.data,grants=data.system.items;data.system.items={};
      // Avoid duplicate feature grants at creation; reconcile the full table below.
      const created=await actor.createEmbeddedDocuments('Item',[data]);
      secondary=created.find(i=>i.type==='class');
      if(!secondary)throw Error('Second class creation was cancelled. The primary import completed; restore its backup or add the second class manually.');
      await secondary.update({'system.items':grants});
    }
    if(secondary) {
      await actor.setFlag(MODULE_ID,EXTRA_CLASSES_FLAG,[secondary.id]);
      await syncSecondaryClassFeatures(actor);
    }
    complete=true;return result;
  } finally {
    await actor.unsetFlag(MODULE_ID,'pathmuncherImport');
    // Reconcile only after the importer has restored rules and locations. Leave new
    // unanswered choices to an explicit Skill Paragon Sync, not an import/reload loop.
    if(complete && skillParagonEnabled())await syncSkillParagon(actor,{interactive:false});
  }
}
export function installPathmuncherBridge() {
  const module=game.modules.get('pathmuncher');
  pathmuncherStatus.version=module?.version??null;
  if(!module?.active)return false;
  if(game.settings.get(MODULE_ID,'pathmuncherBridge')!==true){pathmuncherStatus.reason='Compatibility setting is off.';return false;}
  const PM=module.api?.Pathmuncher;
  if(!PM){pathmuncherStatus.reason='Waiting for Pathmuncher API.';return false;}
  if(installed.has(PM))return true;
  // Public API plus keepItemIds contract source-reviewed at 2.0.1. Do not guess at older writers.
  if(module.version!=='2.0.1'||typeof PM.prototype.updateActor!=='function'||typeof PM.prototype.findHandAddedItems!=='function'||typeof PM.prototype.processCharacter!=='function'||typeof PM.prototype.addGrantedItems!=='function') {
    pathmuncherStatus.reason=`Pathmuncher ${module.version} is not supported by this release (2.0.1 required).`;
    ui.notifications.warn(pathmuncherStatus.reason);return false;
  }
  if(!installDualWarningFilter()){pathmuncherStatus.reason='Could not register scoped dual-class warning override.';return false;}
  const process=PM.prototype.processCharacter,grants=PM.prototype.addGrantedItems;
  PM.prototype.processCharacter=async function(...args) {
    if(game.settings.get(MODULE_ID,'pathmuncherBridge')!==true||!moduleEnabled()||!this.source?.dualClass)return process.apply(this,args);
    if(!this.options.addClass)throw Error('Enable class import in Pathmuncher when importing a dual-class build.');
    const plan=await secondaryPlan(this);
    return processDualBuild(this,process,plan);
  };
  PM.prototype.addGrantedItems=async function(document,options={}) {return processDualGrants(this,grants,document,options);};
  const original=PM.prototype.updateActor;
  PM.prototype.updateActor=async function(args={}) {
    if(game.settings.get(MODULE_ID,'pathmuncherBridge')!==true||this.actor?.type!=='character')return original.call(this,args);
    return runProtectedImport(this,original,args);
  };
  installed.add(PM);pathmuncherStatus.installed=true;pathmuncherStatus.reason='Installed for Pathmuncher 2.0.1.';return true;
}
export function registerPathmuncherHooks() {
  // Pathmuncher registers its API asynchronously at ready. Installing when its
  // importer renders also covers load-order differences without polling.
  Hooks.once('ready',()=>setTimeout(installPathmuncherBridge,0));
  Hooks.on('renderPathmuncherImporter',installPathmuncherBridge);
}
