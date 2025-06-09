-- Inserciones basicas de usurios y expedientes
insert into `fibrosis_v06`.`admin`(id_admin, nombre_admin, contrasena_admin, fecha_creacion)
values ('A9856KIMU', 'Kirpal Muñoz Ramos', AES_ENCRYPT('A9856KIMU', 'tu_llave'), now()); -- consulta reglas para los ids

select * from `fibrosis_v06`.`admin`; -- Comprobar la encriptacion

-- Comprobar la desencriptacion
SELECT 
  id_admin, 
  nombre_admin, 
  CAST(AES_DECRYPT(contrasena_admin, 'tu_llave') AS CHAR) AS contrasena_desencriptada
FROM fibrosis_v06.admin
WHERE id_admin = 'A9856KIMU';

insert into `fibrosis_v06`.`doctor`(id, nombre_doc, contrasena_doc, id_adminCreador, fecha_creacion)
values ('D8931NEDE', 'Nelly Berenice Delgado Angeles', AES_ENCRYPT('D8931NEDE', 'tu_llave'), 'A9856KIMU', now());

select * from `fibrosis_v06`.`doctor`;

insert into `fibrosis_v06`.`expediente`(nss, sexo, fecha_creacion, fecha_nacimiento, id_docCreador)
values('222222222222222', 0, now(), '2000-01-01', 'D8931NEDE');