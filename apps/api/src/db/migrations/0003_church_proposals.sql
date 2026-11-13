-- Church-suggested pairings (PRD 34.3 "assign a discipler", 6.3 consent).
-- An administrator can suggest a discipler for a member, but nobody is
-- enrolled without agreeing: both people accept, and the disciple confirms
-- what will be shared. Additive only.

ALTER TABLE relationship DROP CONSTRAINT relationship_initiated_by_check;
ALTER TABLE relationship ADD CONSTRAINT relationship_initiated_by_check CHECK (initiated_by IN ('disciple','discipler','church'));

ALTER TABLE relationship
  ADD COLUMN proposed_by            uuid REFERENCES person(id),
  ADD COLUMN discipler_accepted_at  timestamptz,
  ADD COLUMN disciple_accepted_at   timestamptz;
ALTER TABLE relationship ADD CONSTRAINT relationship_church_proposer CHECK ((initiated_by = 'church') = (proposed_by IS NOT NULL));
