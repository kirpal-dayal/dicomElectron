#!/bin/sh
set -eu

# === Rutas dentro del contenedor ===
SQL_DIR="/docker-entrypoint-initdb.d"
# Monta tu schema como 'creacion_tablas_v07.sql.in' para que el entrypoint NO lo ejecute solo.
SCHEMA_IN="${SQL_DIR}/creacion_tablas_v07.sql.in"

# === Variables requeridas del entorno ===
: "${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD no definida}"

# Usa ENCRYPTION_KEY (recomendado). Fallback a APP_ENCRYPTION_KEY por compatibilidad.
APP_KEY="${ENCRYPTION_KEY:-${APP_ENCRYPTION_KEY:-}}"
[ -n "$APP_KEY" ] || { echo "[INIT][ERROR] Falta ENCRYPTION_KEY (o APP_ENCRYPTION_KEY)"; exit 1; }

echo "[INIT] Sembrando esquema con @APP_KEY (normalizando CRLF) vía socket..."

# 1) Ensambla un SQL temporal: primero define @APP_KEY
# (OJO: imprimimos literal la clave, por eso las comillas simples)
printf "SET @APP_KEY := '%s';\n" "$APP_KEY" > /tmp/init.sql

# 2) Adjunta el schema, eliminando CRLF -> LF si vienes de Windows
if [ -f "$SCHEMA_IN" ]; then
  tr -d '\r' < "$SCHEMA_IN" >> /tmp/init.sql
  printf "\n" >> /tmp/init.sql
else
  echo "[INIT][ERROR] No existe $SCHEMA_IN dentro del contenedor."
  exit 1
fi

# 3) Ejecuta TODO en una sola sesión sobre el servidor temporal (vía socket)
mysql -uroot -p"$MYSQL_ROOT_PASSWORD" \
  --socket=/var/run/mysqld/mysqld.sock \
  --skip-line-numbers --batch < /tmp/init.sql

echo "[INIT] Schema + seed aplicado correctamente."
