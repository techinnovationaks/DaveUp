-- Monthly cycle, growth plans, weekly practice, reflection and meetings
-- (PRD 8.2 to 8.5, 38.3, 38.19). Additive only: existing rows keep working.

-- ---------- Monthly cycle ----------

-- An assessment is either the full 60 questions or the 12-question monthly
-- check, which asks item `item_index` of every area.
ALTER TABLE assessment
  ADD COLUMN kind text NOT NULL DEFAULT 'full' CHECK (kind IN ('full','check')),
  ADD COLUMN item_index smallint CHECK (item_index BETWEEN 1 AND 5),
  ADD COLUMN cycle_id uuid;
ALTER TABLE assessment ADD CONSTRAINT assessment_kind_items CHECK ((kind = 'check') = (item_index IS NOT NULL));

-- Cycle N is due N months after the relationship became active. The baseline
-- is cycle 0 and stays on relationship.baseline_a_id / baseline_b_id.
CREATE TABLE assessment_cycle (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id        uuid NOT NULL REFERENCES church(id),
  relationship_id  uuid NOT NULL REFERENCES relationship(id),
  number           int NOT NULL CHECK (number >= 1),
  kind             text NOT NULL CHECK (kind IN ('full','check')),
  item_index       smallint CHECK (item_index BETWEEN 1 AND 5),
  due_on           date NOT NULL,
  test_a_id        uuid REFERENCES assessment(id),
  test_b_id        uuid REFERENCES assessment(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  UNIQUE (relationship_id, number),
  CHECK ((kind = 'check') = (item_index IS NOT NULL))
);
ALTER TABLE assessment ADD CONSTRAINT assessment_cycle_fk FOREIGN KEY (cycle_id) REFERENCES assessment_cycle(id);
CREATE INDEX assessment_cycle_open_idx ON assessment_cycle (church_id, relationship_id) WHERE completed_at IS NULL;

-- "One open assessment" rules now apply to baselines only; each cycle has at
-- most one assessment per version.
DROP INDEX assessment_one_open_b;
DROP INDEX assessment_one_open_a;
CREATE UNIQUE INDEX assessment_one_open_b ON assessment (respondent_id) WHERE version = 'B' AND status = 'in_progress' AND cycle_id IS NULL;
CREATE UNIQUE INDEX assessment_one_open_a ON assessment (relationship_id) WHERE version = 'A' AND status = 'in_progress' AND cycle_id IS NULL;
CREATE UNIQUE INDEX assessment_one_per_cycle ON assessment (cycle_id, version) WHERE cycle_id IS NOT NULL;

-- ---------- Growth plan ----------

-- At most one active and one draft plan per relationship. A draft becomes
-- active when both people have confirmed it; the old active plan is replaced.
CREATE TABLE growth_plan (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id                  uuid NOT NULL REFERENCES church(id),
  relationship_id            uuid NOT NULL REFERENCES relationship(id),
  status                     text NOT NULL CHECK (status IN ('draft','active','replaced','discarded')),
  focus_areas                smallint[] NOT NULL CHECK (cardinality(focus_areas) BETWEEN 1 AND 3),
  length_days                smallint NOT NULL CHECK (length_days IN (30, 60, 90)),
  starts_on                  date,
  ends_on                    date,
  edited_by                  uuid NOT NULL REFERENCES person(id),
  confirmed_by_disciple_at   timestamptz,
  confirmed_by_discipler_at  timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX growth_plan_one_draft ON growth_plan (relationship_id) WHERE status = 'draft';
CREATE UNIQUE INDEX growth_plan_one_active ON growth_plan (relationship_id) WHERE status = 'active';

CREATE TABLE plan_practice (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id       uuid NOT NULL REFERENCES church(id),
  plan_id         uuid NOT NULL REFERENCES growth_plan(id) ON DELETE CASCADE,
  position        smallint NOT NULL,
  title           text NOT NULL,
  detail          text,
  times_per_week  smallint NOT NULL CHECK (times_per_week BETWEEN 1 AND 7),
  area            smallint CHECK (area BETWEEN 1 AND 12)
);
CREATE INDEX plan_practice_plan_idx ON plan_practice (plan_id, position);

-- One row per practice per day the disciple ticked it.
CREATE TABLE practice_log (
  practice_id  uuid NOT NULL REFERENCES plan_practice(id) ON DELETE CASCADE,
  church_id    uuid NOT NULL REFERENCES church(id),
  day          date NOT NULL,
  done_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (practice_id, day)
);

-- Weekly reflection by the disciple, shared with their discipler (PRD 8.3).
-- Private journals are a separate feature and never shared.
CREATE TABLE reflection (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id        uuid NOT NULL REFERENCES church(id),
  relationship_id  uuid NOT NULL REFERENCES relationship(id),
  week_start       date NOT NULL,
  did              text,
  difficult        text,
  changed          text,
  need_help        text,
  author_id        uuid NOT NULL REFERENCES person(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (relationship_id, week_start)
);

-- ---------- Meetings ----------

-- Scheduled meeting plus its one-minute record (PRD 8.4, 38.3).
CREATE TABLE meeting (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id        uuid NOT NULL REFERENCES church(id),
  relationship_id  uuid NOT NULL REFERENCES relationship(id),
  scheduled_at     timestamptz NOT NULL,
  place            text,
  agenda           text,
  status           text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','held','missed','cancelled')),
  created_by       uuid NOT NULL REFERENCES person(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  took_place       boolean,
  discussed        text,
  commitment       text,
  prayer           text,
  win              text,
  recorded_by      uuid REFERENCES person(id),
  recorded_at      timestamptz
);
CREATE INDEX meeting_relationship_idx ON meeting (church_id, relationship_id, scheduled_at);

-- ---------- Row-level security and grants ----------

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['assessment_cycle','growth_plan','plan_practice','practice_log','reflection','meeting'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (church_id = current_setting(''app.church_id'', true)::uuid) WITH CHECK (church_id = current_setting(''app.church_id'', true)::uuid)',
      t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON assessment_cycle, growth_plan, reflection, meeting TO daveup_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON plan_practice, practice_log TO daveup_app;
