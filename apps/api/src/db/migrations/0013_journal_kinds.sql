-- Journal entries get a kind (N design 174) and say whether they are about
-- faith, impact, or both (the "This is about" choice). Additive only.
ALTER TABLE journal_entry ADD COLUMN kind text NOT NULL DEFAULT 'reflection'
  CHECK (kind IN ('reflection','prayer','gratitude','god_said','correction','work_win'));
ALTER TABLE journal_entry ADD COLUMN about_faith boolean NOT NULL DEFAULT false;
ALTER TABLE journal_entry ADD COLUMN about_impact boolean NOT NULL DEFAULT false;
