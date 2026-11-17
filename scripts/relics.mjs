import { saveRelic } from './relic-presentation.mjs';
import { MODULE_ID } from './constants.mjs';
import { relicsEnabled } from './settings.mjs';
import { registerLibWrapper } from './util.mjs';
import { FORGE_SUPPLEMENTS, relicConfig, giftConfig, isPhysical, actorRelics, activeRelic, activeGift, giftIdentity, guidelineWarnings, giftSource, DEFAULT_SCHEDULE, allocateGifts, availableGifts, configuredEntries, activeEntries } from './relic-rules.mjs';

const busy=new WeakMap();
const giftSchedule=()=>game.settings.get(MODULE_ID,'relicGiftSchedule')??DEFAULT_SCHEDULE;
const defaultAspectLimit=()=>game.settings.get(MODULE_ID,'relicAspectLimit')??2;
const relicLevel=doc=>bearer(doc)?.level??relicConfig(doc)?.planningLevel??1;
function isGiftActive(actor,item) {
  try{return activeGift(actor,item,giftSchedule());}catch{return false;}
}
const escape=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reportError=e=>{console.error(`${MODULE_ID} | Relics`,e);ui.notifications.error(e.message);};
const bearer=doc=>doc.actor;
function canManage(doc) { return game.user.isGM && doc?.isOwner && isPhysical(doc) && !doc.pack; }
function requireManager(doc) { if (!canManage(doc)) throw Error('A GM must manage relics on an editable physical item outside a compendium.'); }

export async function relicCatalog() {
  const entries=[];
  const pack=game.packs.get('pf2e-relics.relic-gifts');
  if (pack) {
    const index=await pack.getIndex({fields:['type','folder']});
    for (const item of index) {
      let folder=pack.folders.get(item.folder),tier=null,aspect=null;
      const visited=new Set();
      while (folder && !visited.has(folder.id)) {
        visited.add(folder.id);
        const match=/^(Minor|Major|Grand) Gifts$/i.exec(folder.name);
        if (match) tier=match[1][0].toUpperCase()+match[1].slice(1).toLowerCase();
        else aspect=folder.name;
        folder=typeof folder.folder==='string'?pack.folders.get(folder.folder):folder.folder;
      }
      // Physical helper items are not independently granted gifts.
      if (item.type==='action' && tier && aspect) entries.push({name:item.name,aspect,tier,uuid:`Compendium.${pack.collection}.Item.${item._id}`});
    }
  }
  for (const supplement of FORGE_SUPPLEMENTS) if (!entries.some(e=>e.name.toLowerCase()===supplement.name.toLowerCase())) entries.push({...supplement,supplement:true});
  return entries.sort((a,b)=>a.aspect.localeCompare(b.aspect)||a.name.localeCompare(b.name));
}

