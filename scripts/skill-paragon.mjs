import { variantControls } from './sheet-controls.mjs';
import { variantImportRunning } from './import-state.mjs';
import { MODULE_ID } from './constants.mjs';
import { skillParagonEnabled } from './settings.mjs';
import { CORE_SKILLS, eligibility, normalize, paragonRank, paragonIncreases } from './paragon-rules.mjs';

export const PARAGON_GROUP = 'gestalt-skill-paragon';
const OPTION = 'pf2e-gestalt:skill-paragon';
const busy = new WeakMap();
const timers = new WeakMap();
let catalogPromise;
export function paragonSource(actor) {
  return Array.from(actor.items.values()).find(i => i.type === 'effect' && i.flags?.[MODULE_ID]?.paragonSource);
}
export function paragonConfig(actor) { return paragonSource(actor)?.flags?.[MODULE_ID]?.paragonSource ?? null; }
export function skillParagonSection(actor) {
  if (actor.type !== 'character' || !paragonConfig(actor)) return [];
  return [{id:PARAGON_GROUP,label:'Skill Paragon',supported:['skill','general'],filter:{traits:['skill']}}];
}
export function paragonBudget(actor) {
  return skillParagonEnabled() && paragonConfig(actor) ? {training:1,increases:paragonIncreases(actor.level)} : {training:0,increases:0};
}
function ownsWriter(actor) {
  if (!actor?.isOwner) return false;
  const gm=game.users.activeGM;
  if (gm) return gm.id === game.user.id;
  return game.users.filter(u=>u.active && actor.testUserPermission(u,'OWNER')).sort((a,b)=>a.id.localeCompare(b.id))[0]?.id === game.user.id;
}
async function catalog() {
  catalogPromise ??= (async()=>{
    const pack=game.packs.get('pf2e.feats-srd');
    if (!pack) throw Error('PF2e Feats compendium was not found.');
    return Array.from(await pack.getIndex({fields:['type','system.level.value','system.prerequisites.value','system.traits']}))
      .map(e=>({...e,uuid:`Compendium.pf2e.feats-srd.Item.${e._id}`}));
  })().catch(error=>{catalogPromise=null;throw error;});
  return catalogPromise;
}
export const itemIdentities = i => [...new Set([
  i.flags?.[MODULE_ID]?.paragonGrant?.uuid,
  i.sourceId, i._stats?.compendiumSource, i._stats?.duplicateSource
].filter(Boolean))];
const ownsFeat = (actor, uuid) => actor.itemTypes.feat.some(i=>itemIdentities(i).includes(uuid));
export const requiresInteractiveGrant = data => (data.system?.rules ?? []).some(r=>
  (r.key === 'ChoiceSet' && r.selection == null) || r.key === 'GrantItem'
);
const managed = i => !!i.flags?.[MODULE_ID]?.paragonGrant;
function knownNames(actor, entries) {
  const canonical=new Map(entries.map(e=>[e.uuid,normalize(e.name)]));
  return new Set(actor.itemTypes.feat.flatMap(f=>[
    normalize(f.name), ...itemIdentities(f).map(id=>canonical.get(id)).filter(Boolean)
  ]));
}
export async function paragonReport(actor) {
  const config=paragonConfig(actor);
  if (!config) return {eligible:[],review:[],duplicates:[],count:0};
  const entries=await catalog();
  const names=knownNames(actor,entries), owned=new Map(actor.itemTypes.feat.flatMap(f=>itemIdentities(f).map(id=>[id,f])));
  const result={eligible:[],review:[],duplicates:[],count:actor.itemTypes.feat.filter(i=>managed(i)||i.flags?.[MODULE_ID]?.paragonPlacement).length};
  for (const feat of entries) {
    const check=eligibility(feat,actor,config.skill,names,(config.approved ?? []).includes(feat.uuid));
    if (check.state === 'review') result.review.push({...feat,unknown:check.unknown});
    if (check.state !== 'eligible') continue;
    if (!owned.has(feat.uuid)) result.eligible.push(feat);
    else if (!managed(owned.get(feat.uuid)) && !owned.get(feat.uuid).flags?.[MODULE_ID]?.paragonPlacement) result.duplicates.push(feat);
  }
  return result;
}
/** Refile imported bonus feats without adopting their benefits as module grants. */
export async function repairImportedParagonFeats(actor) {
  const config=paragonConfig(actor),enabled=skillParagonEnabled()&&!!config;
  const entries=enabled?await catalog():[],byUuid=new Map(entries.map(e=>[e.uuid,e]));
  const names=knownNames(actor,entries),updates=[];
  for(const item of actor.itemTypes.feat) {
    if(managed(item))continue;
    const placement=item.flags?.[MODULE_ID]?.paragonPlacement,location=item.system.location;
    const source=itemIdentities(item).map(id=>byUuid.get(id)).find(Boolean);
    const qualifies=enabled && item.flags?.pathmuncher?.imported===true && !item.flags?.pf2e?.grantedBy && !!source &&
      eligibility(source,actor,config.skill,names,(config.approved??[]).includes(source.uuid)).state==='eligible';
    if(placement) {
      if(location!==PARAGON_GROUP || !qualifies)updates.push({_id:item.id,
        ...(location===PARAGON_GROUP?{'system.location':placement.originalLocation??null}:{}),
        [`flags.${MODULE_ID}.-=paragonPlacement`]:null});
    } else if((location==null||location===''||location==='bonus')&&qualifies) {
      updates.push({_id:item.id,'system.location':PARAGON_GROUP,
        [`flags.${MODULE_ID}.paragonPlacement`]:{originalLocation:location??null,skill:config.skill}});
    }
  }
  if(updates.length)await actor.updateEmbeddedDocuments('Item',updates);
  return updates.length;
}
/** Only module-owned feats are reconciled. Preexisting feats are never adopted or removed. */
export function syncSkillParagon(actor, {interactive=false} = {}) {
  if (busy.has(actor)) {
    const current=busy.get(actor);
    // A user's explicit Sync must not be swallowed by a background pass.
    return interactive ? current.then(()=>syncSkillParagon(actor,{interactive:true})) : current;
  }
  const promise=Promise.resolve().then(()=>reconcile(actor,interactive)).finally(()=>busy.delete(actor));
  busy.set(actor,promise);return promise;
}
async function reconcile(actor,interactive) {
  if (variantImportRunning(actor)) return;
  if (actor?.type !== 'character' || !actor.isOwner) return;
  await repairImportedParagonFeats(actor);
  const config=paragonConfig(actor);
  const grants=actor.itemTypes.feat.filter(managed);
  if (!skillParagonEnabled() || !config) {
    if (grants.length) await actor.deleteEmbeddedDocuments('Item',grants.map(i=>i.id));
    return;
  }
  const entries=await catalog(), byUuid=new Map(entries.map(e=>[e.uuid,e]));
  const names=knownNames(actor,entries), approvals=config.approved ?? [];
  const stale=grants.filter(item=>{
    const feat=byUuid.get(item.flags[MODULE_ID].paragonGrant.uuid);
    if (!feat) return false; // Never destroy data merely because a compendium is unavailable.
    return eligibility(feat,actor,config.skill,names,approvals.includes(feat.uuid)).state !== 'eligible';
  });
  if (stale.length) await actor.deleteEmbeddedDocuments('Item',stale.map(i=>i.id));
  // New feat prerequisites can be satisfied by feats granted earlier in the same reconciliation.
  const attempted=new Set();
  for (let pass=0;pass<8;pass++) {
    const report=await paragonReport(actor);
    if (!report.eligible.length) break;
    let createdCount=0;
    for (const feat of report.eligible) {
      if (attempted.has(feat.uuid) || ownsFeat(actor,feat.uuid)) continue;
      const original=await fromUuid(feat.uuid);
      if (!original) throw Error(`Missing feat: ${feat.name}`);
      const data=original.toObject();delete data._id;
      // Loading a world or changing unrelated data must never launch choice dialogs.
      if (!interactive && requiresInteractiveGrant(data)) continue;
      attempted.add(feat.uuid);
      data.system.location=PARAGON_GROUP;
      data.flags ??= {}; data.flags[MODULE_ID]={paragonGrant:{uuid:feat.uuid,skill:config.skill}};
      data._stats ??= {}; data._stats.compendiumSource=feat.uuid;
      data._stats.duplicateSource=null;
      const made=await actor.createEmbeddedDocuments('Item',[data]);
      createdCount+=made.length;
    }
    if (!createdCount) break;
  }
}
function schedule(actor) {
  if (variantImportRunning(actor)) return;
  if (actor?.type !== 'character' || !ownsWriter(actor)) return;
  if (!paragonConfig(actor) && !actor.itemTypes.feat.some(managed)) return;
  clearTimeout(timers.get(actor));
  timers.set(actor,setTimeout(()=>{
    syncSkillParagon(actor).catch(error=>{
      console.error(`${MODULE_ID} | Skill Paragon`,error);
      ui.notifications.error('Skill Paragon sync failed. Open F12 for the error, then retry Sync in Skill Paragon.');
    });
  },200));
}
export function registerParagonHooks() {
  Hooks.on('updateActor',actor=>schedule(actor));
  for (const hook of ['createItem','updateItem','deleteItem']) Hooks.on(hook,item=>schedule(item.actor));
  Hooks.once('ready',()=>{for (const actor of game.actors) schedule(actor);});
  for (const hook of ['renderActorSheetPF2e','renderCharacterSheetPF2e']) Hooks.on(hook,(sheet,element)=>{
    const actor=sheet.actor;
    if (actor?.type !== 'character' || !sheet.isEditable || (!skillParagonEnabled() && !paragonConfig(actor))) return;
    const root=element instanceof HTMLElement?element:element?.[0];
    if (!root || root.querySelector('.gestalt-paragon-button')) return;
    const controls=variantControls(root);
    if (!controls) return;
    const button=document.createElement('button');button.type='button';button.className='gestalt-paragon-button';
    const config=paragonConfig(actor);
    button.textContent=config?`Skill: ${game.i18n.localize(CONFIG.PF2E.skills[config.skill].label)}`:'Choose skill';
    button.title='Set up or manage Skill Paragon';
    button.addEventListener('click',()=>openSkillParagon(actor).catch(e=>{console.error(e);ui.notifications.error(e.message);}));
    controls.append(button);
  });
}
const escape = text => String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function options(skills) {return skills.map(s=>`<option value="${s}">${escape(game.i18n.localize(CONFIG.PF2E.skills[s].label))}</option>`).join('');}
export function effectSource(skill,replacement=null) {
  const rules=[{key:'ActiveEffectLike',mode:'upgrade',path:`system.skills.${skill}.rank`,value:'ternary(gte(@actor.level,15),4,ternary(gte(@actor.level,7),3,ternary(gte(@actor.level,3),2,1)))',predicate:[OPTION]}];
  if (replacement) rules.push({key:'ActiveEffectLike',mode:'upgrade',path:`system.skills.${replacement}.rank`,value:1,predicate:[OPTION]});
  return {name:`Skill Paragon: ${skill}`,type:'effect',img:'icons/sundries/books/book-open-brown.webp',
    flags:{[MODULE_ID]:{paragonSource:{skill,replacement,approved:[]}}},
    system:{description:{value:'<p>Skill Paragon progression managed by PF2e Gestalt. Use the Skill Paragon button to review feats or remove the variant from this character.</p>'},
      duration:{value:-1,unit:'unlimited',expiry:null,sustained:false},tokenIcon:{show:false},level:{value:1},rules}};
}
export async function openSkillParagon(actor) {
  if (!actor.isOwner) return;
  const source=paragonSource(actor);
  if (!source) {
    if (!skillParagonEnabled()) return;
    const skill=await foundry.applications.api.DialogV2.prompt({window:{title:'Choose a Skill Paragon skill'},
      content:`<p>Choose after assigning your normal starting skills. This skill progresses automatically; qualifying common general skill feats are added without spending normal feat slots.</p><select name="skill">${options(CORE_SKILLS)}</select>`,
      ok:{label:'Choose skill',callback:(_e,b)=>b.form.elements.skill.value},rejectClose:false});
    if (!CORE_SKILLS.includes(skill)) return;
    let replacement=null;
    if ((actor.system.skills[skill]?.rank ?? 0)>=1) {
      const available=CORE_SKILLS.filter(s=>(actor.system.skills[s]?.rank ?? 0)===0);
      if (!available.length) {ui.notifications.warn('All core skills are trained. Resolve the replacement training with your GM before setup; this module does not automate Lore selection.');return;}
      replacement=await foundry.applications.api.DialogV2.prompt({window:{title:'Replacement skill training'},
        content:`<p>Your chosen skill is already trained. Choose another untrained skill for the bonus training.</p><select name="skill">${options(available)}</select>`,
        ok:{label:'Apply Skill Paragon',callback:(_e,b)=>b.form.elements.skill.value},rejectClose:false});
      if (!available.includes(replacement)) return;
    }
    if (paragonSource(actor)) return;
    await actor.createEmbeddedDocuments('Item',[effectSource(skill,replacement)]);
    await syncSkillParagon(actor,{interactive:true});
    return openSkillParagon(actor);
  }
  const report=await paragonReport(actor),config=paragonConfig(actor);
  const list=items=>items.length?`<ul>${items.map(i=>`<li>${escape(i.name)}${i.unknown?`: ${escape(i.unknown.join('; '))}`:''}</li>`).join('')}</ul>`:'<p>None.</p>';
  const content=`<p><strong>${escape(config.skill)}</strong>: ${['','Trained','Expert','Master','Legendary'][paragonRank(actor.level)]} minimum. ${report.count} feats added by this module.</p>`
    +`<p>Ready to add: ${report.eligible.length}. Sync rechecks prerequisites and opens any required choice dialogs. Background updates leave those choices for you.</p>`
    +'<h3>Prerequisites needing review</h3>'+list(report.review)
    +'<h3>Already gained elsewhere</h3>'+list(report.duplicates)
    +'<p>For duplicate benefits, resolve Assurance in your chosen skill or a related Lore with your GM. Also compare Skill Paragon feat totals with your party for the published catch-up choice. These decisions are not chosen automatically.</p>';
  const buttons=[{action:'sync',label:'Sync feats',callback:async()=>{await syncSkillParagon(actor,{interactive:true});return openSkillParagon(actor);}},
    {action:'remove',label:'Remove Skill Paragon',callback:()=>removeSkillParagon(actor)}];
  if (game.user.isGM && config.approved?.length) buttons.unshift({action:'reset',label:'Reset GM approvals',callback:async()=>{
    await source.update({[`flags.${MODULE_ID}.paragonSource.approved`]:[]});
    await syncSkillParagon(actor,{interactive:true});return openSkillParagon(actor);
  }});
  if (game.user.isGM && report.review.length) buttons.unshift({action:'review',label:'Review prerequisites (GM)',callback:async()=>{
    const selected=await foundry.applications.api.DialogV2.prompt({window:{title:'Confirm prerequisites individually'},
      content:'<p>Check only feats whose listed unresolved prerequisites this character meets. Level and recognized skill/attribute prerequisites still apply. Recheck these approvals if the character retrains.</p>'+report.review.map(f=>`<label style="display:block"><input type="checkbox" name="approved" value="${escape(f.uuid)}"> ${escape(f.name)}: ${escape(f.unknown.join('; '))}</label>`).join(''),
      ok:{label:'Grant approved feats',callback:(_e,b)=>[...b.form.querySelectorAll('input:checked')].map(i=>i.value)},rejectClose:false});
    if (!Array.isArray(selected)) return;
    await source.update({[`flags.${MODULE_ID}.paragonSource.approved`]:[...new Set([...(config.approved ?? []),...selected])]});
    await syncSkillParagon(actor,{interactive:true});return openSkillParagon(actor);
  }});
  return foundry.applications.api.DialogV2.wait({window:{title:'Skill Paragon'},content,buttons,rejectClose:false});
}
export async function removeSkillParagon(actor) {
  if (!actor.isOwner) return;
  const yes=await foundry.applications.api.DialogV2.confirm({window:{title:'Remove Skill Paragon?'},content:'<p>Remove this module’s Skill Paragon effect and automatically added feats? Existing feats acquired elsewhere and manually selected replacement/catch-up benefits remain. Export the actor first if you want a restore point.</p>'});
  if (!yes) return;
  const ids=actor.items.filter(i=>managed(i)||i.flags?.[MODULE_ID]?.paragonSource).map(i=>i.id);
  await actor.deleteEmbeddedDocuments('Item',ids);
  await repairImportedParagonFeats(actor);
}
