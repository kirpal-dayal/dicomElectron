-- Los campos de las contrasenas son de tipo BLOB y se agrega a las tablas
-- admin y doctor los campos 'activo'

SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;
SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

-- -----------------------------------------------------
-- Schema fibrosis_v06
-- -----------------------------------------------------

-- -----------------------------------------------------
-- Schema fibrosis_v06
-- -----------------------------------------------------
CREATE SCHEMA IF NOT EXISTS `fibrosis_v06` DEFAULT CHARACTER SET utf8 ;
USE `fibrosis_v06` ;

-- -----------------------------------------------------
-- Table `fibrosis_v06`.`admin`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `fibrosis_v06`.`admin` (
  `id_admin` VARCHAR(10) NOT NULL,
  `activo` TINYINT NOT NULL DEFAULT 1,
  `nombre_admin` VARCHAR(45) NULL,
  `contrasena_admin` BLOB NOT NULL,
  `fecha_creacion` TIMESTAMP NULL,
  PRIMARY KEY (`id_admin`))
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `fibrosis_v06`.`doctor`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `fibrosis_v06`.`doctor` (
  `id` VARCHAR(10) NOT NULL,
  `activo` TINYINT NOT NULL DEFAULT 1,
  `nombre_doc` VARCHAR(45) NULL,
  `contrasena_doc` BLOB NOT NULL, -- VARCHAR(45) NULL,
  `fecha_creacion` TIMESTAMP NULL,
  `id_adminCreador` VARCHAR(10) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `id_adminCreador_idx` (`id_adminCreador` ASC) VISIBLE,
  CONSTRAINT `fkDoc_id_admin`
    FOREIGN KEY (`id_adminCreador`)
    REFERENCES `fibrosis_v06`.`admin` (`id_admin`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB
KEY_BLOCK_SIZE = 1;


-- -----------------------------------------------------
-- Table `fibrosis_v06`.`expediente`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `fibrosis_v06`.`expediente` (
  `nss` VARCHAR(15) NOT NULL,
  `sexo` TINYINT NULL,
  `fecha_creacion` TIMESTAMP NOT NULL,
  `fecha_nacimiento` DATETIME NULL,
  `id_docCreador` VARCHAR(10) NOT NULL,
  PRIMARY KEY (`nss`),
  INDEX `id_docCreador_idx` (`id_docCreador` ASC) VISIBLE,
  CONSTRAINT `fkExp_id_doc`
    FOREIGN KEY (`id_docCreador`)
    REFERENCES `fibrosis_v06`.`doctor` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `fibrosis_v06`.`estudio`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `fibrosis_v06`.`estudio` (
  `fecha` TIMESTAMP NOT NULL,
  `nss_expediente` VARCHAR(15) NOT NULL,
  `descripcion` TEXT NULL,
  `volumen_automatico` FLOAT NULL,
  `volumen_manual` FLOAT NULL,
  UNIQUE INDEX `fecha_UNIQUE` (`fecha` ASC) VISIBLE,
  PRIMARY KEY (`fecha`, `nss_expediente`),
  INDEX `nss_expediente_idx` (`nss_expediente` ASC) VISIBLE,
  CONSTRAINT `fkEst_nss_expediente`
    FOREIGN KEY (`nss_expediente`)
    REFERENCES `fibrosis_v06`.`expediente` (`nss`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `fibrosis_v06`.`imagen`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `fibrosis_v06`.`imagen` (
  `nss_exp` VARCHAR(15) NOT NULL,
  `fecha_estudio` TIMESTAMP NOT NULL,
  `num_tomo` INT NOT NULL,
  `imagen` LONGBLOB NULL,
  PRIMARY KEY (`nss_exp`, `fecha_estudio`, `num_tomo`),
  INDEX `fecha_estudio_idx` (`fecha_estudio` ASC) VISIBLE,
  CONSTRAINT `fkTom_nss_exp`
    FOREIGN KEY (`nss_exp`)
    REFERENCES `fibrosis_v06`.`estudio` (`nss_expediente`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fkTom_fecha_estudio`
    FOREIGN KEY (`fecha_estudio`)
    REFERENCES `fibrosis_v06`.`estudio` (`fecha`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `fibrosis_v06`.`mascara`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `fibrosis_v06`.`mascara` (
  `nss_exp` VARCHAR(15) NOT NULL,
  `fecha_estudio` TIMESTAMP NOT NULL,
  `num_tomo` INT NOT NULL,
  `tipo` ENUM('automatica', 'manual') NOT NULL,
  `clase` ENUM('pulmon', 'fibrosis', 'fondo') NOT NULL,
  `coordenadas` JSON NULL,
  PRIMARY KEY (`nss_exp`, `fecha_estudio`, `num_tomo`, `tipo`, `clase`),
  INDEX `num_tomo_idx` (`num_tomo` ASC) VISIBLE,
  INDEX `fkMas_fecha_estudio_idx` (`fecha_estudio` ASC) VISIBLE,
  CONSTRAINT `fkMas_nss_exp`
    FOREIGN KEY (`nss_exp`)
    REFERENCES `fibrosis_v06`.`imagen` (`nss_exp`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fkMas_fecha_estudio`
    FOREIGN KEY (`fecha_estudio`)
    REFERENCES `fibrosis_v06`.`imagen` (`fecha_estudio`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fkMas_num_tomo`
    FOREIGN KEY (`nss_exp`, `fecha_estudio`, `num_tomo`)
    REFERENCES `fibrosis_v06`.`imagen` (`nss_exp`, `fecha_estudio`, `num_tomo`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `fibrosis_v06`.`modifica_doc_estudio`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `fibrosis_v06`.`modifica_doc_estudio` (
  `id_doc` VARCHAR(10) NOT NULL,
  `nss_exp` VARCHAR(15) NOT NULL,
  `fecha_estudio` TIMESTAMP NOT NULL,
  `fecha_ajuste_manual` TIMESTAMP NOT NULL,
  PRIMARY KEY (`id_doc`, `nss_exp`, `fecha_estudio`),
  INDEX `fecha_estudio_idx` (`fecha_estudio` ASC) VISIBLE,
  INDEX `fk_nss_exp_idx` (`nss_exp` ASC) VISIBLE,
  CONSTRAINT `fkMod_id_doc`
    FOREIGN KEY (`id_doc`)
    REFERENCES `fibrosis_v06`.`doctor` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fkMod_nss_exp`
    FOREIGN KEY (`nss_exp`)
    REFERENCES `fibrosis_v06`.`estudio` (`nss_expediente`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fkMod_fecha_estudio`
    FOREIGN KEY (`fecha_estudio`)
    REFERENCES `fibrosis_v06`.`estudio` (`fecha`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


SET SQL_MODE=@OLD_SQL_MODE;
SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS;
