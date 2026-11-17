import test from 'node:test';
import assert from 'node:assert/strict';
import { processDualBuild, processDualGrants, preparedDual, chooseSecondaryKey, installDualWarningFilter } from '../scripts/pathmuncher-dual.mjs';
import { setRuntimeReady } from '../scripts/settings.mjs';
const settings={moduleEnabled:true,pathmuncherBridge:true};
globalThis.game={settings:{get:(_id,k)=>settings[k]},i18n:{localize:k=>k}};
globalThis.foundry={utils:{deepClone:v=>JSON.parse(JSON.stringify(v)),randomID:()=> 'secondaryNew'}};
setRuntimeReady(true);
const secondary=()=>({data:{name:'Wizard',type:'class',system:{keyAbility:{value:['int'],selected:null},items:{spellcasting:{uuid:'spellcasting',level:1},expert:{uuid:'expert',level:7}}}},slug:'wizard'});
function importer(){return {source:{class:'Fighter',dualClass:'Wizard',keyability:'str'},result:{class:[],character:{},feats:[]}};}
test('both class roots exist before native feature and choice evaluation',async()=>{
 const pm=importer(),order=[];
 const native=async function(doc){order.push(doc.name);assert.equal(this.result.class.length,2);assert.deepEqual(this.result.character.flags['pf2e-gestalt'].extraClasses,['secondaryNew']);};
 const result=await processDualBuild(pm,async function(){const primary={_id:'primary',name:'Fighter',type:'class'};this.result.class.push(primary);await processDualGrants(this,native,primary,{levelCap:1});return true;},secondary());
 assert.equal(result,true);assert.deepEqual(order,['Fighter','Wizard']);assert.equal(preparedDual(pm).secondary.system.keyAbility.selected,'int');
 assert.equal(preparedDual(pm).secondary.system.items.expert.level,7);
});
test('nested grants are not reinjected and ordinary imports call through unchanged',async()=>{
 const pm=importer();let calls=0;
 const native=async function(doc){calls++;if(doc.type==='class')await processDualGrants(this,native,{type:'feat'},{});};
 await processDualBuild(pm,async function(){const p={_id:'p',type:'class'};this.result.class.push(p);await processDualGrants(this,native,p,{});return true;},secondary());
 assert.equal(calls,4);assert.equal(pm.result.class.length,2);
 const plain=importer();await processDualGrants(plain,async()=>{calls++;},{type:'class'},{});assert.equal(plain.result.class.length,0);
});
test('cancelled or failed parsing never exposes a prepared dual import',async()=>{
 const pm=importer();assert.equal(await processDualBuild(pm,async()=>false,secondary()),false);assert.equal(preparedDual(pm),undefined);
 await assert.rejects(processDualBuild(pm,async()=>{throw Error('choice failure');},secondary()),/choice failure/);assert.equal(preparedDual(pm),undefined);
 await assert.rejects(processDualBuild(pm,async()=>true,secondary()),/expected class processing/);
});
test('warning override suppresses only the stale dual warning during supported parsing',async()=>{
 let wrapper;globalThis.libWrapper={register:(_id,target,fn)=>{assert.equal(target,'ui.notifications.warn');wrapper=fn;}};
 assert.equal(installDualWarningFilter(),true);
 const key='pathmuncher.Notifications.DualClass',seen=[];
 const notify=(message)=>wrapper(m=>seen.push(m),message);
 notify(key);
 await processDualBuild(importer(),async function(){
   notify(key);notify('Unmatched feat');settings.moduleEnabled=false;notify(key);settings.moduleEnabled=true;return false;
 },secondary());
 notify(key);assert.deepEqual(seen,[key,'Unmatched feat',key,key]);
});
test('second-class key boost uses an unambiguous exported boost without altering primary',async()=>{
 const pm=importer();pm.source.abilities={breakdown:{classBoosts:['Str','Dex']}};
 const key=await chooseSecondaryKey(pm,{system:{keyAbility:{value:['str','dex'],selected:null}}});assert.equal(key,'dex');assert.equal(pm.source.keyability,'str');
});
