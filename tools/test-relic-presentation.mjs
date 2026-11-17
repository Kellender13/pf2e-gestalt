import test from 'node:test';
import assert from 'node:assert/strict';
import { relicPresentationUpdate } from '../scripts/relic-presentation.mjs';
const ID='pf2e-gestalt';
const config={aspects:['Forge','Dragon'],gifts:[{uuid:'gift1',name:'Creative Spark',tier:'Minor',aspect:'Forge'}]};
const item=()=>({system:{traits:{value:['magical']},description:{value:'<p>Original sword lore.</p>'}},flags:{}});
function apply(i,u){i.system.description.value=u['system.description.value'];i.system.traits.value=u['system.traits.value'];i.flags[ID]={relicPresentation:u[`flags.${ID}.relicPresentation`]};}
test('adds trait and one description section while retaining original lore',()=>{
 const i=item(),u=relicPresentationUpdate(i,config);
 assert.deepEqual(u['system.traits.value'],['magical','relic']);assert.ok(u['system.description.value'].startsWith(i.system.description.value));
 assert.match(u['system.description.value'],/Forge, Dragon/);assert.match(u['system.description.value'],/Creative Spark/);
});
test('repeated saves are idempotent and existing duplicate blocks collapse to one',()=>{
 const i=item(),first=relicPresentationUpdate(i,config);apply(i,first);
 assert.deepEqual(relicPresentationUpdate(i,config),first);
 i.system.description.value+=i.system.description.value.slice('<p>Original sword lore.</p>'.length);
 assert.equal(relicPresentationUpdate(i,config)['system.description.value'],first['system.description.value']);
});
test('gift and aspect edits replace old managed content without touching prose',()=>{
 const i=item();apply(i,relicPresentationUpdate(i,config));
 const u=relicPresentationUpdate(i,{aspects:['Dragon'],gifts:[]});
 assert.doesNotMatch(u['system.description.value'],/Creative Spark|Forge/);assert.match(u['system.description.value'],/Original sword lore/);
});
test('removing setup removes added trait and section, retaining other traits and text',()=>{
 const i=item(),original=i.system.description.value;apply(i,relicPresentationUpdate(i,config));
 const u=relicPresentationUpdate(i,null);assert.equal(u['system.description.value'],original);assert.deepEqual(u['system.traits.value'],['magical']);
 assert.equal(u[`flags.${ID}.-=relic`],null);
});
test('preexisting relic trait is preserved when removing only module additions',()=>{
 const i=item();i.system.traits.value.push('relic');apply(i,relicPresentationUpdate(i,config));
 assert.deepEqual(relicPresentationUpdate(i,null)['system.traits.value'],['magical','relic']);
});
test('empty initial setup is a relic and user strings cannot inject markup',()=>{
 const i=item();const u=relicPresentationUpdate(i,{aspects:['<script>'],gifts:[]});assert.match(u['system.description.value'],/&lt;script&gt;/);
 assert.ok(relicPresentationUpdate(i,{aspects:[],gifts:[]})['system.traits.value'].includes('relic'));
});
test('Wyrm apostrophe remains literal and raw source description is used over prepared display',()=>{
 const i=item();i._source={system:{traits:{value:['magical']},description:{value:'<p>True item lore.</p>'}}};i.system.description.value='<p>Unidentified display.</p>';
 const u=relicPresentationUpdate(i,{aspects:['Dragon'],gifts:[{uuid:'wyrm',name:"Wyrm's Flight",tier:'Major',aspect:'Dragon'}]});
 assert.match(u['system.description.value'],/Wyrm's Flight/);assert.doesNotMatch(u['system.description.value'],/&#39;|Unidentified/);assert.match(u['system.description.value'],/True item lore/);
});