/** Explicit, serialized reconciliation. No ready/update hook imports gifts or opens choices. */
export function relicPermissions(doc) {
  const editable=doc?.isOwner && isPhysical(doc) && !doc.pack;
  const config=relicConfig(doc);
  const gm=!!(editable && game.user.isGM);
  const player=!!(editable && doc.actor?.type==='character' && doc.actor.isOwner && config);
  return {gm,aspects:gm || (player && config.playerChoices?.aspects===true),gifts:gm || (player && config.playerChoices?.gifts===true)};
}
function requireChoice(doc,kind) {
  if(!relicsEnabled() || !relicPermissions(doc)[kind])throw Error('The GM has not enabled that relic choice for you.');
}
/** Player changes are constructed from current config; callers cannot replace GM settings. */
export async function chooseRelic(doc,action,value) {
  const kind=action==='aspects'?'aspects':'gifts';
  requireChoice(doc,kind);
  const entries=await relicCatalog();
  requireChoice(doc,kind); // Permissions may change while the catalog loads.
  const current=relicConfig(doc);
  if(!current)throw Error('This item is no longer a relic.');
  let next;
  if(action==='aspects') {
    const selected=[...new Set(value)];
    const known=new Set([...entries.map(e=>e.aspect),...current.aspects]);
    if(selected.length>(current.maxAspects??2)||selected.some(a=>!known.has(a)))throw Error('Choose valid aspects within the GM-set limit.');
    // A player clearing aspects must not remove the relic or its GM permissions.
    next={...current,aspects:selected};
  } else if(action==='remove') {
    next={...current,gifts:current.gifts.filter(g=>g.uuid!==value)};
  } else if(action==='add') {
    const entry=entries.find(e=>e.uuid===value),level=relicLevel(doc);
    if(!entry || current.gifts.some(g=>g.uuid===value) || !current.aspects.includes(entry.aspect) || !allocateGifts([...availableGifts(current,level,giftSchedule()),entry],level,giftSchedule()).active.includes(entry))throw Error('This gift does not fit the selected aspects and unlocked slots.');
    if(entry.name==='Elements of Creation'&&!availableGifts(current,level,giftSchedule()).some(g=>g.name==='Creative Spark'))throw Error('Add Creative Spark to this relic first.');
    next={...current,gifts:[...current.gifts,entry]};
  } else throw Error('Unknown relic choice.');
  await saveRelic(doc,next);
  if(doc.actor?.type==='character')await syncRelics(doc.actor,doc);
}

export function syncRelics(actor,onlyItem=null) {
  const permitted=()=>game.user.isGM || (onlyItem?.actor===actor && (relicPermissions(onlyItem).aspects || relicPermissions(onlyItem).gifts));
  if(!permitted() || actor?.type!=='character' || !actor.isOwner)throw Error('A GM must sync relic gifts, or enable choices on this owned relic.');
  const previous=busy.get(actor)??Promise.resolve();
  const next=previous.catch(()=>{}).then(()=>{if(!permitted())throw Error('Relic permissions changed.');return reconcile(actor,onlyItem);});
  busy.set(actor,next);
  return next.finally(()=>{if(busy.get(actor)===next)busy.delete(actor);});
}
async function reconcile(actor,onlyItem=null) {
  const relics=actorRelics(actor).filter(r=>!onlyItem || r.doc===onlyItem),desired=relics.flatMap(r=>configuredEntries(r.config).map(g=>({...g,key:r.key})));
  const stale=actor.items.filter(i=>giftConfig(i) && (!onlyItem || giftConfig(i).key===`item-${onlyItem.id}`) && !desired.some(g=>g.key===giftConfig(i).key && g.uuid===giftConfig(i).uuid));
  if (stale.length) await actor.deleteEmbeddedDocuments('Item',stale.map(i=>i.id));
  const result={added:0,existing:0,skipped:[]};
  if (!relicsEnabled()) return result;
  for (const entry of desired) {
    if (actor.items.some(i=>entry.tier==='Setup' ? giftConfig(i)?.key===entry.key && giftIdentity(i)===entry.uuid : giftIdentity(i)===entry.uuid || i.name===entry.name)) {result.existing++;continue;}
    const relic=relics.find(r=>r.key===entry.key);
    if (!activeEntries(relic.config,actor.level,giftSchedule()).some(g=>g.uuid===entry.uuid)) {result.skipped.push(`${entry.name}: gift locked by level, tier slots, or aspect selection`);continue;}
    if (!activeRelic(relic)) {result.skipped.push(`${entry.name}: relic inactive or not equipped/invested`);continue;}
    if(entry.tier!=='Setup' && ['Dragon','Emotion'].includes(entry.aspect)) {
      const helper=configuredEntries(relic.config).find(g=>g.tier==='Setup' && g.aspect===entry.aspect);
      if(!actor.items.some(i=>giftConfig(i)?.key===entry.key && giftConfig(i)?.uuid===helper.uuid)) {
        result.skipped.push(`${entry.name}: complete the aspect's origin choice first`);continue;
      }
    }
    const original=await fromUuid(entry.uuid);
    if (!original || original.type!=='action') {result.skipped.push(`${entry.name}: source action unavailable`);continue;}
    if (original.system.rules.some(r=>r.key==='GrantItem')) {result.skipped.push(`${entry.name}: nested grants require manual review`);continue;}
    const created=await actor.createEmbeddedDocuments('Item',[giftSource(original,entry,entry.key)]);
    if (created.length) result.added++; else result.skipped.push(`${entry.name}: creation cancelled; saved for the next explicit Sync`);
  }
  return result;
}

