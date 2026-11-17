# PF2e Gestalt 1.0.0

First public release, built from the user-tested 0.3.7 preview.

- Dual Class with separate class feats, features, DCs and a second-class boost selector.
- Ancestry Paragon and Skill Paragon automation.
- Relics configured on individual items, with aspect limits and level-based gift allowances.
- Separate GM permissions for players to select aspects and/or gifts.
- Optional Pathmuncher 2.0.1 integration.

Requires Foundry VTT 14 and PF2e 8.7.0, with libWrapper enabled. The development target is Foundry 14 build 369. Enable PF2e Relics for the full gift catalog.

**Install:** Copy the URL of the attached `module.json` into Foundry's Install Module manifest field. Do not use GitHub's automatically generated source ZIP as the module package.

**Upgrade:** Existing previews use the same module ID and retain saved settings and character/item data. For manual installation, replace `Data/modules/pf2e-gestalt` with the folder in the attached `pf2e-gestalt.zip`, restart the world, and have all clients reload.

103 local behavioral checks pass. The module owner reports successful live use; not all class pairings or third-party modules have been exhaustively tested. Spellcasting setup remains manual. See README and VALIDATION for limitations.
