import { variantImportRunning } from './import-state.mjs';
import { MODULE_ID, SECONDARY_CLASS_FLAG, EXTRA_CLASSES_FLAG } from "./constants.mjs";
import { moduleEnabled } from "./settings.mjs";
import { registerLibWrapper, notifyDualClass, getExtraClassIds } from "./util.mjs";

/** Preserve existing class items only while a class-add operation is active on that actor.
 * PF2e 8.7.0 uses a singular-type purge inside ItemPF2e.createDocuments.
 * The WeakMap isolates actors; same-actor overlapping additions are rejected.
 */
const preservation = new WeakMap();
export function armSecondClass() {} // Existing sheet API; adds now always preserve.
export function clearArm() {}

/**
 * Confirm the bypass actually worked, and say so if it did not.
 *
 * Rule: assert on what the actor holds afterwards, not on the fact that the wrapper ran. The
 * wrapper running proves the patch registered; only re-reading the actor proves PF2e did not delete
 * the class by some other route.
 *
 * @param {ActorPF2e} actor
 * @param {string[]} expectedIds Class ids that should still be present.
 */
function verifyPurgeBypass(actor, expectedIds) {
  const missing = expectedIds.filter((id) => !actor.items.get(id));
  if (missing.length === 0) return;

  const version = game.system.version;
  console.error(
    `${MODULE_ID} | the class-purge bypass failed on pf2e ${version}: `
    + `${missing.length} class item(s) were deleted anyway (${missing.join(", ")}).`
  );
  notifyDualClass(
    "error",
    `PF2e Gestalt: adding the second class deleted the first anyway. This module has not been `
    + `verified against pf2e ${version}. Restore your test actor from its exported JSON backup and report this.`
  );
}

/**
 * Stop deleting one class from taking the other class's features with it.
 *
 * Deleting an item on a creature expands the list to include that item's linked items
 * (`CreaturePF2e#deleteEmbeddedDocuments`, pf2e.mjs:33091-33096). For a class, "linked" is computed
 * by `ABCItemPF2e#getLinkedItems` (45084) as every feat whose `system.location` is *any* class item
 * id on the actor:
 *
 *   let e = this.actor.itemTypes[this.type].map((e) => e.id);
 *   return this.actor.itemTypes.feat.filter((t) => e.includes(t.system.location ?? ""));
 *
 * and `ClassPF2e` widens it again to every `classfeature` on the actor that nothing else granted.
 * With one class both are exactly right. With two, removing either class deletes both classes'
 * features - measured: removing a Wizard took the Fighter's granted feature with it.
 *
 * A dual-class actor gets the narrow answer instead: the feats this class item actually granted,
 * which `createGrantedItems` marks by stamping its own id into `system.location` (45099). Features
 * granted in turn by those features carry `flags.pf2e.grantedBy` and are already removed with their
 * granter, so they do not need listing here.
 *
 * This guards deleting a class by any route, not only the module's own Remove Second Class - a class
 * dragged out of the items list would otherwise take the other class's features with it.
 */
function registerLinkedItemNarrowing() {
  return registerLibWrapper(
    "CONFIG.PF2E.Item.documentClasses.class.prototype.getLinkedItems",
    function (wrapped) {
      const actor = this.actor;
      if (!moduleEnabled() || actor?.type !== "character") return wrapped();

      // Two classes on the actor is the obvious case, and it is not the only one. During an *add*
      // the system purges the existing class before creating the new one, so at that moment the
      // actor still holds exactly one class and a count test falls through to the system's own
      // implementation - which collects every feat located to any class item on the actor. The
      // create wrapper filters the class ids out of that delete, but the feats are not class items
      // and went through untouched, so adding a second class kept the first class and destroyed its
      // features. Measured on 2026-09-09: a Fighter with four features had all four removed when a
      // Sorcerer was added, and the Fighter item itself survived.
      //
      // So narrow whenever a create on this actor is preserving classes, whatever the count is
      // right now.
      const preserving = preservation.has(actor);
      if (!preserving && actor.itemTypes.class.length < 2) return wrapped();

      return actor.itemTypes.feat.filter((f) => f.system.location === this.id);
    },
    "MIXED"
  );
}

