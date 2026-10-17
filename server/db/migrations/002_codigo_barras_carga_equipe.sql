-- Código de barras do material (leitor óptico) e o que cada equipe leva para o campo.
ALTER TABLE materiais ADD COLUMN codigo_barras text;
CREATE UNIQUE INDEX materiais_codigo_barras_uq ON materiais (orgao_id, codigo_barras) WHERE codigo_barras IS NOT NULL;

-- Carga da equipe: sai do estoque geral ao ser carregada e é baixada quando a OS é concluída.
CREATE TABLE equipe_materiais (
  equipe_id uuid NOT NULL REFERENCES equipes(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES materiais(id),
  quantidade numeric(12, 2) NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  PRIMARY KEY (equipe_id, material_id)
);
