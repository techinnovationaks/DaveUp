-- Journal: each person's private notes. Belongs to the person, not to an
-- organization, so it follows them if they belong to several. An entry can be
-- shared with the discipler of one of their discipleship relationships; only
-- that discipler (and the writer) can then read it. Owner connection only.

CREATE TABLE journal_entry (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id              uuid NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  title                  text CHECK (title IS NULL OR char_length(title) <= 120),
  body                   text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 20000),
  shared_relationship_id uuid REFERENCES relationship(id) ON DELETE SET NULL,
  shared_at              timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX journal_entry_person_idx ON journal_entry (person_id, created_at DESC);
CREATE INDEX journal_entry_shared_idx ON journal_entry (shared_relationship_id, created_at DESC) WHERE shared_relationship_id IS NOT NULL;
