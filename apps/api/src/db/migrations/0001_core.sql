-- DaveUp core schema: people, churches, membership, discipler status,
-- relationships, assessments, audit log.
--
-- Tenancy: every church-scoped table has church_id and a row-level security
-- policy keyed on the app.church_id setting, which the API sets per
-- transaction. If the setting is missing, current_setting(..., true) is NULL
-- and the policy matches no rows: it fails closed.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- Global (not church-scoped) ----------

CREATE TABLE person (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       text NOT NULL UNIQUE,              -- E.164
  full_name   text,
  email       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE otp_challenge (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone        text NOT NULL,
  code_hash    text NOT NULL,
  expires_at   timestamptz NOT NULL,
  attempts     int NOT NULL DEFAULT 0,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_challenge_phone_idx ON otp_challenge (phone, created_at DESC);

CREATE TABLE session (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id   uuid NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz
);
CREATE INDEX session_person_idx ON session (person_id);

CREATE TABLE church (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  city        text NOT NULL,
  join_code   text NOT NULL UNIQUE,   -- identifies the church only; never grants a role (PRD 6.1)
  plan        text NOT NULL DEFAULT 'basic' CHECK (plan IN ('basic','standard','pro','network')),
  -- PRD 29.2: a church registers, then DaveUp staff verify it before it is listed.
  status      text NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified','verified','suspended')),
  verified_at timestamptz,
  created_by  uuid NOT NULL REFERENCES person(id),
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------- Church-scoped ----------

CREATE TABLE membership (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id      uuid NOT NULL REFERENCES church(id),
  person_id      uuid NOT NULL REFERENCES person(id),
  status         text NOT NULL CHECK (status IN ('pending','approved','rejected','left')),
  participation  text NOT NULL CHECK (participation IN ('grow','disciple','both')),
  department     text,
  is_admin       boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  decided_at     timestamptz,
  decided_by     uuid REFERENCES person(id)
);
-- one current church per person
CREATE UNIQUE INDEX membership_one_current ON membership (person_id) WHERE status IN ('pending','approved');
CREATE INDEX membership_church_status_idx ON membership (church_id, status);

CREATE TABLE discipler_status (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id     uuid NOT NULL REFERENCES church(id),
  person_id     uuid NOT NULL REFERENCES person(id),
  status        text NOT NULL CHECK (status IN ('requested','approved','rejected','suspended','revoked')),
  note          text,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz,
  decided_by    uuid REFERENCES person(id),
  UNIQUE (church_id, person_id)
);

CREATE TABLE relationship (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id                uuid NOT NULL REFERENCES church(id),
  discipler_id             uuid NOT NULL REFERENCES person(id),
  disciple_id              uuid NOT NULL REFERENCES person(id),
  status                   text NOT NULL CHECK (status IN ('requested','accepted_baseline_pending','active','paused','ended','declined')),
  initiated_by             text NOT NULL CHECK (initiated_by IN ('disciple','discipler')),
  disclosure_confirmed_at  timestamptz,  -- disciple confirmed what the discipler will see (PRD 6.7 rule 2)
  baseline_a_id            uuid,         -- discipler's Test A for this relationship
  baseline_b_id            uuid,         -- disciple's Test B used for this relationship
  created_at               timestamptz NOT NULL DEFAULT now(),
  accepted_at              timestamptz,
  activated_at             timestamptz,
  ended_at                 timestamptz,
  end_reason               text,
  CHECK (discipler_id <> disciple_id)
);
-- PRD 6: each disciple has one active primary discipler
CREATE UNIQUE INDEX relationship_one_primary ON relationship (disciple_id)
  WHERE status IN ('accepted_baseline_pending','active','paused');
-- no duplicate open requests between the same pair
CREATE UNIQUE INDEX relationship_one_open_request ON relationship (discipler_id, disciple_id)
  WHERE status = 'requested';
CREATE INDEX relationship_discipler_idx ON relationship (church_id, discipler_id, status);
CREATE INDEX relationship_disciple_idx ON relationship (church_id, disciple_id, status);

CREATE TABLE assessment (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id        uuid NOT NULL REFERENCES church(id),
  version          char(1) NOT NULL CHECK (version IN ('A','B')),
  respondent_id    uuid NOT NULL REFERENCES person(id),
  subject_id       uuid NOT NULL REFERENCES person(id),
  relationship_id  uuid REFERENCES relationship(id),
  status           text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted')),
  started_at       timestamptz NOT NULL DEFAULT now(),
  submitted_at     timestamptz,
  -- Test B is about oneself; Test A is about a disciple within a relationship
  CHECK ((version = 'B' AND respondent_id = subject_id) OR (version = 'A' AND respondent_id <> subject_id AND relationship_id IS NOT NULL))
);
CREATE UNIQUE INDEX assessment_one_open_b ON assessment (respondent_id) WHERE version = 'B' AND status = 'in_progress';
CREATE UNIQUE INDEX assessment_one_open_a ON assessment (relationship_id) WHERE version = 'A' AND status = 'in_progress';
CREATE INDEX assessment_respondent_idx ON assessment (church_id, respondent_id, version, status);

ALTER TABLE relationship
  ADD CONSTRAINT relationship_baseline_a_fk FOREIGN KEY (baseline_a_id) REFERENCES assessment(id),
  ADD CONSTRAINT relationship_baseline_b_fk FOREIGN KEY (baseline_b_id) REFERENCES assessment(id);

CREATE TABLE assessment_answer (
  assessment_id  uuid NOT NULL REFERENCES assessment(id) ON DELETE CASCADE,
  church_id      uuid NOT NULL REFERENCES church(id),
  item_id        text NOT NULL,
  value          smallint CHECK (value BETWEEN 0 AND 4),
  no_occasion    boolean NOT NULL DEFAULT false,
  evidence       text,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (assessment_id, item_id),
  CHECK (no_occasion OR value IS NOT NULL)
);

-- Append-only record of enrolment, capacity, approval and transfer decisions (PRD 11.3).
CREATE TABLE audit_log (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  church_id    uuid NOT NULL REFERENCES church(id),
  actor_id     uuid REFERENCES person(id),
  action       text NOT NULL,
  target_type  text NOT NULL,
  target_id    uuid,
  data         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_church_idx ON audit_log (church_id, created_at DESC);

-- ---------- Row-level security ----------

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['membership','discipler_status','relationship','assessment','assessment_answer','audit_log'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (church_id = current_setting(''app.church_id'', true)::uuid) WITH CHECK (church_id = current_setting(''app.church_id'', true)::uuid)',
      t);
  END LOOP;
END $$;

-- The app role can read and write church-scoped data (subject to RLS),
-- read the church row and person names, but cannot touch auth tables.
GRANT USAGE ON SCHEMA public TO daveup_app;
GRANT SELECT, INSERT, UPDATE ON membership, discipler_status, relationship, assessment, assessment_answer TO daveup_app;
GRANT SELECT, INSERT ON audit_log TO daveup_app;
GRANT SELECT ON church TO daveup_app;
GRANT SELECT (id, full_name, email, phone) ON person TO daveup_app;
GRANT UPDATE (full_name, email, updated_at) ON person TO daveup_app;
