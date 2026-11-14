-- Email sign-in (primary) and email notifications through Brevo.
-- Additive: existing phone accounts keep working unchanged.

-- ---------- People: email as an identity ----------

-- A person signs in with a verified email, a phone number, or both.
ALTER TABLE person ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE person
  ADD COLUMN email_verified_at timestamptz,
  ADD COLUMN notify_email boolean NOT NULL DEFAULT true;
ALTER TABLE person ADD CONSTRAINT person_has_contact CHECK (phone IS NOT NULL OR email IS NOT NULL);

-- Emails entered before this migration were never verified. Normalise them and
-- drop duplicates (keeping the oldest) so the unique index below can be built.
UPDATE person SET email = lower(trim(email)) WHERE email IS NOT NULL;
UPDATE person p SET email = NULL
WHERE p.email IS NOT NULL
  AND EXISTS (SELECT 1 FROM person q WHERE q.email = p.email AND q.created_at < p.created_at)
  AND p.phone IS NOT NULL;
CREATE UNIQUE INDEX person_email_unique ON person (email) WHERE email IS NOT NULL;

-- ---------- Codes: by SMS or by email ----------

-- Each code goes to exactly one destination. "change_email" codes belong to a
-- signed-in person confirming a new address.
ALTER TABLE otp_challenge ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE otp_challenge
  ADD COLUMN email text,
  ADD COLUMN purpose text NOT NULL DEFAULT 'signin' CHECK (purpose IN ('signin', 'change_email')),
  ADD COLUMN person_id uuid REFERENCES person(id) ON DELETE CASCADE;
ALTER TABLE otp_challenge ADD CONSTRAINT otp_one_destination CHECK ((phone IS NULL) <> (email IS NULL));
ALTER TABLE otp_challenge ADD CONSTRAINT otp_change_has_person CHECK (purpose <> 'change_email' OR person_id IS NOT NULL);
CREATE INDEX otp_challenge_email_idx ON otp_challenge (email, created_at DESC) WHERE email IS NOT NULL;

-- ---------- Notifications: transactional outbox ----------

-- Queued in the same transaction as the event, delivered by a background
-- sender with retries. Holds names and links only: never scores, answers,
-- reflections or meeting notes.
CREATE TABLE notification (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id        uuid NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  church_id        uuid REFERENCES church(id),
  kind             text NOT NULL,
  data             jsonb NOT NULL DEFAULT '{}'::jsonb,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'skipped', 'failed')),
  attempts         int NOT NULL DEFAULT 0,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  sent_at          timestamptz
);
CREATE INDEX notification_due_idx ON notification (next_attempt_at) WHERE status = 'pending';
CREATE INDEX notification_person_idx ON notification (person_id, created_at DESC);

-- The app role may only queue notifications. It cannot read anyone's, and the
-- sender runs on the owner connection.
GRANT INSERT ON notification TO daveup_app;
GRANT SELECT (email_verified_at, notify_email) ON person TO daveup_app;
