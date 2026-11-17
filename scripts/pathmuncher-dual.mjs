import { MODULE_ID, EXTRA_CLASSES_FLAG } from './constants.mjs';
import { moduleEnabled } from './settings.mjs';
import { registerLibWrapper } from './util.mjs';

const processing=new WeakMap();
const prepared=new WeakMap();
let running=0;
let warningWrapped=false;
export const dualProcessingActive=()=>running>0 && moduleEnabled() && game.settings.get(MODULE_ID,'pathmuncherBridge')===true;
export const preparedDual=pm=>prepared.get(pm);
const clone=value=>foundry.utils.deepClone(value);

export async function chooseSecondaryKey(pm,data) {
  const allowed=data.system.keyAbility.value;
  const selected=data.system.keyAbility.selected;
  if(allowed.includes(selected))return selected;
  if(allowed.length===1)return allowed[0];
  const boosts=(pm.source.abilities?.breakdown?.classBoosts??[]).map(a=>String(a).toLowerCase());
  const candidates=allowed.filter(a=>boosts.includes(a)&&a!==pm.source.keyability);
  if(candidates.length===1)return candidates[0];
  const labels={str:'Strength',dex:'Dexterity',con:'Constitution',int:'Intelligence',wis:'Wisdom',cha:'Charisma'};
  const choice=await foundry.applications.api.DialogV2.prompt({window:{title:'Imported second-class key attribute'},content:
    '<p>The export does not uniquely identify the second class’s key attribute. Select its class boost before processing the dual-class build.</p><select name="attribute">'+allowed.filter(a=>a in labels).map(a=>`<option value="${a}">${labels[a]}</option>`).join('')+'</select>',
    ok:{label:'Use attribute',callback:(_e,b)=>b.form.elements.attribute.value},rejectClose:false});
  return allowed.includes(choice)?choice:null;
}
/** Adds both roots BEFORE native ChoiceSet/GrantItem evaluation, not after actor writing. */
export async function processDualBuild(pm,original,plan) {
  prepared.delete(pm);
  const data=plan.data??plan.existing.toObject();
  const secondary=clone(data);
  secondary._id=foundry.utils.randomID();
  const selected=await chooseSecondaryKey(pm,secondary);
  if(!selected)return false;
  secondary.system.keyAbility.selected=selected;
  const state={secondary,primaryId:null,injected:false,slug:plan.slug};
  processing.set(pm,state);running++;
  try {
    const result=await original.call(pm);
    if(result===false)return false;
    if(!state.injected)throw Error('Pathmuncher did not reach the expected class processing step. Dual-class import stopped before writing.');
    prepared.set(pm,state);return result;
  } finally {processing.delete(pm);running--;}
}
export async function processDualGrants(pm,original,document,options) {
  const state=processing.get(pm);
  if(!state || state.injected || document.type!=='class')return original.call(pm,document,options);
  state.injected=true;state.primaryId=document._id;
  pm.result.class.push(state.secondary);
  pm.result.character.flags??={};
  pm.result.character.flags[MODULE_ID]={...pm.result.character.flags[MODULE_ID],[EXTRA_CLASSES_FLAG]:[state.secondary._id]};
  // Both roots now exist on Pathmuncher's temporary evaluation actor. Its later
  // level-by-level schedule already iterates every entry in result.class.
  await original.call(pm,document,options);
  return original.call(pm,state.secondary,options);
}
export function installDualWarningFilter() {
  if(warningWrapped)return true;
  warningWrapped=registerLibWrapper('ui.notifications.warn',function(wrapped,message,...args){
    if(dualProcessingActive() && message===game.i18n.localize('pathmuncher.Notifications.DualClass'))return;
    return wrapped(message,...args);
  },'MIXED');
  return warningWrapped;
}
