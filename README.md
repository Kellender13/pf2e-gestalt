# PF2e Gestalt

Dual Class, Ancestry Paragon, Skill Paragon, and item-based relic management for Pathfinder Second Edition in Foundry VTT.

Version **1.0.1**. Developed and source-reviewed for **Foundry VTT 14 build 369 / PF2e 8.7.0–8.7.1**. The module owner reports successful live use. Local automated tests use mocked Foundry documents; not every class pairing or third-party module has been tested.

## Requirements

| Component | Requirement |
| --- | --- |
| Foundry VTT | Version 14; development target build 369 |
| PF2e system | 8.7.0 and 8.7.1; other versions are intentionally gated |
| libWrapper | Required, 1.12 or newer |
| PF2e Relics | Recommended for the full relic gift catalog |
| Pathmuncher | Optional; integration supports exactly 2.0.1 |

Disable **Dual Class Items (PF2e)** before enabling this module: both modify the same system behavior. Avoid enabling equivalent variant automation in multiple modules.

## Installation and upgrades

Use this [installation manifest](https://github.com/Kellender13/pf2e-gestalt/releases/latest/download/module.json) into Foundry's **Install Module → Manifest URL** field. Release manifests point to the latest release for updates.

For manual installation, extract the release's **pf2e-gestalt.zip** into `Data/modules/`, producing `Data/modules/pf2e-gestalt/module.json`. Use the attached module ZIP, not GitHub's automatic source-code ZIP. Enable libWrapper and PF2e Gestalt in the world, then configure the desired variants in module settings.

Upgrading from a preview retains the same `pf2e-gestalt` module ID and existing flags and settings. Replace the module folder, restart the world, and refresh all clients. Back up the world before upgrading. Disabling the module does not remove stored second-class items or granted features.

## Features

### Dual Class

Enable **Dual Class**, then add two distinct class items to a character. The module retains both classes, their feature progression, separate class-feat groups and class DC attributes. Class HP uses the higher value. Shared skill/general/ancestry schedules use the union of granted levels rather than adding duplicate slots. A third class is rejected.

The **2nd Class Boost** selector supports a different attribute when both classes share a key attribute, while retaining each class's original DC attribute. The skill-budget helper is advisory; select trained skills and skill increases manually. Use **Sync Features** if second-class features need reconciliation.

Spellcasting entries, spells, repertoires and some class-specific resources require manual setup and review. Removing a class is not a complete character rebuild: review feats, spells and resources afterwards. Existing actors made with other dual-class modules are not automatically converted.

### Ancestry Paragon

Adds two ancestry-feat slots at level 1 and one at every odd level afterwards, for 11 slots by level 19. It works independently of Dual Class. Turning it off removes extra slots, not selected feats.

### Skill Paragon

Implements the Starfinder 2e skill-paragon variant using PF2e's core skills and feat catalog. Click **Choose skill** on the character sheet. The chosen skill receives minimum ranks of trained/expert/master/legendary at levels 1/3/7/15. Qualifying common general skill feats appear in a separate group.

Unsupported prerequisites require GM review. If the chosen skill is already trained, select replacement training; selecting replacement Lore is not automated. Normal increases spent reaching Paragon's minimum rank may need reassignment. Explicit Sync can prompt for new feat choices; existing selections are preserved across reloads.

### Relics

The GM opens an individual physical item's **Details** tab and checks **Relic**. Select its aspects and gifts there. Defaults are two aspects and shared gift slots at levels **1, 5, 9, 13 and 17** (Minor, Minor, Major, Major, Grand). World settings customize the schedule; each item can have its own aspect limit.

Owned relics use the bearer's level. World items have a planning level. Gift activation respects selected aspects, level/tier slots, the active setting, and equipment/investment requirements. The module maintains the native Relic trait and one managed description summary while preserving original item prose.

GM toggles **Allow owning players to choose aspects** and **Allow owning players to choose gifts** save immediately and are independent. Set them on the actual item in the character's inventory. Players use **Relic choices** on Description or the panel at the top of Details. Separate world-item copies retain separate permissions. PF2e's identification and Foundry's ownership rules still apply.

Enable [PF2e Relics](https://github.com/TheErikkuBlade/pf2e-relics) for the full catalog. Creative Spark and Elements of Creation are supplemented through references to core PF2e entries; the compendium's content is not bundled here. Grant players access to the gift compendium when allowing player selection. Nested grants can require manual review; daily expenditure and some gift effects remain manual.

### Pathmuncher

Enable the optional **Pathmuncher variant compatibility (2.0.1)** setting before importing. The bridge processes dual-class features, preserves managed variant items and saved choices, and routes eligible imported bonus feats to the configured Skill Paragon group. Configure Skill Paragon before import or use **Sync feats** afterwards. Conflicting class changes and unsupported versions are rejected rather than silently converted.

See [RELICS-AND-IMPORTS.md](RELICS-AND-IMPORTS.md) for detailed behavior and limitations.

## Support and validation

Report issues with Foundry/PF2e/module versions, character level and class pairing, steps to reproduce, expected versus actual behavior, and the first relevant console error. Screenshots help with layout issues. Remove private world data before sharing exports.

Optional local diagnostic, after selecting the character's token:

```js
game.modules.get('pf2e-gestalt').api.diagnose(canvas.tokens.controlled[0]?.actor)
```

The diagnostic returns local data without transmitting it. Cross-client simultaneous edits are not transactionally locked; use one editor at a time for character setup. Individual class rules referring to a single generic class/DC may require manual correction.

See [VALIDATION.md](VALIDATION.md) for checks performed and [CHANGELOG.md](CHANGELOG.md) for release history.

## Development and releases

Use Node.js 24 and Python 3 for tooling; neither is required by the installed module.

```sh
npm ci --ignore-scripts
npm run lint
npm test
npm run check-lang
python3 tools/build-release.py
```

The builder writes a minimal runtime ZIP to `dist/`. For publishing, pass `--repository OWNER/REPO` to generate the real GitHub install/update URLs. No placeholder URLs are included in local-only builds.

The **Publish release** GitHub workflow runs checks, builds the assets and publishes the version in `module.json`. It runs when `module.json` changes on main, on a matching version tag, or manually from Actions. Update `module.json`, CHANGELOG and RELEASE-NOTES before later releases. Existing releases are not overwritten. GitHub releases are separate from inclusion in Foundry's package directory.

## Credits and license

Maintained by Chris Marino. Derived from Brianthas / Bryan H's [Dual Class Items (PF2e)](https://github.com/Brianthas/PF2e-Dual-Class), under the MIT license. Original attribution is retained in [LICENSE](LICENSE) and [UPSTREAM.md](UPSTREAM.md).

Independent community module; not an official PF2e system or upstream release. PF2e Relics and the PF2e system supply referenced game content and retain their own licenses.
