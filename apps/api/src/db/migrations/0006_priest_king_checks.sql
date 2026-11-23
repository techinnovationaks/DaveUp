-- Priest and King (PRD 38.26). A monthly check now asks one item per area,
-- Priest or King by turns, chosen by `check_round` (the how-manyth check: see
-- itemsFor in @daveup/shared). Checks opened before this keep `item_index` and
-- their original rule, so answers already given still match their questions.
-- Additive only.

ALTER TABLE assessment ADD COLUMN check_round smallint CHECK (check_round >= 1);
ALTER TABLE assessment DROP CONSTRAINT assessment_kind_items;
ALTER TABLE assessment ADD CONSTRAINT assessment_kind_items
  CHECK ((kind = 'check') = (item_index IS NOT NULL OR check_round IS NOT NULL));

ALTER TABLE assessment_cycle ADD COLUMN check_round smallint CHECK (check_round >= 1);
ALTER TABLE assessment_cycle DROP CONSTRAINT assessment_cycle_check;
ALTER TABLE assessment_cycle ADD CONSTRAINT assessment_cycle_kind_items
  CHECK ((kind = 'check') = (item_index IS NOT NULL OR check_round IS NOT NULL));
