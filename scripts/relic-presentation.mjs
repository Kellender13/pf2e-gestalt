import { MODULE_ID } from './constants.mjs';
const escape=value=>String(value??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const block=/<div\b[^>]*class=["'][^"']*\bpf2e-gestalt-relic-summary\b[^"']*["'][^>]*>[\s\S]*?<\/div>/gi;
/** Only replace our own tagged block; never rewrite the original item description. */
export function relicPresentationUpdate(item,config) {
  const system=item._source?.system??item.system;
  const description=system.description?.value??'';
  const original=description.replace(block,'');
  const traits=[...(system.traits?.value??[])];
  const previous=item.flags?.[MODULE_ID]?.relicPresentation;
  const added=previous?.traitAdded===true || (config && !traits.includes('relic'));
  const nextTraits=config?[...new Set([...traits,'relic'])]:added?traits.filter(t=>t!=='relic'):traits;
  let summary='';
  if(config) {
    const aspects=[...new Set(config.aspects??[])];
    const gifts=[...new Map((config.gifts??[]).map(g=>[g.uuid,g])).values()];
    summary='<div class="pf2e-gestalt-relic-summary"><h3>Relic</h3>'+
      `<p><strong>Aspects:</strong> ${aspects.length?aspects.map(escape).join(', '):'None selected'}</p>`+
      '<p><strong>Gifts:</strong></p><ul>'+ (gifts.length?gifts.map(g=>`<li>${escape(g.name)} — ${escape(g.tier)} (${escape(g.aspect)})</li>`).join(''):'<li>None selected</li>')+'</ul></div>';
  }
  const update={'system.traits.value':nextTraits,'system.description.value':original+summary};
  if(config){update[`flags.${MODULE_ID}.relic`]=config;update[`flags.${MODULE_ID}.relicPresentation`]={traitAdded:!!added};}
  else{update[`flags.${MODULE_ID}.-=relic`]=null;update[`flags.${MODULE_ID}.-=relicPresentation`]=null;}
  return update;
}
export async function saveRelic(item,config) {return item.update(relicPresentationUpdate(item,config));}
