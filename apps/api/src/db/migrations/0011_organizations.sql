-- One person, several organizations (one email, one account). Each signed-in
-- session remembers which organization it is looking at; everything a request
-- touches (spaces, messages, calls, people) stays inside that organization, so
-- conversations in one are never visible from another.
--
-- Blocking is between people, whatever organization: neither can start a chat,
-- message, share files with or call the other, and they no longer appear in
-- each other's people lists.

DROP INDEX IF EXISTS membership_one_current;
CREATE UNIQUE INDEX membership_one_per_church ON membership (person_id, church_id) WHERE status IN ('pending','approved');

ALTER TABLE session ADD COLUMN active_church_id uuid REFERENCES church(id);

CREATE TABLE person_block (
  blocker_id uuid NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX person_block_blocked_idx ON person_block (blocked_id);

-- Organizations appear in the public search unless their administrators turn it off.
ALTER TABLE church ADD COLUMN listed boolean NOT NULL DEFAULT true;
