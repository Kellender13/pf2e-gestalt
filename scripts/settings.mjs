import { MODULE_ID } from "./constants.mjs";
let runtimeReady = false;
export function setRuntimeReady(value) { runtimeReady = value; }
export function registerSettings() {
  game.settings.register(MODULE_ID, "moduleEnabled", {
    name: "Enable Dual Class", hint: "Allow two full classes. Test new class combinations on a copied character first.",
    scope: "world", config: true, type: Boolean, default: false, requiresReload: true
  });
  for (const [key, name, hint] of [
    ["relics", "Enable Relic Manager", "GM tools for relics configured on individual physical items. Uses PF2e Relics plus two Forge supplements from PF2e. Gifts are imported only on explicit Add/Sync."],
    ["ancestryParagon", "Enable Ancestry Paragon", "Two ancestry feats at level 1, then one at every odd level. Independent of Dual Class."],
    ["skillParagon", "Enable Skill Paragon (Starfinder variant)", "Choose a skill on each character. Automates proficiency and qualifying core common general skill feats; special prerequisites and replacement benefits need review."]
  ]) game.settings.register(MODULE_ID, key, {
    name, hint, scope: "world", config: true, type: Boolean, default: false, requiresReload: true
  });
  game.settings.register(MODULE_ID, "pathmuncherBridge", {
    name: "Enable Pathmuncher variant compatibility (2.0.1)", hint: "Preserve variant-managed items and choices on reimport, import a core second class, and place extra ancestry/class feats. Source-reviewed against Pathmuncher 2.0.1; test on a copied character.",
    scope: "world", config: true, type: Boolean, default: false, requiresReload: true
  });
  game.settings.register(MODULE_ID, "relicAspectLimit", {
    name: "Relics: default aspect limit", hint: "Maximum aspects for new relics. Each item can have its own limit in Relic settings.",
    scope: "world", config: true, type: Number, default: 2, range: {min: 1, max: 20, step: 1}
  });
  game.settings.register(MODULE_ID, "relicGiftSchedule", {
    name: "Relics: gift unlock levels", hint: "One slot per entry: level:tier, separated by commas. Tiers: minor, major, grand. Example: 1:minor,5:minor,9:major,13:major,17:grand. Lower-tier gifts can use higher-tier slots. Editing this also changes existing relics' active gifts.",
    scope: "world", config: true, type: String, default: "1:minor,5:minor,9:major,13:major,17:grand", requiresReload: true
  });
  game.settings.register(MODULE_ID, "skillCounter", {
    name: "Show skill budget helper", hint: "Informational only; select skills and skill increases on the sheet.",
    scope: "world", config: true, type: Boolean, default: true, requiresReload: true
  });
}
export function moduleEnabled() {
  return runtimeReady && game.settings.get(MODULE_ID, "moduleEnabled") === true;
}
export function maxClasses() { return moduleEnabled() ? 2 : 1; }
export function skillCounterEnabled() {
  return runtimeReady && game.settings.get(MODULE_ID, "skillCounter") === true;
}
export function ancestryParagonEnabled() { return runtimeReady && game.settings.get(MODULE_ID, "ancestryParagon") === true; }
export function skillParagonEnabled() { return runtimeReady && game.settings.get(MODULE_ID, "skillParagon") === true; }

export function relicsEnabled() { return runtimeReady && game.settings.get(MODULE_ID, "relics") === true; }
