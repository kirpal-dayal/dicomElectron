#!/bin/sh
set -eu

SQL_DIR="/docker-entrypoint-initdb.d"
SCHEMA_IN="${SQL_DIR}/creacion_tablas_v07.sql.in"

: "${MYSQL_DATABASE:?MYSQL_DATABASE no definida}"
: "${MYSQL_USER:?MYSQL_USER no definida}"
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD no definida}"

APP_KEY="${ENCRYPTION_KEY:-${APP_ENCRYPTION_KEY:-}}"
[ -n "$APP_KEY" ] || { echo "[INIT][ERROR] Falta ENCRYPTION_KEY (o APP_ENCRYPTION_KEY)"; exit 1; }

echo "[INIT] Sembrando esquema con @APP_KEY (normalizando CRLF) vía socket..."

printf "SET @APP_KEY := '%s';\n" "$APP_KEY" > /tmp/init.sql

if [ -f "$SCHEMA_IN" ]; then
  tr -d '\r' < "$SCHEMA_IN" >> /tmp/init.sql
  printf "\n" >> /tmp/init.sql
else
  echo "[INIT][ERROR] No existe $SCHEMA_IN dentro del contenedor."
  exit 1
fi

mysql --protocol=socket \
  -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" \
  --socket=/var/run/mysqld/mysqld.sock \
  "$MYSQL_DATABASE" --skip-line-numbers --batch < /tmp/init.sql

echo "[INIT] Schema + seed aplicado correctamente."