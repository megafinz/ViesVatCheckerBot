#!/usr/bin/env sh
set -eu

: "${DATABASE_NAME:?Set DATABASE_NAME}"
: "${DATABASE_MIGRATOR_USER:?Set DATABASE_MIGRATOR_USER}"
: "${DATABASE_MIGRATOR_PASSWORD:?Set DATABASE_MIGRATOR_PASSWORD}"
: "${DATABASE_RUNTIME_USER:?Set DATABASE_RUNTIME_USER}"
: "${DATABASE_RUNTIME_PASSWORD:?Set DATABASE_RUNTIME_PASSWORD}"

create_or_update_role() {
  role_name="$1"
  role_password="$2"

  psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    --set role_name="$role_name" \
    --set role_password="$role_password" <<'SQL'
select format('create role %I login password %L', :'role_name', :'role_password')
where not exists (select 1 from pg_roles where rolname = :'role_name')
\gexec
alter role :"role_name" with login password :'role_password';
SQL
}

create_or_update_role "$DATABASE_MIGRATOR_USER" "$DATABASE_MIGRATOR_PASSWORD"
create_or_update_role "$DATABASE_RUNTIME_USER" "$DATABASE_RUNTIME_PASSWORD"

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set database_name="$DATABASE_NAME" \
  --set migrator_role="$DATABASE_MIGRATOR_USER" \
  --set runtime_role="$DATABASE_RUNTIME_USER" <<'SQL'
grant connect, create on database :"database_name" to :"migrator_role";
grant connect on database :"database_name" to :"runtime_role";

\connect :"database_name"

grant usage, create on schema public to :"migrator_role";
grant usage on schema public to :"runtime_role";
SQL
