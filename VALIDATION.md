# Validation — 1.0.1

Reviewed against the exact public PF2e tag `pf2e-8.7.0`, commit `52dfeee703b887237f5e454747bcae45b136f9af`.

Source paths inspected:
- `src/module/item/base/document.ts`: singular class-item replacement and feature creation.
- `src/module/item/class/document.ts`: class data preparation, HP, proficiencies, DCs, linked features.
- `src/module/actor/character/document.ts`: build data, feat groups, level-up and level-down feature handling.
- `src/module/actor/creature/document.ts`: linked-item deletion dispatch.
- `src/module/rules/rule-element/choice-set/rule-element.ts`: compendium query wrapper target.
- `static/templates/actors/character/tabs/character.hbs`: second-class cell anchor.

Checks passed locally:
- 104 behavioral cases: 7 feat-order cases, 10 skill-accounting cases, 10 dual-class/boost cases, 19 Paragon cases, 20 relic cases, and 15 Pathmuncher bridge/processing cases, 3 startup/composed-preparation cases, 7 relic-presentation cases, and 1 read-only relic-render case, and 12 player-permission cases.
- All local named imports resolve.
- ESLint passes with no warnings.
- Every requested translation key exists. Unused inherited keys are harmless and reported by the checker.

New cases cover rejecting excess and duplicate classes, preserving existing classes/features, cleanup after failed creation, independent concurrent actor adds, HP and class DC merge, deduplicated same-attribute class boosts, idempotent/coalesced feature sync, and Rogue skill-feat schedule merging with cleanup even when preparation throws.

These tests use mocked Foundry documents, not a live Foundry server. They do not prove full game-system or UI compatibility. Foundry 14.369 was not available to execute here. The manifest intentionally has no `verified` compatibility claim.


## 0.2.0 checks

New cases cover independent toggles, progression boundaries, common/general/skill filtering, OR and AND proficiency prerequisites, unknown-prerequisite review, level/rank checks despite GM approval, numeric attributes, native upgrade effect construction, idempotent feat sync, level-down removal, preserving preexisting feats, disabling/reenabling, and the 11-slot ancestry schedule with Dual Class off.

The candidate parser was also exercised against actual PF2e 8.7.0 skill-feat JSON for all 16 core skills. Medicine returned 12 candidate feats; Religion returned 14 with narrative conditions requiring review. This checks data matching, not live character behavior.

Chris reported no bugs so far in 0.1.0. The new 0.2.0 options still need live Foundry testing. Automated checks use mocked Foundry documents, and do not validate actual dialog rendering or native effect execution.


## 0.2.1 layout correction

Confirmed the root cause against PF2e 8.7.0 character.hbs and _character.scss: inserting a button before .abcd makes it an extra auto-placed grid child. The control now lives in a sibling row outside .subsection.details. Existing 37 behavioral cases and ESLint pass. Headless Chromium rendering could not run in this environment (socket operation prohibited), so the new visual layout still needs verification in Foundry.


## 0.2.2 saved-choice regression

Four new mocked tests cover a renamed Specialty Crafting item whose sourceId differs from its persistent grant ID, preserving a preexisting non-managed selected feat with a different duplicateSource, background deferral and bounded retries after cancellation, and an explicit sync queued behind a background pass. They also verify canonical feat-name prerequisites remain satisfied after a choice renames the feat. All 41 cases and ESLint pass. The reporter's actual actor JSON was not available; a live Foundry reload test remains necessary.


## 0.3.0 source review and checks

- PF2e Relics 1.5.1 source commit `a0241db4b09d56c1854c754475b655e2854d29e7`.
- Pathmuncher 2.0.1 source commit `16554638b8380662e3d8078fb0285aa828977bb6`.
- Actual relic LevelDB index yields 119 tiered action gifts plus 2 core supplements (121 gift entries across 20 aspects). Dragon and Emotion setup actions are handled separately without consuming a gift slot. Physical helper items are excluded.
- Both supplemental UUIDs match the pinned PF2e 8.7.0 JSON files. ChoiceSet flag names respect PF2e's alphanumeric/hyphen sanitization.
- Tests cover default/custom level slots, two-aspect shared budgets, tier restrictions, equipment/investment, transfer cleanup, level loss, idempotent imports, canonical identities, saved daily uses, cancelled choices, origin namespacing, item-only configuration, and scoped Crafting controls.
- Pathmuncher tests cover protected class descendants and relic/Paragon items, duplicate mapping, feat-slot provenance, import pauses and cleanup on errors, conflicting class changes, new secondary class creation, and exact-version API installation.
- Second-class selector validates allowed attributes and refuses to silently modify manual attribute scores.

