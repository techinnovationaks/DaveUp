-- Runs once when the dev database volume is first created.
-- daveup_owner (the POSTGRES_USER) owns the schema and runs migrations.
-- daveup_app is what the API uses for church-scoped requests. It is NOT the
-- table owner, so row-level security policies apply to it.
CREATE ROLE daveup_app LOGIN PASSWORD 'daveup_app_dev';
GRANT CONNECT ON DATABASE daveup TO daveup_app;

-- Separate database for the API integration tests.
CREATE DATABASE daveup_test OWNER daveup_owner;
GRANT CONNECT ON DATABASE daveup_test TO daveup_app;
