-- Registros de prueba, hasta los inserts de estudio no deberia de haber problema
-- los inserts de imagen van a depender de cómo funcionará la insercion de imagenes de las 
-- tomografias en el sistema.
-- Nota: Ejecutar despues de las creaciones de tablas
insert into `fibrosis_v05`.`admin`(id_admin, nombre_admin, contrasena_admin, fecha_creacion)
values ('0000000000', 'primer_admin', '0000000000', now());

select * from `fibrosis_v05`.`admin`;

insert into `fibrosis_v05`.`doctor`(id, nombre_doc, contrasena_doc, id_adminCreador, fecha_creacion)
values ('1111111111', 'primer_doc', '1111111111', '0000000000', now());

select * from `fibrosis_v05`.`doctor`;

insert into `fibrosis_v05`.`expediente`(nss, sexo, fecha_creacion, fecha_nacimiento, id_docCreador)
values('222222222222222', 0, now(), '2000-01-01', '1111111111');

select * from `fibrosis_v05`.`expediente`;

insert into `fibrosis_v05`.`estudio`(fecha, nss_expediente, descripcion, volumen_automatico, volumen_manual)
values(now(), '222222222222222', 'Se observa fibrosis', 78.5, 75.25);

select * from `fibrosis_v05`.`estudio`;

-- NOTA: ESTOS REGISTROS SERAN NULOS EN IMAGEN PORQUE LA RUTA NO ES CORRECTA
insert into `fibrosis_v05`.`imagen`(nss_exp, fecha_estudio, num_tomo, imagen)
values('222222222222222', '2025-03-30 10:53:05', 60, load_file('C:/Users/HP/Desktop/modular_fibrosis/estudio_tomografia/58/S20/IM0060L0'));
insert into `fibrosis_v05`.`imagen`(nss_exp, fecha_estudio, num_tomo, imagen)
values('222222222222222', '2025-03-30 10:53:05', 61, load_file('C:/Users/HP/Desktop/modular_fibrosis/estudio_tomografia/58/S20/IM0061L0'));

-- RUTA CORRECTA PERMITIDA POR LA VARIABLE secure_file_priv
insert into `fibrosis_v05`.`imagen`(nss_exp, fecha_estudio, num_tomo, imagen)
values('222222222222222', '2025-03-30 10:53:05', 62, load_file('C:/ProgramData/MySQL/MySQL Server 8.0/Uploads/estudio01_prueba/IM0062L0'));
insert into `fibrosis_v05`.`imagen`(nss_exp, fecha_estudio, num_tomo, imagen)
values('222222222222222', '2025-03-30 10:53:05', 50, load_file('C:/ProgramData/MySQL/MySQL Server 8.0/Uploads/estudio01_prueba/IM0050L0'));

-- registro de prueba con otro tipo de formato en la imagen
insert into `fibrosis_v05`.`imagen`(nss_exp, fecha_estudio, num_tomo, imagen)
values('222222222222222', '2025-03-30 10:53:05', 00, load_file('C:/ProgramData/MySQL/MySQL Server 8.0/Uploads/Colombia_305x314.jpg'));

--


select * from `fibrosis_v05`.`imagen`;

select imagen from `fibrosis_v05`.`imagen`;

SELECT LENGTH(imagen) AS imagen_size FROM imagen WHERE nss_exp = '222222222222222';
