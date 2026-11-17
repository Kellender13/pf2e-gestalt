# PF2e Gestalt 0.3.4 — Relics and imports

Target: Foundry 14.369, PF2e 8.7.0. This is a source-reviewed and locally tested preview; it still needs live Foundry testing.

## Install or upgrade

1. Stop Foundry. Replace `Data/modules/pf2e-gestalt` with the `pf2e-gestalt` folder from this ZIP.
2. Restart. Enable PF2e Gestalt and libWrapper. Keep the earlier Dual Class / Paragon settings you use.
3. Install and enable [PF2e Relics](https://github.com/TheErikkuBlade/pf2e-relics/) for its gift catalog. This module does not overwrite that package.
4. In Configure Settings → PF2e Gestalt, enable **Relic Manager**. For the optional importer bridge, enable **Pathmuncher variant compatibility** with Pathmuncher **2.0.1** installed. Reload.

## Make an individual item a relic

As GM, open a physical item's sheet, in the Items directory or a character's inventory. Open its **Details** tab and check **Relic**. Its configuration appears directly beneath the checkbox; there is no title-bar popup manager or character-level relic setup button.

Set its maximum aspects and selected aspects, then click **Save relic settings**. The world setting **Relics: default aspect limit** supplies the initial limit (2); each item can override it. The item stores this configuration and its assigned gifts. The bearer receives the gift actions so PF2e can apply their rules and use actor-based rolls.

For Chris's example:

- Maximum aspects: **2**.
- Aspects: **Forge** and **Dragon**.
- Keep the default schedule: `1:minor,5:minor,9:major,13:major,17:grand`.
- At level 3, choose **one Minor gift total**, from either aspect.
- At level 5, choose one more Minor gift from either aspect (two total).

The gift allowance belongs to the item and is shared across its aspects. Each additional relic item has its own allowance. The manager never chooses or awards a gift merely because a character leveled up.

**Relics: gift unlock levels** accepts comma-separated `level:tier` entries. Valid tiers are `minor`, `major`, and `grand`; levels are 1–20. Each entry grants one slot. Higher-tier slots can hold lower-tier gifts. For a different campaign, `3:minor,5:minor` would unlock only those two gifts until the schedule is expanded. Changes apply to existing relics after reload. Saved gifts that no longer fit become inactive rather than losing their choices.

Unowned items have a **Planning level**. Once on a character, the actual bearer level determines which gifts function. Normal item level, price, runes, and crafting data are not rewritten.

## Adding gifts and saved choices

Select a gift in the inline dropdown and use **View gift** to review its source, or **Add gift** to assign it. **Sync gifts** imports missing assigned gifts on the bearer. Existing actions, choice selections, and frequency counters are retained. Nothing imports gifts or asks choices on world startup.

Dragon and Emotion gifts import their setup action first, when needed. Choose the origin/emotion once; it does not cost a gift slot. Origin flags and related options are isolated per relic. If a choice is cancelled, explicitly Sync again. Transferring a relic requires a new bearer to Sync and resolve its origin choices; automatic bonding and copying a former bearer's decisions are not assumed.

By default an item must be held or worn and invested where applicable. The GM can disable that requirement in the item's Relic settings or mark the relic inactive. Managed rules and chat-card activation stop when the item is inactive, absent, or its gift is level-locked. Removing/transferring the item cleans up its managed bearer actions. Existing independently acquired actions are never adopted or deleted.

One copy of a named/source gift is imported per bearer to avoid duplicate benefits. A gift already acquired elsewhere is retained and counted as existing; it is not converted into a relic-controlled action. If two relics share that gift, review which source should own it.

## Missing Forge gifts

The picker includes **Creative Spark (Minor)** and **Elements of Creation (Major)** from PF2e's Adventure-Specific Actions compendium. They are absent from the inspected PF2e Relics 1.5.1 Forge folder. Future upstream entries with those names take precedence in the catalog, avoiding duplicate picker entries.

The imported versions provide explicit roll-option toggles:

- Fire wisp assisting on a metalworking check: the level-scaled Crafting modifier.
- This is a blacksmithing check: restricts the outcome adjustment to appropriate work.
- Creative Spark daily protection: use only when spending that once-per-day protection; track the daily use manually.
- All four wisps assisting: doubles Creative Spark's modifier and improves blacksmithing outcomes by one degree. Requires Creative Spark on the same relic.

Toggles start off. Wisp duration, fuel, dismissal, placement, and the daily protection's expenditure are manual. The imported action retains its native frequency field, but posting a chat card is not a full activation workflow. Gift-linked effects already applied to other actors are not recalled when the relic is unequipped. Other gifts use their source compendium automation; the manager does not claim to automate every narrative effect, macro, summon, prerequisite, or rune. Nested GrantItem gifts are deferred for manual review. Intelligent relic setup and physical helper subitems are not standalone gifts in this picker.

Sources: [Relic rules](https://2e.aonprd.com/Rules.aspx?ID=3248), [Forge gifts](https://2e.aonprd.com/Relics.aspx?Aspect=20), [PF2e Relics](https://github.com/TheErikkuBlade/pf2e-relics/). Gift text remains in the installed source packages, with their publication metadata.

## Pathmuncher compatibility

Enable the bridge before opening Pathmuncher's normal import window. This preview supports **2.0.1 only**; unsupported versions leave the bridge inactive and issue a notification. Check `game.modules.get('pf2e-gestalt').api.diagnose(actor).pathmuncher` if needed.

The bridge preserves this module's Skill Paragon source, managed feats and choices, relic items/actions, and an existing second class with its descendants. When the import produces duplicates of those protected items, it keeps the existing item and remaps incoming references. Consequently, preserved relic gear is not refreshed from Pathbuilder: adjust its quantity, runes, etc. on the Foundry item when needed.

Ancestry Paragon's extra level-one slot and recognized secondary-class feat slots are mapped from Pathmuncher's parsed feat provenance. Review unrecognized/custom feat labels manually. Both class roots are now included in Pathmuncher’s processing result before its native feature/choice evaluation. Its level-by-level grant traversal processes both classes. The obsolete dual-class warning is suppressed only while this supported processing is active; unrelated warnings remain visible. Keep class import enabled. A second-class key attribute is taken from a saved choice or an unambiguous export, or explicitly selected if ambiguous. Missing secondary features are reconciled after writing. Choices not supplied by the importer can still prompt. Review spellcasting entries, subclass choices, and totals after importing a dual-class build.

When replacing the primary class, **uncheck the old primary class** in Pathmuncher's items-to-keep list. The bridge protects the second class automatically. Changing the second class or swapping class order is stopped before writing; perform those changes explicitly first. Skill Paragon must be configured in Foundry; the bridge does not infer the chosen skill or GM approvals from a Pathbuilder export. World variant settings remain GM-controlled.

Background Paragon/secondary-feature updates pause during the write so they cannot race the importer. After a successful import, noninteractive Skill Paragon reconciliation resumes; use its button and Sync for new unresolved choices. Relic configuration remains on the preserved physical items. On a write failure, use Pathmuncher's backup/recovery workflow; the bridge does not promise an atomic rollback. If a browser closes mid-import, the pause expires after 30 minutes, or the GM can clear `actor.unsetFlag('pf2e-gestalt','pathmuncherImport')` after confirming no import is running.

Source reviewed: [MrPrimate/pathmuncher](https://github.com/MrPrimate/pathmuncher), version 2.0.1. No upstream package files are modified.

## Second-class attribute boost and compact buttons

The character sheet has **2nd Class Boost**, beside the smaller **Choose skill / Skill: …** button. When class keys differ, it selects from the second class’s allowed key attributes. When both selected keys match, it instead lets you choose any different attribute for the otherwise duplicated second boost. That choice is saved on the actor and applied during calculated creation boosts, while both classes retain their original class-DC keys. If the class keys later differ, the saved replacement is ignored. This duplicate-key replacement implements the requested table ruling; it is not an additional third class boost and does not double level-up boosts. Manual attribute scores must be switched to calculated boosts before this selector can apply a boost.

[Dual Class rules](https://2e.aonprd.com/Rules.aspx?ID=1328).

## Live test checklist

On a copied character:

1. Confirm the smaller skill/boost row does not crowd the portrait/ABCD grid.
2. Open a weapon or equipment item and check **Relic** in Details. Select Forge and Dragon with limit 2. Verify a third aspect cannot be saved.
3. At level 3, assign one Minor gift; verify another is unavailable until level 5. At level 5 choose from either aspect.
4. Add a Dragon gift, resolve the origin, reload, and verify the choice stays saved. Test its damage type or resistance.
5. Add Creative Spark, test an eligible Crafting check with toggles off/on. At an appropriate level, add Elements of Creation and verify the four-wisp and blacksmithing controls.
6. Unequip, uninvest, and transfer the relic. Verify its old managed powers stop and the new bearer can explicitly Sync.
7. Choose the second-class key attribute; verify its boost and DC. Reload to confirm persistence.
8. Import and reimport a copied Pathbuilder build with Pathmuncher 2.0.1. Verify both classes, feat slots, saved Paragon choices, relic inventory, and no duplicate gifts. Review the importer report and character totals.


## Relic trait and description maintenance

Checking Relic adds the native `relic` trait and an Aspects/Gifts summary to the item description. Save settings, add/remove gifts, or click Sync to refresh it. Opening the item sheet never saves the item. The summary is a single module-tagged HTML block that is replaced on subsequent updates, including collapse of duplicate managed blocks. Original prose is retained. Keep the generated section’s container intact when editing HTML. Manually authored prose is not deleted or treated as a managed block.

Unchecking Relic, or saving after removing its last previously selected aspect, clears the setup, managed description block, and trait added by the module. A Relic trait that already existed before setup is preserved. The initial checked setup can have no selected aspects while you configure it. Native gift-specific choice dialogs may still appear when adding gifts.


## Imported Skill Paragon bonus feats

Configure the character’s Paragon skill in Foundry. After a successful protected Pathmuncher import, or when running **Skill → Sync feats**, qualifying imported bonus feats are moved to the Skill Paragon group. Checks use compendium identity, skill, level, prerequisites, and existing GM approvals. Normal feat slots, granted child feats, and manual additions are not moved. These imports remain independently owned: saved choices stay intact, and disabling/removing Paragon restores their previous group rather than deleting them. Unresolved prerequisites remain for GM review.

Relic availability follows the actual bearer’s level regardless of player ownership. A world-directory item without a bearer has a planning-level control. Once placed on a character, the character level overrides that planning level; future assigned gifts remain locked until the appropriate slots unlock. Use Sync to import newly available assigned gifts.

## Player selection permissions (0.3.6)

The GM opens the physical relic item's Details tab and enables either or both **Allow owning players to choose aspects** and **Allow owning players to choose gifts**, then saves relic settings. These permissions are per item and off by default. For fixed Forge/Dragon aspects with player-chosen gifts, select Forge and Dragon as GM and enable only the gift permission.

A player with ownership of the bearer opens that item's Details tab. With aspect permission, they select up to the GM's maximum and click Save aspects. With gift permission, they can add or remove gifts from the saved selected aspects within the current bearer's level and tier allowances. Sync this relic retries its grants without touching other relics. Native origin/choice prompts may appear when new grants are created; no recurring load-time imports are added.

Players cannot edit the limit, planning level, active/equipment settings, permission toggles, or remove the relic through this panel. A world item without a character bearer remains GM-managed. These controls govern the module workflow and do not replace Foundry's underlying document ownership permissions. Changing aspects keeps existing gift assignments; gifts from deselected aspects become inactive. Clearing all aspects as a player retains the relic setup and GM permissions.

### Player controls visibility (0.3.7)

Set player permissions on the relic inside the character's inventory. Each checkbox now saves immediately; Save relic settings still saves the rest of the configuration. A player with Owner permission opens that inventory item and clicks Relic choices on Description, or opens Details where the controls appear at the top. Separate world-item copies do not retroactively update inventory copies. Missing permissions show an explanation. If catalog loading fails or expected gifts are missing, check player access to the PF2e Relics gift compendium. PF2e itself prevents players from opening unidentified physical-item sheets; this module does not bypass identification.
