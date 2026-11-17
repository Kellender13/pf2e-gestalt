import { registerActorOptions } from './actor-options.mjs';
import { registerPathmuncherHooks, installPathmuncherBridge, pathmuncherStatus } from './pathmuncher.mjs';
import { registerRelics, registerRelicHooks, openRelics, syncRelics, relicCatalog } from './relics.mjs';
import { registerParagonHooks, openSkillParagon, syncSkillParagon } from "./skill-paragon.mjs";
import { MODULE_ID } from "./constants.mjs";
import { registerSettings, setRuntimeReady } from "./settings.mjs";
import { registerCoexistence, onDeleteClassItem, armSecondClass, clearArm } from "./coexist.mjs";
import { registerMerge } from "./merge.mjs";
import { registerLadders, buildSections } from "./ladders.mjs";
import { onUpdateActor, syncSecondaryClassFeatures } from "./features.mjs";
import { registerBoostRows, openSecondClassBoost } from "./boosts.mjs";
import { registerSheet, removeSecondClass } from "./sheet.mjs";
import { registerSkillCounter, tallyTrainedSkills } from "./skills.mjs";
import { registerMismatchWarning } from "./mismatch.mjs";
import { registerClassChoices } from "./class-choices.mjs";

const status = { ready: false, errors: [], target: "Foundry 14.369 / PF2e 8.7.0–8.7.1" };
Hooks.once("init", registerSettings);
Hooks.once("setup", () => {
  const fail = (message) => { status.errors.push(message); console.error(`${MODULE_ID} | ${message}`); };
  if (game.system.id !== "pf2e" || !["8.7.0", "8.7.1"].includes(game.system.version) || Number(game.release.generation) !== 14) {
    fail("This release targets PF2e 8.7.0–8.7.1 on Foundry 14. Patches were not enabled.");
    return;
  }
  if (!game.modules.get("lib-wrapper")?.active) { fail("Install and enable libWrapper."); return; }
  if (game.modules.get("pf2e-dual-class-items")?.active) {
    fail("Disable Dual Class Items (PF2e) before enabling this fork. Both patch the same methods."); return;
  }
  const patched = [registerCoexistence(), registerMerge(), registerLadders(), registerClassChoices(), registerActorOptions(), registerRelics()];
  if (patched.some((ok) => !ok)) {
    libWrapper.unregister_all(MODULE_ID);
    fail("A required system method could not be patched. All registered patches were removed."); return;
  }
  setRuntimeReady(true);
  registerBoostRows();
  registerSheet();
  registerSkillCounter();
  registerMismatchWarning();
  registerParagonHooks();
  registerRelicHooks();
  registerPathmuncherHooks();
  Hooks.on("deleteItem", onDeleteClassItem);
  Hooks.on("updateActor", onUpdateActor);
  status.ready = true;
});
Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = {
    openSecondClassBoost, openRelics, syncRelics, relicCatalog, installPathmuncherBridge,
    armSecondClass, clearArm, buildSections, syncSecondaryClassFeatures,
    tallyTrainedSkills, removeSecondClass, openSkillParagon, syncSkillParagon,
    diagnose(actor) {
      return {
        ...JSON.parse(JSON.stringify(status)), foundry: game.version, pf2e: game.system.version,
        enabled: game.settings.get(MODULE_ID, "moduleEnabled"),
        pathmuncher: {...pathmuncherStatus},
        ancestryParagon: game.settings.get(MODULE_ID, "ancestryParagon"),
        skillParagon: game.settings.get(MODULE_ID, "skillParagon"),
        actor: actor ? {
          level: actor.level,
          classes: actor.itemTypes.class.map((c) => ({ id: c.id, slug: c.slug, key: c.system.keyAbility.selected })),
          extraClasses: actor.getFlag(MODULE_ID, "extraClasses"),
          classHP: actor.system.attributes.classhp,
          classDCs: actor.system.proficiencies.classDCs,
          featureCount: actor.itemTypes.feat.filter((f) => f.category === "classfeature").length
        } : null
      };
    }
  };
  for (const error of status.errors) ui.notifications.error(error, { permanent: true });
  if (status.ready && game.user.isGM) ui.notifications.info("PF2e Gestalt loaded. Variant toggles are in module settings; test new options on a copied character.");
});