export function registerCoexistence() {
  let ok = registerLinkedItemNarrowing();

  ok = registerLibWrapper(
    "CONFIG.Item.documentClass.createDocuments",
    async function (wrapped, data = [], operation = {}) {
      const actor = operation.parent;
      const addsClass = Array.isArray(data) && data.some((d) => d?.type === "class");

      if (!moduleEnabled() || !addsClass || actor?.type !== "character") {
        return wrapped(data, operation);
      }

      const incoming = data.filter((d) => d?.type === "class");
      const existing = actor.itemTypes.class.map((c) => c.id);
      const reason = validateClassAdd(actor.itemTypes.class, incoming, preservation.has(actor));
      if (reason) {
        clearArm();
        notifyDualClass("warn", reason);
        return [];
      }
      if (existing.length === 0) {
        preservation.set(actor, { ids: new Set() });
        try {
          const created = await wrapped(data, operation);
          await adoptBatchClasses(actor, created);
          return created;
        } finally { preservation.delete(actor); }
      }

      // The class items and everything they granted. Preserving only the class ids keeps the class
      // and loses its features: the purge expands each class to its linked items, and a granted
      // feature is a feat rather than a class item, so it is not in `existing` and goes through the
      // delete untouched. Measured on 2026-09-09 before this line existed - adding a Sorcerer to a
      // Fighter left the Fighter item in place with all four of its features removed.
      const granted = actor.itemTypes.feat
        .filter((f) => existing.includes(f.system.location))
        .map((f) => f.id);

      preservation.set(actor, { ids: new Set([...existing, ...granted]) });
    
      try {
        const created = await wrapped(data, operation);
        verifyPurgeBypass(actor, existing);
        await flagNewClassAsSecondary(actor, created);
        return created;
      } finally {
        preservation.delete(actor);
      }
    },
    "MIXED"
  ) && ok;

  ok = registerLibWrapper(
    "CONFIG.Actor.documentClass.prototype.deleteEmbeddedDocuments",
    function (wrapped, embeddedName, ids = [], operation = {}) {
      const preserve = preservation.get(this);
      if (!preserve || embeddedName !== "Item") {
        return wrapped(embeddedName, ids, operation);
      }

      const kept = ids.filter((id) => !preserve.ids.has(id));
      if (kept.length === ids.length) return wrapped(embeddedName, ids, operation);

      // Everything in this delete was a class we are preserving, so there is nothing left to do.
      // Calling through with an empty list would be harmless but pointless.
      if (kept.length === 0) return Promise.resolve([]);
      return wrapped(embeddedName, kept, operation);
    },
    "MIXED"
  ) && ok;

  return ok;
}

/**
 * Mark the newly added class as the secondary one.
 *
 * The class that was already there keeps being the actor's real class as far as PF2e is concerned,
 * so making the new arrival secondary is both the smaller change and the one that matches what
 * "add a second class" means. The sheet can swap which is which afterwards.
 *
 * @param {ActorPF2e} actor
 * @param {ItemPF2e[]} created
 */
async function flagNewClassAsSecondary(actor, created) {
  if (variantImportRunning(actor)) return;
  const newClass = (created ?? []).find((i) => i?.type === "class");
  if (!newClass) return;

  // Append rather than overwrite, so adding a third class keeps the second. Written as the list
  // even when it holds one id, which is also what migrates a character off the old single-id flag:
  // `getExtraClassIds` reads the old one, and this writes the new one on the next class change.
  const ids = [...getExtraClassIds(actor).filter((id) => id !== newClass.id), newClass.id];
  await actor.setFlag(MODULE_ID, EXTRA_CLASSES_FLAG, ids);
}

