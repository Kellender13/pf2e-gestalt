# Changes

## 1.0.0 — 2026-11-17

First public release, based on the user-tested 0.3.7 build.

- Dual Class, Ancestry Paragon and Skill Paragon variant automation.
- Item-based relic configuration, gifts and GM-controlled player choices.
- Optional Pathmuncher 2.0.1 integration.
- Retain the module ID and all existing flags and settings when upgrading.
- Remove preview branding; add public documentation, continuous checks and release packaging.
- 103 local behavioral checks, lint and translation checks pass. The owner reports successful live use; broad compatibility testing remains limited.

## 0.3.7

- Save GM player-choice checkboxes immediately, preserving other current settings.
- Add a Description-tab Relic choices link for owning players; place controls at the top of Details.
- Build controls even while the sheet DOM is detached; remove the silent isConnected early exits without adding render-time writes.
- Show explicit guidance for disabled choices, world-item copies, disabled manager, and failed/missing gift catalogs.
- Add four UI regressions and extend the existing read-only render check to exercise the full renderer. All 103 local checks pass. No live Foundry reproduction is available.

## 0.3.6

- Add independent per-item GM toggles for player aspect selection and gift selection, defaulting off on new and existing relics.
- Owning players receive a restricted Details panel with only permitted choices; gifts use the current catalog, selected aspects, bearer level, tier slots and prerequisites.
- Player reconciliation is scoped to the selected relic, including cleanup. Permission checks run again after catalog loading and before queued reconciliation.
- Clearing player-selected aspects preserves the relic and its GM configuration; existing gifts outside those aspects remain assigned but inactive.
- Add eight permission, level, scoped-sync and player UI regressions. All 99 local checks pass; live multiplayer Foundry verification is pending.

## 0.3.5

- Remove document writes from the item-sheet render hook to prevent repeated refreshes when relic summary HTML is normalized (reported with Wyrm's Flight).
- Preserve literal apostrophes in summary text and use the raw item description rather than its prepared display when saving.
- Keep trait and summary updates on explicit relic changes and Sync; no gift removal is needed.
- Two new regressions; 91 local checks pass. Live Foundry confirmation is still pending.

## 0.3.4

- Refile qualifying Pathmuncher-imported bonus feats into the configured Skill Paragon group after import and during Paragon Sync. Match canonical source IDs and existing eligibility checks; preserve item IDs and saved selections.
- Do not move normally slotted feats, granted child items, or manually added feats. Record placement separately from module-owned grants so disabling/removing Paragon restores the original group without deleting imported feats.
- Three new regressions; 89 local checks pass.

## 0.3.3

- Replace the item title-bar relic manager with a Relic checkbox and inline controls on the Details tab.
- Add/remove the module-managed Relic trait and maintain one tagged Aspects/Gifts description section. Repeated saves replace the section; original prose and preexisting traits remain intact.
- Opening an existing configured relic refreshes its trait and description. Removing the last selected aspect or unchecking Relic removes its setup and managed bearer actions.
- When both classes have the same selected key attribute, offer a different attribute for the second class boost and apply it in the calculated class-boost step without changing class DC attributes.
- Seven new regression cases; 86 total local checks pass.

## 0.3.2

- Fix startup failure caused by Skill Paragon and Relics registering the same prepareBaseData target twice. A single actor-options wrapper now composes both variants.
- Add full module init/setup/ready regression testing with a duplicate-rejecting libWrapper mock and verify both character and item sheet hooks register.
- Check independent toggles and a single native preparation call. All 79 local checks pass.

## 0.3.1

- Process both class roots inside Pathmuncher before evaluating ChoiceSets, GrantItems, and later-level features, replacing the previous post-import-only approach.
- Override only the obsolete dual-class notification during supported dual-class processing; preserve all other warnings and normal behavior when Dual Class is disabled.
- Preserve primary/secondary identity during batch writes and remap a processed secondary root to a retained existing class on reimport.
- Resolve the second key attribute from saved/exported choices or request an explicit choice when ambiguous.
- Six additional regression cases; 77 total local checks pass.

## 0.3.0

- Add an item-only Relic manager with per-item aspect limits, active/equipment controls, and a configurable shared gift schedule.
- Integrate PF2e Relics; supplement missing Creative Spark and Elements of Creation from core PF2e.
- Preserve native gift choices and use counters; grant only during explicit Add/Sync. Namespace Dragon/Emotion origin choices per relic.
- Gate managed gifts by bearer level, assigned aspects, active state, equipment, and investment. Clean managed actions when their relic is removed.
- Add optional Pathmuncher 2.0.1 bridge: protect variant items, map extra feat slots, import a core second class, and pause background variant reconciliation during imports.
- Add a direct second-class key-attribute selector; no unrestricted bonus boost is added.
- Make the Skill Paragon button smaller and share a compact row with the second-class boost control. Relic configuration remains on individual item sheets.
- Add 30 behavioral regression cases; retain previous Dual Class and Paragon fixes.

## 0.2.2

- Match existing Paragon feats by persistent module IDs and all source metadata, preserving ChoiceSet selections and renamed feats.
- Resolve feat-name prerequisites from canonical compendium names as well as displayed names.
- Defer interactive feat creation during world loading and other background updates; setup and explicit Sync may prompt.
- Do not retry a cancelled feat creation repeatedly within one sync.
- Preserve explicit interactive requests queued behind a background sync.
- Add four regression cases covering these behaviors.

## 0.2.1

- Move the Skill Paragon button outside the portrait/details grid into its own row. This fixes the compressed ancestry, heritage, background, class, and deity fields.
- Constrain the button to available width on narrow sheets. No actor data or rules changes.

## 0.2.0

- Independent Ancestry Paragon toggle, using the existing ancestry-feat group.
- Independent Starfinder Skill Paragon toggle and per-character setup/review button.
- Automatic proficiency floor via a managed native effect; replacement training picker.
- Core common general skill feat qualification, automatic grants and reconciliation.
- GM review for unresolved prerequisites, duplicate-benefit report, and explicit removal.
- Skill-budget helper includes variant training and increases; both Paragon options work without Dual Class.
- 12 additional behavioral tests. No actor migration or module-ID change.

## 0.1.0

Initial dual-class development preview, based on the MIT-licensed upstream module identified in UPSTREAM.md.