No live Foundry UI, real Pathbuilder export, native rule execution, or interactive import was available here. These remain preview tests, not a claim of verified Foundry compatibility. Inspect the item title-bar control, compact buttons, Dragon choice dialogs, and importer behavior on a copied actor before using a campaign character.


## 0.3.1 dual-class parser override

Reviewed Pathmuncher 2.0.1 `processCharacter`, `addGrantedItems`, the private class lookup/warning path, the later-level grant traversal, EvaluationActor, and ActorWriter. The adapter uses public methods to insert both class roots before native evaluation, without editing upstream files or evaluating generated code. Six mocked cases cover both roots visible during grants, nested-call safety, cancellation/error cleanup, narrowly scoped warning suppression, exported key-attribute selection, and reimport root-ID remapping. No live Foundry/Pathbuilder import was available; verify both classes’ subclass choices, feats, progression, spellcasting, and totals on a copied actor.


## 0.3.2 reported startup failure

The user’s console log identifies a duplicate registration of Character.prepareBaseData by this package. Earlier tests mocked each feature registration separately and did not reject repeated targets. The new test imports the real module entry point, runs init/setup/ready with a registry that rejects duplicate package/target registrations, and asserts successful startup plus character/item sheet hooks. A second test verifies all four Skill Paragon/Relic toggle combinations with one native preparation call. The live Foundry runtime remains unavailable; this reproduces and addresses the reported registration contract, not full visual validation.


## 0.3.3

Six pure update tests cover trait insertion, original prose preservation, repeated-save idempotence, duplicate managed-block collapse, gift/aspect replacement, cleanup, preexisting-trait ownership, and HTML escaping. One dual-class test covers applying the duplicate replacement to prepared boosts while retaining class DC keys, rejecting the shared attribute, and ignoring the replacement once class keys diverge. The startup test now checks the item render hook used by the inline Details panel. Layout has been checked against the pinned PF2e item sheet template; it has not been rendered in live Foundry.


## 0.3.4

Three new mocked regressions verify imported bonus-feat placement with saved choice preservation and idempotence; exclusion of normal slots, granted items, and manual additions; and safe restoration when Paragon is disabled. Existing relic level-locking/planning tests pass. Live Foundry/Pathmuncher validation remains outstanding.

## 0.3.5

Repeated rendering of a relic containing Wyrm's Flight makes no document update or recursive sheet render calls. Summary output preserves a literal apostrophe and reads raw source lore instead of prepared unidentified display. This prevents the render/save feedback path; the precise live trigger has not been reproduced in Foundry.

## 0.3.6

Eight new regressions cover default-off legacy permissions, independent aspect/gift access, GM controls, owner/compendium/world-item restrictions, preservation of GM configuration when aspects are cleared, canonical gift import/removal, unknown/over-limit aspects, bearer-level and slot restrictions, duplicate and off-aspect gifts, scoped reconciliation, revoked permissions and the restricted player sheet. Runtime tests use mocked Foundry documents; verify in a live player session after installation.

## 0.3.7

Verify immediate GM permission persistence, detached player DOM rendering, the Description-tab entry point, explanatory content for disabled permissions and world items. Existing no-save-on-render regression now traverses the entire GM rendering path. Tests are mocked; the exact cause in the reported live player session has not been confirmed.

## 1.0.0 release status

On November 17, 2026, the module owner reported that the module works well and requested publication. This is user-reported live validation, not an exhaustive compatibility certification. The automated checks use mocked Foundry documents. All class combinations, third-party sheet modules and concurrent multiplayer changes have not been exhaustively tested.

## 1.0.1 — PF2e 8.7.1

Compared upstream tag pf2e-8.7.0 to pf2e-8.7.1 (397f125aea87e6d6fa36e878c9c07d0e672826cf). Character document changes concern rune attack notes; class/base item documents, choice-set rules and character/item sheet templates used by the module are unchanged. Reviewed actor helper/base changes and physical usage changes. Existing module wrappers and field usage remain applicable. Full mocked init/setup/ready runs on both 8.7.0 and 8.7.1. No live 8.7.1 test world was available; source review and local tests are not an exhaustive runtime certification.
