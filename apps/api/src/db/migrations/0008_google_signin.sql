-- Sign in with Google. A Google account is linked to a person by its stable
-- subject id ("sub"), so it keeps working if the person later changes the
-- email on either side. The first Google sign-in links by verified email.
-- Additive only.
alter table person add column if not exists google_sub text;
create unique index if not exists person_google_sub_key on person (google_sub) where google_sub is not null;
