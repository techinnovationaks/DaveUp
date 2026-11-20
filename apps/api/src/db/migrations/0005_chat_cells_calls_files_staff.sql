-- Chat (direct messages), cells (church groups with a shared chat), audio and
-- video calls, shared files, and DaveUp staff (super administrators).
--
-- Everything church-scoped carries church_id and the same row-level security
-- policy as the core tables, so people only ever see their own church's data.

-- ---------- DaveUp staff ----------

-- Platform staff who verify and suspend churches. Not church-scoped, and the
-- app role cannot read or change it. SUPER_ADMIN_EMAILS can also name staff.
ALTER TABLE person ADD COLUMN is_super_admin boolean NOT NULL DEFAULT false;

-- Staff actions (granting staff access) are not tied to one church.
ALTER TABLE audit_log ALTER COLUMN church_id DROP NOT NULL;

-- ---------- Conversations ----------

-- A conversation is either a direct chat between two members ("direct") or a
-- cell: a named group run by its leaders, with a shared chat, files and calls.
CREATE TABLE conversation (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id        uuid NOT NULL REFERENCES church(id),
  kind             text NOT NULL CHECK (kind IN ('direct', 'cell')),
  name             text CHECK (char_length(name) <= 80),
  description      text CHECK (char_length(description) <= 500),
  -- direct chats only: "<lower person id>:<higher person id>", one chat per pair
  direct_key       text,
  created_by       uuid NOT NULL REFERENCES person(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_message_at  timestamptz NOT NULL DEFAULT now(),
  archived_at      timestamptz,
  CHECK ((kind = 'direct') = (direct_key IS NOT NULL)),
  CHECK (kind <> 'cell' OR name IS NOT NULL)
);
CREATE UNIQUE INDEX conversation_direct_unique ON conversation (church_id, direct_key) WHERE direct_key IS NOT NULL;
CREATE INDEX conversation_church_kind_idx ON conversation (church_id, kind);

CREATE TABLE conversation_member (
  conversation_id  uuid NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  church_id        uuid NOT NULL REFERENCES church(id),
  person_id        uuid NOT NULL REFERENCES person(id),
  -- cells: leaders manage members; direct chats: both are "member"
  role             text NOT NULL DEFAULT 'member' CHECK (role IN ('leader', 'member')),
  -- highest message seq this person has read
  last_read_seq    bigint NOT NULL DEFAULT 0,
  added_by         uuid REFERENCES person(id),
  added_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, person_id)
);
CREATE INDEX conversation_member_person_idx ON conversation_member (person_id);

-- ---------- Files ----------

-- Files shared in a conversation. The bytes live in object storage (S3/R2, or
-- local disk in development) under storage_key; this row controls access.
-- "pending" until the upload is confirmed.
CREATE TABLE shared_file (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id        uuid NOT NULL REFERENCES church(id),
  conversation_id  uuid NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  uploader_id      uuid NOT NULL REFERENCES person(id),
  name             text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  mime             text NOT NULL,
  size_bytes       bigint NOT NULL CHECK (size_bytes > 0),
  storage_key      text NOT NULL UNIQUE,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'deleted')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  ready_at         timestamptz,
  deleted_at       timestamptz
);
CREATE INDEX shared_file_conversation_idx ON shared_file (conversation_id, created_at DESC) WHERE status = 'ready';

-- ---------- Calls ----------

-- One audio or video call in a conversation, hosted in a LiveKit room.
CREATE TABLE call_session (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id        uuid NOT NULL REFERENCES church(id),
  conversation_id  uuid NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  started_by       uuid NOT NULL REFERENCES person(id),
  media            text NOT NULL CHECK (media IN ('audio', 'video')),
  room_name        text NOT NULL UNIQUE,
  started_at       timestamptz NOT NULL DEFAULT now(),
  -- set when someone other than the caller first joins
  answered_at      timestamptz,
  ended_at         timestamptz
);
-- at most one live call per conversation
CREATE UNIQUE INDEX call_one_active ON call_session (conversation_id) WHERE ended_at IS NULL;

CREATE TABLE call_participant (
  call_id    uuid NOT NULL REFERENCES call_session(id) ON DELETE CASCADE,
  church_id  uuid NOT NULL REFERENCES church(id),
  person_id  uuid NOT NULL REFERENCES person(id),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  left_at    timestamptz,
  PRIMARY KEY (call_id, person_id)
);

-- ---------- Messages ----------

CREATE TABLE message (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- strict order within the platform; used for paging and read markers
  seq              bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  church_id        uuid NOT NULL REFERENCES church(id),
  conversation_id  uuid NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  -- null for system messages (for example "Grace added Paul")
  sender_id        uuid REFERENCES person(id),
  kind             text NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'file', 'call', 'system')),
  body             text CHECK (char_length(body) <= 4000),
  file_id          uuid REFERENCES shared_file(id),
  call_id          uuid REFERENCES call_session(id),
  data             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  edited_at        timestamptz,
  deleted_at       timestamptz,
  CHECK (kind <> 'text' OR body IS NOT NULL OR deleted_at IS NOT NULL),
  CHECK (kind <> 'file' OR file_id IS NOT NULL),
  CHECK (kind <> 'call' OR call_id IS NOT NULL)
);
CREATE INDEX message_conversation_seq_idx ON message (conversation_id, seq DESC);

-- ---------- Row-level security ----------

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['conversation','conversation_member','shared_file','call_session','call_participant','message'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (church_id = current_setting(''app.church_id'', true)::uuid) WITH CHECK (church_id = current_setting(''app.church_id'', true)::uuid)',
      t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON conversation, shared_file, call_session, call_participant, message TO daveup_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON conversation_member TO daveup_app;
GRANT USAGE ON SEQUENCE message_seq_seq TO daveup_app;