export function registerRelics() {
  const results=[
    registerLibWrapper('CONFIG.Item.documentClass.prototype.prepareRuleElements',function(wrapped,...args){
      if (giftConfig(this) && (!relicsEnabled() || !isGiftActive(this.actor,this))) return (this.rules=[]);
      return wrapped(...args);
    },'MIXED'),
    registerLibWrapper('CONFIG.Item.documentClass.prototype.toMessage',function(wrapped,...args){
      if (giftConfig(this) && (!relicsEnabled() || !isGiftActive(this.actor,this))) {
        ui.notifications.warn('This relic gift is inactive. Check its relic, equipment/investment, and assigned gifts.');return;
      }
      return wrapped(...args);
    },'MIXED')
  ];
  return results.every(Boolean);
}

async function syncNotice(actor) {
  const result=await syncRelics(actor);
  ui.notifications.info(`Relics: ${result.added} added; ${result.existing} already present.`);
  if (result.skipped.length) await foundry.applications.api.DialogV2.prompt({window:{title:'Relic gifts needing attention'},content:`<ul>${result.skipped.map(s=>`<li>${escape(s)}</li>`).join('')}</ul>`,ok:{label:'Close'},rejectClose:false});
}
export async function openRelics(doc) {
  const permissions=relicPermissions(doc);
  if(!permissions.gm&&!permissions.aspects&&!permissions.gifts)requireManager(doc);
  doc.sheet.render(true);
}
export function registerRelicHooks() {
  // Deleting/transferring a relic cleans only its managed bearer actions. No imports or choices.
  Hooks.on('deleteItem',async(item,_options,userId)=>{
    const actor=item.actor;
    if(!relicConfig(item)||actor?.type!=='character'||!actor.isOwner||game.user.id!==userId)return;
    const key=`item-${item.id}`;
    const ids=actor.items.filter(i=>giftConfig(i)?.key===key).map(i=>i.id);
    if(ids.length)await actor.deleteEmbeddedDocuments('Item',ids).catch(reportError);
  });
  Hooks.on('renderItemSheetPF2e',(sheet,element)=>renderRelicDetails(sheet,element).catch(reportError));
}

