#!/usr/bin/env bash
# Testa migrations + RLS em um Postgres local descartável. Uso: bash supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
PGBIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1)
D=$(mktemp -d); chmod 777 "$D"
RUN="$PGBIN/initdb -D $D/data -A trust -U postgres >/dev/null"
if [ "$(id -u)" = 0 ]; then
  id pgtest >/dev/null 2>&1 || useradd -m pgtest
  chown pgtest "$D"
  su pgtest -c "$PGBIN/initdb -D $D/data -A trust -U postgres >/dev/null"
  su pgtest -c "$PGBIN/pg_ctl -D $D/data -o '-p 54329 -k $D' -l $D/log -w start >/dev/null"
else
  eval "$RUN"; "$PGBIN/pg_ctl" -D "$D/data" -o "-p 54329 -k $D" -l "$D/log" -w start >/dev/null
fi
trap '"$PGBIN/pg_ctl" -D "$D/data" -m immediate stop >/dev/null 2>&1 || su pgtest -c "$PGBIN/pg_ctl -D $D/data -m immediate stop" >/dev/null 2>&1 || true' EXIT
P="psql -h $D -p 54329 -U postgres -v ON_ERROR_STOP=1 -q"
$P -c "create database t" ; P="$P -d t"
$P -f tests/00_stub_supabase.sql
for f in migrations/*.sql demo/seed_demo.sql; do echo "→ $f"; $P -f "$f"; done
echo "→ testes"; $P -f tests/01_rls_test.sql; $P -f tests/02_encartes_test.sql; $P -f tests/03_listas_test.sql
echo "OK: todos os testes de banco passaram"
