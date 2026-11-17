import { MODULE_ID } from './constants.mjs';

export const FORGE_SUPPLEMENTS = [
  {name:'Creative Spark',aspect:'Forge',tier:'Minor',uuid:'Compendium.pf2e.adventure-specific-actions.Item.bweyCSaXUjmcSTAO'},
  {name:'Elements of Creation',aspect:'Forge',tier:'Major',uuid:'Compendium.pf2e.adventure-specific-actions.Item.URZRO1ROM9VOS1nN'}
];
export const ASPECT_HELPERS = [
  {name:'Soul Seed Draconic Origin',aspect:'Dragon',tier:'Setup',uuid:'Compendium.pf2e-relics.relic-gifts.Item.GhTOIMebFJ9yMuwu'},
  {name:'Relic Emotion',aspect:'Emotion',tier:'Setup',uuid:'Compendium.pf2e-relics.relic-gifts.Item.tuQ9ddyY1nmwdQF5'}
];
export function configuredEntries(config) {
  const helpers=ASPECT_HELPERS.filter(h=>config.aspects?.includes(h.aspect) && config.gifts.some(g=>g.aspect===h.aspect));
  return [...helpers,...config.gifts];
}
export const relicConfig = doc => doc?.flags?.[MODULE_ID]?.relic ?? null;
export const giftConfig = doc => doc?.flags?.[MODULE_ID]?.relicGift ?? null;
export const relicKey = doc => `item-${doc.id}`;
export const relicOption = key => `${MODULE_ID}:relic:${key}`;
export const isPhysical = doc => ['weapon','armor','shield','equipment','backpack','consumable','treasure','ammo'].includes(doc?.type);
export function actorRelics(actor) {
  const result=[];
  for (const item of actor.items.values()) if (isPhysical(item) && relicConfig(item)) result.push({key:relicKey(item),doc:item,config:relicConfig(item)});
  return result;
}
export function activeRelic({doc,config}) {
  if (!config.active) return false;
  if (config.requireEquipped === false) return true;
  const equipped=doc.system?.equipped;
  return ['held','worn'].includes(equipped?.carryType) && equipped?.invested !== false;
}
export function activeGift(actor,gift,schedule=DEFAULT_SCHEDULE) {
  const config=giftConfig(gift);
  if (!actor || !config) return false;
  const relic=actorRelics(actor).find(r=>r.key===config.key);
  return !!relic && activeRelic(relic) && activeEntries(relic.config,actor.level,schedule).some(g=>g.uuid===config.uuid);
}
export const giftIdentity = item => giftConfig(item)?.uuid ?? item.sourceId ?? item._stats?.compendiumSource;
export const DEFAULT_SCHEDULE='1:minor,5:minor,9:major,13:major,17:grand';
const TIERS={Minor:1,Major:2,Grand:3};
export function parseSchedule(text=DEFAULT_SCHEDULE) {
  const slots=String(text).split(',').map(part=>{
    const match=/^\s*(\d+)\s*:\s*(minor|major|grand)\s*$/i.exec(part);
    if(!match || Number(match[1])<1 || Number(match[1])>20)throw Error('Relic gift schedule must use level:tier entries with levels 1–20 and tiers minor, major, or grand.');
    return {level:Number(match[1]),tier:match[2][0].toUpperCase()+match[2].slice(1).toLowerCase()};
  });
  return slots.sort((a,b)=>a.level-b.level||TIERS[a.tier]-TIERS[b.tier]);
}
export function allocateGifts(gifts,level,schedule=DEFAULT_SCHEDULE) {
  const slots=parseSchedule(schedule).filter(s=>s.level<=level).sort((a,b)=>TIERS[a.tier]-TIERS[b.tier]||a.level-b.level);
  const active=[],locked=[];
  // Prefer previously assigned gifts, so newly assigning a high tier never evicts an earlier gift.
  for(const gift of gifts) {
    const index=slots.findIndex(s=>TIERS[s.tier]>=TIERS[gift.tier]);
    if(index<0)locked.push(gift);else{slots.splice(index,1);active.push(gift);}
  }
  return {active,locked,remaining:slots};
}
export function availableGifts(config,level,schedule=DEFAULT_SCHEDULE) {
  const aspects=(config.aspects??[]).slice(0,config.maxAspects??2);
  const eligible=config.gifts.filter(g=>aspects.includes(g.aspect));
  const active=allocateGifts(eligible,level,schedule).active;
  return active.filter(g=>g.name!=='Elements of Creation'||active.some(other=>other.name==='Creative Spark'));
}
export function activeEntries(config,level,schedule=DEFAULT_SCHEDULE) {
  const active=availableGifts(config,level,schedule);
  return [...ASPECT_HELPERS.filter(h=>active.some(g=>g.aspect===h.aspect)),...active];
}
export function guidelineWarnings(config,level,schedule=DEFAULT_SCHEDULE) {
  const available=availableGifts(config,level,schedule),warnings=[];
  for(const gift of config.gifts)if(!available.includes(gift))warnings.push(`${gift.name} is locked: no unlocked slot of its tier, or its aspect is not selected.`);
  if(config.gifts.some(g=>g.name==='Elements of Creation') && !config.gifts.some(g=>g.name==='Creative Spark'))warnings.push('Elements of Creation requires Creative Spark on this relic.');
  return warnings;
}
/** Preserve source data and choice selections on existing gifts; called only for NEW imports. */
export function giftSource(original,entry,key) {
  let data=original.toObject();
  // The external compendium uses actor-level origin flags. Namespace those flags
  // and options per relic so two different relics do not overwrite one another.
  if(['Dragon','Emotion'].includes(entry.aspect)) {
    const flagKey=key.replace(/[^a-z0-9]/gi,'');
    const names={dragonRelic:`gestalt${flagKey}Dragon`,relicEmotion:`gestalt${flagKey}Emotion`};
    const walk=value=>{
      if(typeof value==='string')return value.replaceAll('dragonRelic',names.dragonRelic).replaceAll('relicEmotion',names.relicEmotion)
        .replaceAll('dragon-relic',`${relicOption(key)}:dragon-relic`).replaceAll('relic-emotin',`${relicOption(key)}:relic-emotion`);
      if(Array.isArray(value))return value.map(walk);
      if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,walk(v)]));
      return value;
    };
    data=walk(data);
  }
  delete data._id; delete data.folder; delete data.ownership;
  data._stats={...data._stats,compendiumSource:entry.uuid,duplicateSource:null};
  data.flags??={}; data.flags[MODULE_ID]={...data.flags[MODULE_ID],relicGift:{key,uuid:entry.uuid,name:entry.name}};
  const option=relicOption(key);
  data.system.rules??=[];
  // The native entries are available in PF2e itself; no copied compendium is shipped.
  // Scope their Crafting benefits to explicit player toggles, and avoid improving unrelated checks.
  if (entry.name==='Creative Spark') {
    data.system.slug='creative-spark';
    data.system.rules=[
      {key:'RollOption',domain:'all',option:'creative-spark',label:'Fire wisp assisting: metalworking check',toggleable:true,value:false},
      {key:'RollOption',domain:'all',option:'forge-blacksmithing',label:'Forge gift: this is a blacksmithing check',toggleable:true,value:false},
      {key:'RollOption',domain:'all',option:'forge-recovery',label:'Creative Spark: use daily critical-failure protection',toggleable:true,value:false},
      {key:'FlatModifier',selector:'crafting',slug:'creative-spark',value:'ternary(gte(@actor.level,17),3,ternary(gte(@actor.level,9),2,1))',predicate:['creative-spark']},
      {key:'AdjustDegreeOfSuccess',selector:'crafting',adjustment:{criticalFailure:'one-degree-better'},predicate:['creative-spark','forge-blacksmithing','forge-recovery',{not:'forge-four-wisps'}]}
    ];
    data.system.description.value+='<p><strong>Gestalt controls:</strong> Enable the fire-wisp toggle only for eligible metalworking checks. Enable blacksmithing and daily protection when appropriate; track that daily use yourself. Dismissal, fuel, duration, and wisp placement are manual.</p>';
  }
  if (entry.name==='Elements of Creation') {
    data.system.rules=[
      {key:'RollOption',domain:'all',option:'forge-four-wisps',label:'Elements of Creation: all four wisps assisting',toggleable:true,value:false,predicate:['creative-spark']},
      {key:'AdjustModifier',selector:'crafting',slug:'creative-spark',mode:'multiply',value:2,predicate:['creative-spark','forge-four-wisps']},
      {key:'AdjustDegreeOfSuccess',selector:'crafting',adjustment:{criticalFailure:'one-degree-better',failure:'one-degree-better',success:'one-degree-better'},predicate:['creative-spark','forge-four-wisps','forge-blacksmithing']}
    ];
    data.system.description.value+='<p><strong>Gestalt controls:</strong> Enable all-four-wisps assistance to double the Creative Spark modifier. The outcome improvement also requires the blacksmithing toggle. Disable these toggles after the relevant check or when assistance ends.</p>';
  }
  for (const rule of data.system.rules) if (rule.key!=='ChoiceSet') rule.predicate=[...(rule.predicate??[]),option];
  return data;
}
