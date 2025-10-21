#!/bin/sh
set -e

mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" <<SQL
SET @APP_KEY = '${APP_ENCRYPTION_KEY}';

INSERT INTO admin (id_admin, nombre_admin, contrasena_admin, fecha_creacion)
VALUES ('A9856KIMU', 'AdminAdmin', AES_ENCRYPT('A9856KIMU', @APP_KEY), NOW());

INSERT INTO doctor (id, nombre_doc, contrasena_doc, id_adminCreador, fecha_creacion)
VALUES ('D8931NEDE', 'DoctorDoctor', AES_ENCRYPT('D8931NEDE', @APP_KEY), 'A9856KIMU', NOW());
SQL