/**
 * Record the extras when several classes arrive in one create on a character that had none.
 *
 * A character builder can create both classes in a single `createEmbeddedDocuments` call. The
 * purge only deletes classes the actor already holds, so on a fresh character both survive with no
 * help from the bypass above, and this module never heard about them: the character then has two
 * class items and no flag, every rule here stays off for it, and the sheet gives no sign. Measured
 * 2026-09-16 on 8.5.0 with a Wizard and a Fighter created in one batch: both present, flag absent.
 *
 * The primary is whichever class PF2e itself made `actor.class` after the create (the last class in
 * the batch, same measurement), and the rest become extras in batch order. Taking the system's own
 * pick keeps `getPrimaryClass` and the system's `_preUpdate` grant naming the same item.
 *
 * @param {ActorPF2e} actor
 * @param {ItemPF2e[]} created
 */
async function adoptBatchClasses(actor, created) {
  if (variantImportRunning(actor)) return;
  const classes = (created ?? []).filter((i) => i?.type === "class");
  if (classes.length < 2) return;

  const primary = actor.class;
  const extras = classes.filter((c) => c.id !== primary?.id);
  if (extras.length === 0) return;

  await actor.setFlag(MODULE_ID, EXTRA_CLASSES_FLAG, extras.map((c) => c.id));
  notifyDualClass("info", game.i18n.format("PF2EDC.Coexist.AdoptedBatch", {
    actor: actor.name,
    primary: primary?.name ?? "",
    classes: extras.map((c) => c.name).join(", ")
  }));
}

/**
 * Keep the flag honest when a class item goes away.
 *
 * A dangling flag would leave `getSecondaryClass` returning null while the actor still looked
 * dual-classed to anything reading the raw flag, so clear it at the source instead.
 */
export function onDeleteClassItem(item) {
  const actor = item?.parent;
  if (variantImportRunning(actor)) return;
  if (!actor?.isOwner || game.users.activeGM && game.user.id !== game.users.activeGM.id) return;
  if (item?.type !== "class" || actor?.type !== "character") return;

  const ids = getExtraClassIds(actor);
  if (ids.length === 0) return;

  // Drop the deleted class from the list, and drop the whole list once fewer than two classes are
  // left. A single remaining class still listed as an extra is not multi-class by any useful
  // definition, and it would show up in an extra slot with the Class slot empty beside it.
  const remaining = ids.filter((id) => id !== item.id && actor.items.get(id)?.type === "class");
  const classCount = actor.itemTypes.class.filter((c) => c.id !== item.id).length;

  if (classCount < 2 || remaining.length === 0) {
    actor.unsetFlag(MODULE_ID, EXTRA_CLASSES_FLAG);
    if (actor.getFlag(MODULE_ID, SECONDARY_CLASS_FLAG) !== undefined) {
      actor.unsetFlag(MODULE_ID, SECONDARY_CLASS_FLAG);
    }
    return;
  }

  // Written as the list even when the character came in on the old single-id flag, which retires
  // that flag rather than leaving two sources of truth behind.
  actor.setFlag(MODULE_ID, EXTRA_CLASSES_FLAG, remaining);
  if (actor.getFlag(MODULE_ID, SECONDARY_CLASS_FLAG) !== undefined) {
    actor.unsetFlag(MODULE_ID, SECONDARY_CLASS_FLAG);
  }
}

/** Reject excess, duplicate, or overlapping adds before PF2e can purge anything. */
export function validateClassAdd(existing, incoming, busy = false) {
  if (busy) return "A class addition is already running for this character. Finish its prompts first.";
  if (existing.length + incoming.length > 2) {
    return "Standard Dual Class allows exactly two classes. Remove a class explicitly before replacing it; nothing was changed.";
  }
  const seen = new Set();
  for (const item of [...existing, ...incoming]) {
    const slug = item.slug ?? item.system?.slug ?? item.name?.trim().toLowerCase();
    if (slug && seen.has(slug)) return "Choose two different classes. This class is already present; nothing was changed.";
    if (slug) seen.add(slug);
  }
  return null;
}