async function renderRelicDetails(sheet,element) {
  const doc=sheet.item;
  const permissions=relicPermissions(doc);
  if(!isPhysical(doc)||!doc.isOwner||doc.pack||(!permissions.gm&&!relicConfig(doc))||(!relicsEnabled()&&!relicConfig(doc)))return;
  const root=element instanceof HTMLElement?element:element?.[0];
  const tab=root?.querySelector('.tab[data-tab="details"]');
  if(!tab||tab.querySelector('.gestalt-relic-details'))return;
  const panel=document.createElement('section');panel.className='gestalt-relic-details';tab.prepend(panel);
  const config=relicConfig(doc);
  if(!permissions.gm){
    panel.innerHTML='<strong>Relic choices</strong><p>Loading relic options…</p>';
    const description=root.querySelector('.tab[data-tab="description"]');
    if(description&&!description.querySelector('.gestalt-relic-link')) {
      const link=document.createElement('button');link.type='button';link.className='gestalt-relic-link';link.textContent='Relic choices';
      link.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();root.querySelector('.tabs [data-tab="details"]')?.click();});
      description.prepend(link);
    }
    try{await renderPlayerChoices(doc,sheet,panel);}catch(error){panel.innerHTML='<strong>Relic choices</strong><p>Unable to load relic gifts. Ask the GM to check player access to the PF2e Relics gift compendium, then reopen this item.</p>';throw error;}
    return;
  }
  panel.innerHTML=`<label><input type="checkbox" data-relic="enabled" ${config?'checked':''}> <strong>Relic</strong></label>`;
  const run=fn=>async event=>{event.preventDefault();event.stopPropagation();try{await fn();}catch(e){reportError(e);sheet.render(false);}};
  panel.querySelector('[data-relic="enabled"]').addEventListener('change',run(async()=>{
    if(config){await saveRelic(doc,null);if(bearer(doc)?.type==='character')await syncRelics(bearer(doc));}
    else await saveRelic(doc,{name:doc.name,active:true,requireEquipped:true,maxAspects:defaultAspectLimit(),planningLevel:1,aspects:[],gifts:[]});
    sheet.render(false);
  }));
  if(!config)return;
  const entries=await relicCatalog();
  const aspects=[...new Set([...entries.map(e=>e.aspect),...config.aspects])].sort();
  const level=relicLevel(doc);
  const choices=entries.filter(e=>config.aspects.includes(e.aspect)&&!config.gifts.some(g=>g.uuid===e.uuid)&&allocateGifts([...availableGifts(config,level,giftSchedule()),e],level,giftSchedule()).active.includes(e));
  const body=document.createElement('div');
  body.innerHTML=`<p>Gift unlocks: ${escape(giftSchedule())}. ${bearer(doc)?'Bearer':'Planning'} level: ${level}.</p>`+
    `<label>Maximum aspects <input data-relic="limit" type="number" min="1" max="20" value="${config.maxAspects??2}"></label>`+
    (!bearer(doc)?`<label>Planning level <input data-relic="level" type="number" min="1" max="20" value="${level}"></label>`:'')+
    `<label><input data-relic="active" type="checkbox" ${config.active?'checked':''}> Active</label>`+
    `<label><input data-relic="equipped" type="checkbox" ${config.requireEquipped?'checked':''}> Require equipped / invested</label>`+
    `<fieldset><legend>Player choices (GM only)</legend><label><input data-relic="player-aspects" type="checkbox" ${config.playerChoices?.aspects?'checked':''}> Allow owning players to choose aspects</label><label><input data-relic="player-gifts" type="checkbox" ${config.playerChoices?.gifts?'checked':''}> Allow owning players to choose gifts</label></fieldset>`+
    '<fieldset><legend>Aspects (shared gift allowance)</legend>'+aspects.map(a=>`<label class="gestalt-relic-aspect"><input data-relic="aspect" type="checkbox" value="${escape(a)}" ${config.aspects.includes(a)?'checked':''}> ${escape(a)}</label>`).join('')+'</fieldset>'+
    '<button type="button" data-relic="save">Save relic settings</button>'+
    '<ul>'+config.gifts.map((g,index)=>`<li>${escape(g.name)} — ${escape(g.tier)} / ${escape(g.aspect)} <button type="button" data-remove="${index}">Remove</button></li>`).join('')+'</ul>'+
    guidelineWarnings(config,level,giftSchedule()).map(w=>`<p>${escape(w)}</p>`).join('')+
    (choices.length?'<select data-relic="gift">'+choices.map(e=>`<option value="${escape(e.uuid)}">${escape(e.aspect)} · ${escape(e.tier)} · ${escape(e.name)}</option>`).join('')+'</select><button type="button" data-relic="preview">View gift</button><button type="button" data-relic="add">Add gift</button>':'<p>No additional gifts fit the selected aspects and unlocked slots.</p>')+
    (bearer(doc)?.type==='character'?'<button type="button" data-relic="sync">Sync gifts</button>':'')+
    '<p>Changes update the Relic trait and the managed description section. Uncheck Relic to remove its setup.</p>';
  panel.append(body);
  body.addEventListener('change',event=>event.stopPropagation());
  for(const kind of ['aspects','gifts'])body.querySelector(`[data-relic="player-${kind}"]`).addEventListener('change',async event=>{
    event.stopPropagation();
    try {
      requireManager(doc);
      const current=relicConfig(doc);
      if(!current)throw Error('This item is no longer a relic.');
      await saveRelic(doc,{...current,playerChoices:{...current.playerChoices,[kind]:event.currentTarget.checked}});
      ui.notifications.info('Relic player permission saved.');
    } catch(error){reportError(error);sheet.render(false);}
  });
  body.querySelector('[data-relic="save"]').addEventListener('click',run(async()=>{
    const maxAspects=Number(body.querySelector('[data-relic="limit"]').value);
    const selected=[...body.querySelectorAll('[data-relic="aspect"]:checked')].map(e=>e.value);
    const planningLevel=Number(body.querySelector('[data-relic="level"]')?.value??config.planningLevel??1);
    if(!Number.isInteger(maxAspects)||maxAspects<1||maxAspects>20||selected.length>maxAspects)throw Error('Select no more than the aspect limit (1–20).');
    if(!Number.isInteger(planningLevel)||planningLevel<1||planningLevel>20)throw Error('Planning level must be 1–20.');
    // Removing the final selected aspect clears the relic. Initial checked setup may be empty.
    const next=config.aspects.length&&!selected.length?null:{...relicConfig(doc),playerChoices:{aspects:body.querySelector('[data-relic="player-aspects"]').checked,gifts:body.querySelector('[data-relic="player-gifts"]').checked},maxAspects,planningLevel,aspects:selected,active:body.querySelector('[data-relic="active"]').checked,requireEquipped:body.querySelector('[data-relic="equipped"]').checked};
    await saveRelic(doc,next);if(!next&&bearer(doc)?.type==='character')await syncRelics(bearer(doc));sheet.render(false);
  }));
  for(const button of body.querySelectorAll('[data-remove]'))button.addEventListener('click',run(async()=>{
    const uuid=config.gifts[Number(button.dataset.remove)].uuid,current=relicConfig(doc);
    await saveRelic(doc,{...current,gifts:current.gifts.filter(g=>g.uuid!==uuid)});
    if(bearer(doc)?.type==='character')await syncRelics(bearer(doc));sheet.render(false);
  }));
  body.querySelector('[data-relic="preview"]')?.addEventListener('click',run(async()=>{const original=await fromUuid(body.querySelector('[data-relic="gift"]').value);original?.sheet.render(true);}));
  body.querySelector('[data-relic="add"]')?.addEventListener('click',run(async()=>{
    const entry=choices.find(e=>e.uuid===body.querySelector('[data-relic="gift"]').value),current=relicConfig(doc);
    if(!current||!entry||current.gifts.some(g=>g.uuid===entry.uuid))return;
    if(!current.aspects.includes(entry.aspect)||!allocateGifts([...availableGifts(current,relicLevel(doc),giftSchedule()),entry],relicLevel(doc),giftSchedule()).active.includes(entry))throw Error('This gift no longer fits the relic. Reopen the item to refresh it.');
    if(entry.name==='Elements of Creation'&&!current.gifts.some(g=>g.name==='Creative Spark'))throw Error('Add Creative Spark to this relic first.');
    await saveRelic(doc,{...current,gifts:[...current.gifts,entry]});
    if(bearer(doc)?.type==='character')await syncRelics(bearer(doc));sheet.render(false);
  }));
  body.querySelector('[data-relic="sync"]')?.addEventListener('click',run(async()=>{
    await saveRelic(doc,relicConfig(doc));await syncNotice(bearer(doc));sheet.render(false);
  }));
}

