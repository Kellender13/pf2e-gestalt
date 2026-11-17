import { MODULE_ID } from './constants.mjs';
import { skillParagonEnabled, relicsEnabled } from './settings.mjs';
import { actorRelics, activeRelic, relicOption } from './relic-rules.mjs';
import { registerLibWrapper } from './util.mjs';

/** libWrapper permits only one registration per package/target. Compose variants here. */
export function registerActorOptions() {
  return registerLibWrapper('CONFIG.PF2E.Actor.documentClasses.character.prototype.prepareBaseData',function(wrapped,...args){
    const result=wrapped(...args);
    if(skillParagonEnabled())this.rollOptions.all[`${MODULE_ID}:skill-paragon`]=true;
    if(relicsEnabled())for(const relic of actorRelics(this))if(activeRelic(relic))this.rollOptions.all[relicOption(relic.key)]=true;
    return result;
  },'WRAPPER');
}
