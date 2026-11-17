import test from 'node:test';
import assert from 'node:assert/strict';
const ID='pf2e-gestalt',hooks=new Map(),wrappers=new Map(),settings=new Map();
let rollback=false;
globalThis.Hooks={on:(name,fn)=>{const list=hooks.get(name)??[];list.push(fn);hooks.set(name,list);},once:(name,fn)=>globalThis.Hooks.on(name,fn)};
globalThis.game={system:{id:'pf2e',version:'8.7.0'},release:{generation:14},version:'14.369',user:{isGM:false},actors:[],
 modules:new Map([[ID,{}],['lib-wrapper',{active:true}]]),settings:{register:(_id,key,def)=>settings.set(key,def.default),get:(_id,key)=>settings.get(key)}};
globalThis.ui={notifications:{info:()=>{},warn:()=>{},error:message=>{throw Error(message);}}};
globalThis.libWrapper={register:(id,target,fn)=>{assert.equal(id,ID);if(wrappers.has(target))throw Error(`Duplicate registration: ${target}`);wrappers.set(target,fn);},unregister_all:()=>{rollback=true;wrappers.clear();}};
for(const version of ['8.7.0','8.7.1'])test(`PF2e ${version}: complete startup registers wrappers once and enables sheet hooks`,async()=>{
 hooks.clear();wrappers.clear();settings.clear();rollback=false;globalThis.game.system.version=version;
 await import(`../scripts/module.mjs?version=${version}`);
 for(const name of ['init','setup','ready'])for(const fn of [...(hooks.get(name)??[])])await fn();
 assert.equal(rollback,false);assert.equal(globalThis.game.modules.get(ID).api.diagnose().ready,true);
 assert.deepEqual(globalThis.game.modules.get(ID).api.diagnose().errors,[]);
 assert.ok(hooks.has('renderCharacterSheetPF2e'));
 assert.ok(hooks.has('renderItemSheetPF2e'));
 assert.ok(hooks.has('renderPathmuncherImporter'));
 assert.equal([...wrappers.keys()].filter(k=>k.endsWith('.prepareBaseData')).length,1);
});
test('shared actor preparation applies both variants independently and calls native preparation once',()=>{
 const wrapper=wrappers.get('CONFIG.PF2E.Actor.documentClasses.character.prototype.prepareBaseData');
 for(const skill of [false,true])for(const relic of [false,true]) {
  settings.set('skillParagon',skill);settings.set('relics',relic);
  const actor={rollOptions:{all:{}},items:new Map([['r',{id:'r',type:'weapon',system:{equipped:{carryType:'held',invested:null}},flags:{[ID]:{relic:{active:true,requireEquipped:true,gifts:[]}}}}]])};
  let calls=0;assert.equal(wrapper.call(actor,()=>{calls++;return 'native';}),'native');assert.equal(calls,1);
  assert.equal(!!actor.rollOptions.all[`${ID}:skill-paragon`],skill);
  assert.equal(!!actor.rollOptions.all[`${ID}:relic:item-r`],relic);
 }
});
