-- Ilumine: esquema inicial. Rodar com `npm run migrate`.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE papel AS ENUM ('campo', 'gestor', 'admin');
CREATE TYPE prioridade AS ENUM ('critica', 'alta', 'media');
CREATE TYPE status_os AS ENUM ('aguardando', 'em_rota', 'concluido');

CREATE TABLE orgaos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE equipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orgao_id uuid NOT NULL REFERENCES orgaos(id),
  nome text NOT NULL,
  numero text,
  veiculo text,
  turno text,
  urgente boolean NOT NULL DEFAULT false,
  ativa boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orgao_id uuid NOT NULL REFERENCES orgaos(id),
  equipe_id uuid REFERENCES equipes(id),
  nome text NOT NULL,
  email text NOT NULL UNIQUE,
  senha_hash text NOT NULL,
  papel papel NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- Definidos pelo admin; no app, a "chave" corresponde ao DefectId (ex.: fiacao_exposta).
CREATE TABLE tipos_defeito (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orgao_id uuid NOT NULL REFERENCES orgaos(id),
  chave text NOT NULL,
  nome text NOT NULL,
  prioridade prioridade NOT NULL,
  icone text,
  perigoso boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  UNIQUE (orgao_id, chave)
);

CREATE TABLE materiais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orgao_id uuid NOT NULL REFERENCES orgaos(id),
  nome text NOT NULL,
  unidade text NOT NULL DEFAULT 'un',
  estoque numeric(12, 2),
  ativo boolean NOT NULL DEFAULT true,
  UNIQUE (orgao_id, nome)
);

-- O id da OS nasce no aparelho (UUID), para a sincronização offline não duplicar registros.
CREATE TABLE os (
  id uuid PRIMARY KEY,
  orgao_id uuid NOT NULL REFERENCES orgaos(id),
  codigo_plaqueta text NOT NULL,
  tipo_defeito_id uuid NOT NULL REFERENCES tipos_defeito(id),
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  rua text NOT NULL,
  bairro text NOT NULL,
  status status_os NOT NULL DEFAULT 'aguardando',
  equipe_id uuid REFERENCES equipes(id),
  criado_por uuid NOT NULL REFERENCES usuarios(id),
  observacao text,
  criado_em timestamptz NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  concluida_em timestamptz
);
CREATE INDEX os_orgao_status_idx ON os (orgao_id, status);
CREATE INDEX os_equipe_idx ON os (equipe_id);
CREATE INDEX os_criado_em_idx ON os (criado_em);

CREATE TABLE os_fotos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id uuid NOT NULL REFERENCES os(id) ON DELETE CASCADE,
  arquivo text NOT NULL,
  tipo_mime text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX os_fotos_os_idx ON os_fotos (os_id);

CREATE TABLE os_materiais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id uuid NOT NULL REFERENCES os(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES materiais(id),
  quantidade numeric(12, 2) NOT NULL CHECK (quantidade > 0)
);
CREATE INDEX os_materiais_os_idx ON os_materiais (os_id);

CREATE TABLE os_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id uuid NOT NULL REFERENCES os(id) ON DELETE CASCADE,
  usuario_id uuid REFERENCES usuarios(id),
  de_status status_os,
  para_status status_os NOT NULL,
  equipe_id uuid REFERENCES equipes(id),
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX os_historico_os_idx ON os_historico (os_id);
