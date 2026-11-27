-- Training and the Resource Centre. Content belongs either to DaveUp
-- (church_id NULL: every organization sees it, DaveUp staff manage it) or to
-- one organization (its members see it, its administrators manage it). Read
-- and written through the owner connection with explicit checks, because
-- DaveUp content has no organization.

-- Files attached to resources and lessons (bytes in the same storage as chat files).
CREATE TABLE library_file (
  id          uuid PRIMARY KEY,
  church_id   uuid REFERENCES church(id),
  uploader_id uuid NOT NULL REFERENCES person(id),
  name        text NOT NULL,
  mime        text NOT NULL,
  size_bytes  bigint NOT NULL CHECK (size_bytes > 0),
  storage_key text NOT NULL UNIQUE,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE resource (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id   uuid REFERENCES church(id),
  title       text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  description text CHECK (description IS NULL OR char_length(description) <= 2000),
  category    text NOT NULL DEFAULT 'General' CHECK (char_length(category) BETWEEN 1 AND 60),
  kind        text NOT NULL CHECK (kind IN ('file','link','video')),
  url         text CHECK (url IS NULL OR char_length(url) <= 1000),
  file_id     uuid REFERENCES library_file(id),
  created_by  uuid NOT NULL REFERENCES person(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'file') = (file_id IS NOT NULL)),
  CHECK ((kind = 'file') OR url IS NOT NULL)
);
CREATE INDEX resource_church_idx ON resource (church_id, category, created_at DESC);

CREATE TABLE course (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id   uuid REFERENCES church(id),
  title       text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  summary     text CHECK (summary IS NULL OR char_length(summary) <= 2000),
  published   boolean NOT NULL DEFAULT false,
  created_by  uuid NOT NULL REFERENCES person(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX course_church_idx ON course (church_id, created_at DESC);

CREATE TABLE lesson (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id        uuid NOT NULL REFERENCES course(id) ON DELETE CASCADE,
  position         integer NOT NULL,
  title            text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  body             text NOT NULL DEFAULT '' CHECK (char_length(body) <= 50000),
  video_url        text CHECK (video_url IS NULL OR char_length(video_url) <= 1000),
  file_id          uuid REFERENCES library_file(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lesson_course_idx ON lesson (course_id, position);

CREATE TABLE lesson_progress (
  person_id    uuid NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  lesson_id    uuid NOT NULL REFERENCES lesson(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (person_id, lesson_id)
);