/** Restricted player controls, separate from GM configuration; no writes during render. */
async function renderPlayerChoices(doc,sheet,panel) {
  const config=relicConfig(doc),permissions=relicPermissions(doc);
  if(!config)return;
  if(!relicsEnabled()){panel.innerHTML='<strong>Relic choices</strong><p>The Relic Manager is disabled. Ask the GM to enable it in module settings.</p>';return;}
  if(!permissions.aspects&&!permissions.gifts){
    panel.innerHTML='<strong>Relic choices</strong><p>'+(!doc.actor?'Open the relic from your character’s inventory to choose its aspects or gifts.':'The GM has not enabled player choices on this copy of the relic. Ask the GM to enable aspect and/or gift choices on this inventory item.')+'</p>';return;
  }
  const entries=await relicCatalog();
  const level=relicLevel(doc);
  const aspects=[...new Set([...entries.map(e=>e.aspect),...config.aspects])].sort();
  const choices=entries.filter(e=>config.aspects.includes(e.aspect)&&!config.gifts.some(g=>g.uuid===e.uuid)&&allocateGifts([...availableGifts(config,level,giftSchedule()),e],level,giftSchedule()).active.includes(e));
  panel.innerHTML='<strong>Relic choices</strong>'+(!entries.some(e=>!e.supplement)?'<p>If expected gifts are missing, ask the GM to grant players Observer access to the PF2e Relics gift compendium.</p>':'')+`<p>Bearer level: ${level}. Maximum aspects: ${config.maxAspects??2}. Gift unlocks: ${escape(giftSchedule())}.</p>`+
    (permissions.aspects?'<fieldset><legend>Choose aspects</legend>'+aspects.map(a=>`<label class="gestalt-relic-aspect"><input type="checkbox" data-aspect value="${escape(a)}" ${config.aspects.includes(a)?'checked':''}> ${escape(a)}</label>`).join('')+'</fieldset><button type="button" data-choice="aspects">Save aspects</button>':`<p>Aspects: ${config.aspects.map(escape).join(', ')||'Not selected by GM'}</p>`)+
    '<ul>'+config.gifts.map((g,n)=>`<li>${escape(g.name)} — ${escape(g.tier)} / ${escape(g.aspect)}${permissions.gifts?` <button type="button" data-remove="${n}">Remove</button>`:''}</li>`).join('')+'</ul>'+
    guidelineWarnings(config,level,giftSchedule()).map(w=>`<p>${escape(w)}</p>`).join('')+
    (permissions.gifts?(choices.length?'<select data-gift>'+choices.map(e=>`<option value="${escape(e.uuid)}">${escape(e.aspect)} · ${escape(e.tier)} · ${escape(e.name)}</option>`).join('')+'</select><button type="button" data-choice="add">Add gift</button>':'<p>No additional gifts fit the selected aspects and unlocked slots.</p>'):'')+
    '<button type="button" data-choice="sync">Sync this relic</button>';
  panel.addEventListener('change',event=>event.stopPropagation());
  const run=fn=>async event=>{event.preventDefault();event.stopPropagation();try{await fn();}catch(e){reportError(e);}sheet.render(false);};
  panel.querySelector('[data-choice="aspects"]')?.addEventListener('click',run(()=>chooseRelic(doc,'aspects',[...panel.querySelectorAll('[data-aspect]:checked')].map(e=>e.value))));
  panel.querySelector('[data-choice="add"]')?.addEventListener('click',run(()=>chooseRelic(doc,'add',panel.querySelector('[data-gift]').value)));
  for(const button of panel.querySelectorAll('[data-remove]'))button.addEventListener('click',run(()=>chooseRelic(doc,'remove',config.gifts[Number(button.dataset.remove)].uuid)));
  panel.querySelector('[data-choice="sync"]').addEventListener('click',run(async()=>{const result=await syncRelics(doc.actor,doc);ui.notifications.info(`Relic: ${result.added} added; ${result.existing} already present.${result.skipped.length?' Some gifts remain locked or unavailable.':''}`);}));
}
