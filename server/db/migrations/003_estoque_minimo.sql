-- Estoque mínimo do material: abaixo (ou igual) dele o relatório e o cadastro mostram alerta.
ALTER TABLE materiais ADD COLUMN estoque_minimo numeric(12, 2) CHECK (estoque_minimo >= 0);
