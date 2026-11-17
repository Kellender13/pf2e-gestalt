/** Pure rules helpers; unknown prerequisites never silently pass. */
export const CORE_SKILLS = ['acrobatics','arcana','athletics','crafting','deception','diplomacy','intimidation','medicine','nature','occultism','performance','religion','society','stealth','survival','thievery'];
export const RANKS = { trained: 1, expert: 2, master: 3, legendary: 4 };
export const paragonRank = (level) => level >= 15 ? 4 : level >= 7 ? 3 : level >= 3 ? 2 : 1;
export const paragonIncreases = (level) => [3,7,15].filter(l => level >= l).length;
export const normalize = (value) => String(value ?? '').toLowerCase().replace(/<[^>]*>/g,'').replace(/[^a-z0-9+ ]/g,' ').replace(/\s+/g,' ').trim();
export function skillPrerequisite(text) {
  const match = normalize(text).match(/^(trained|expert|master|legendary) (?:in|at) (.+)$/);
  if (!match) return null;
  const names = match[2].split(/\s+or\s+|\s+and\s+|\s*,\s*/);
  // Normalization removes commas: scan only known skill names and prove no residual words remain.
  const skills = CORE_SKILLS.filter(s => new RegExp(`\\b${s}\\b`).test(match[2]));
  const rest = skills.reduce((s,k)=>s.replace(new RegExp(`\\b${k}\\b`,'g'),''),match[2]).replace(/\b(or|and)\b/g,'').trim();
  if (rest || !skills.length) return null;
  return { rank:RANKS[match[1]], skills, all: /\band\b/.test(match[2]), names };
}
export function candidateFor(feat, skill) {
  const s=feat.system, traits=s?.traits;
  return feat.type === 'feat' && traits?.rarity === 'common'
    && traits.value.includes('general') && traits.value.includes('skill')
    && (s.prerequisites?.value ?? []).some(p => {
      const parsed=skillPrerequisite(p.value);
      return parsed?.skills.includes(skill) || new RegExp(`(?:trained|expert|master|legendary) (?:in|at) .*\\b${skill}\\b`).test(normalize(p.value));
    });
}
export function eligibility(feat, actor, skill, knownFeatNames, approved = false) {
  if (!candidateFor(feat,skill)) return {state:'excluded',unknown:[]};
  if (Number(feat.system.level.value) > actor.level) return {state:'future',unknown:[]};
  const unknown=[];
  for (const p of feat.system.prerequisites?.value ?? []) {
    const raw=normalize(p.value), parsed=skillPrerequisite(p.value);
    if (parsed) {
      const ranks=parsed.skills.map(s=>(actor.system.skills[s]?.rank ?? 0)>=parsed.rank);
      if (!(parsed.all?ranks.every(Boolean):ranks.some(Boolean))) return {state:'future',unknown:[]};
      continue;
    }
    const attr=raw.match(/^(strength|dexterity|constitution|intelligence|wisdom|charisma) \+(\d+)$/);
    if (attr) {
      const key={strength:'str',dexterity:'dex',constitution:'con',intelligence:'int',wisdom:'wis',charisma:'cha'}[attr[1]];
      if ((actor.system.abilities[key]?.mod ?? 0)<Number(attr[2])) return {state:'future',unknown:[]};
      continue;
    }
    if (knownFeatNames.has(raw)) continue;
    unknown.push(p.value);
  }
  return {state:unknown.length && !approved ? 'review':'eligible',unknown};
}
