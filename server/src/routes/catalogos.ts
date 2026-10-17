import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';

import { autenticado, comPapel } from '../auth.js';
import { pool, tx } from '../db.js';

const equipe = z.object({
  nome: z.string().min(1),
  numero: z.string().nullish(),
  veiculo: z.string().nullish(),
  turno: z.string().nullish(),
  urgente: z.boolean().default(false),
  ativa: z.boolean().default(true),
});

const tipoDefeito = z.object({
  chave: z.string().regex(/^[a-z0-9_]+$/),
  nome: z.string().min(1),
  prioridade: z.enum(['critica', 'alta', 'media']),
  icone: z.string().nullish(),
  perigoso: z.boolean().default(false),
  ativo: z.boolean().default(true),
});

const material = z.object({
  nome: z.string().min(1),
  unidade: z.string().min(1).default('un'),
  estoque: z.number().nonnegative().nullish(),
  estoque_minimo: z.number().nonnegative().nullish(),
  codigo_barras: z.string().trim().min(1).max(64).nullish(),
  ativo: z.boolean().default(true),
});

const carga = z.object({ material_id: z.string().uuid(), quantidade: z.number().positive() });
const ajusteCarga = z.object({ quantidade: z.number().nonnegative() });
const cargaParams = z.object({ id: z.string().uuid(), materialId: z.string().uuid() });

const params = z.object({ id: z.string().uuid() });
const admin = comPapel('admin');

export async function catalogoRoutes(app: FastifyInstance) {
  // Leitura: qualquer usuário autenticado do órgão (o app de campo precisa destas listas).
  app.get('/equipes', { preHandler: autenticado }, async (req) =>
    (await pool.query('SELECT * FROM equipes WHERE orgao_id = $1 AND ativa ORDER BY nome', [req.user.orgao])).rows,
  );
  app.get('/tipos-defeito', { preHandler: autenticado }, async (req) =>
    (await pool.query('SELECT * FROM tipos_defeito WHERE orgao_id = $1 AND ativo ORDER BY nome', [req.user.orgao])).rows,
  );
  app.get('/materiais', { preHandler: autenticado }, async (req) =>
    (await pool.query('SELECT * FROM materiais WHERE orgao_id = $1 AND ativo ORDER BY nome', [req.user.orgao])).rows,
  );

  // Escrita: só admin define equipes, prioridades e catálogo de materiais.
  app.post('/equipes', { preHandler: admin }, async (req, reply) => {
    const b = equipe.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ erro: 'Dados inválidos', detalhes: b.error.issues });
    const { nome, numero, veiculo, turno, urgente, ativa } = b.data;
    const r = await pool.query(
      `INSERT INTO equipes (orgao_id, nome, numero, veiculo, turno, urgente, ativa) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.orgao, nome, numero, veiculo, turno, urgente, ativa],
    );
    return reply.code(201).send(r.rows[0]);
  });

  app.put('/equipes/:id', { preHandler: admin }, async (req, reply) => {
    const p = params.safeParse(req.params);
    const b = equipe.safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send({ erro: 'Dados inválidos' });
    const { nome, numero, veiculo, turno, urgente, ativa } = b.data;
    const r = await pool.query(
      `UPDATE equipes SET nome=$3, numero=$4, veiculo=$5, turno=$6, urgente=$7, ativa=$8
        WHERE id=$1 AND orgao_id=$2 RETURNING *`,
      [p.data.id, req.user.orgao, nome, numero, veiculo, turno, urgente, ativa],
    );
    return r.rows[0] ?? reply.code(404).send({ erro: 'Equipe não encontrada' });
  });

  app.post('/tipos-defeito', { preHandler: admin }, async (req, reply) => {
    const b = tipoDefeito.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ erro: 'Dados inválidos', detalhes: b.error.issues });
    const { chave, nome, prioridade, icone, perigoso, ativo } = b.data;
    try {
      const r = await pool.query(
        `INSERT INTO tipos_defeito (orgao_id, chave, nome, prioridade, icone, perigoso, ativo)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [req.user.orgao, chave, nome, prioridade, icone, perigoso, ativo],
      );
      return reply.code(201).send(r.rows[0]);
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return reply.code(409).send({ erro: 'Já existe um tipo com essa chave' });
      throw e;
    }
  });

  app.put('/tipos-defeito/:id', { preHandler: admin }, async (req, reply) => {
    const p = params.safeParse(req.params);
    const b = tipoDefeito.omit({ chave: true }).safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send({ erro: 'Dados inválidos' });
    const { nome, prioridade, icone, perigoso, ativo } = b.data;
    const r = await pool.query(
      `UPDATE tipos_defeito SET nome=$3, prioridade=$4, icone=$5, perigoso=$6, ativo=$7
        WHERE id=$1 AND orgao_id=$2 RETURNING *`,
      [p.data.id, req.user.orgao, nome, prioridade, icone, perigoso, ativo],
    );
    return r.rows[0] ?? reply.code(404).send({ erro: 'Tipo não encontrado' });
  });

  app.post('/materiais', { preHandler: admin }, async (req, reply) => {
    const b = material.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ erro: 'Dados inválidos', detalhes: b.error.issues });
    const { nome, unidade, estoque, estoque_minimo, codigo_barras, ativo } = b.data;
    try {
      const r = await pool.query(
        `INSERT INTO materiais (orgao_id, nome, unidade, estoque, estoque_minimo, codigo_barras, ativo) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [req.user.orgao, nome, unidade, estoque, estoque_minimo ?? null, codigo_barras ?? null, ativo],
      );
      return reply.code(201).send(r.rows[0]);
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return reply.code(409).send({ erro: erroDuplicado(e) });
      throw e;
    }
  });

  app.put('/materiais/:id', { preHandler: admin }, async (req, reply) => {
    const p = params.safeParse(req.params);
    const b = material.safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send({ erro: 'Dados inválidos' });
    const { nome, unidade, estoque, estoque_minimo, codigo_barras, ativo } = b.data;
    try {
      const r = await pool.query(
        `UPDATE materiais SET nome=$3, unidade=$4, estoque=$5, estoque_minimo=$6, codigo_barras=$7, ativo=$8 WHERE id=$1 AND orgao_id=$2 RETURNING *`,
        [p.data.id, req.user.orgao, nome, unidade, estoque, estoque_minimo ?? null, codigo_barras ?? null, ativo],
      );
      return r.rows[0] ?? reply.code(404).send({ erro: 'Material não encontrado' });
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return reply.code(409).send({ erro: erroDuplicado(e) });
      throw e;
    }
  });

  // ---------- Materiais que cada equipe leva para o campo ----------
  const equipeDoOrgao = async (id: string, orgao: string) =>
    (await pool.query('SELECT 1 FROM equipes WHERE id = $1 AND orgao_id = $2', [id, orgao])).rowCount === 1;

  app.get('/equipes/:id/materiais', { preHandler: autenticado }, async (req, reply) => {
    const p = params.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ erro: 'Id inválido' });
    if (req.user.papel === 'campo' && req.user.equipe !== p.data.id) return reply.code(403).send({ erro: 'Sem permissão' });
    if (!(await equipeDoOrgao(p.data.id, req.user.orgao))) return reply.code(404).send({ erro: 'Equipe não encontrada' });
    return (
      await pool.query(
        `SELECT m.id AS material_id, m.nome, m.unidade, m.codigo_barras, em.quantidade::float AS quantidade
           FROM equipe_materiais em JOIN materiais m ON m.id = em.material_id
          WHERE em.equipe_id = $1 ORDER BY m.nome`,
        [p.data.id],
      )
    ).rows;
  });

  // Carrega a equipe: soma à carga e tira do estoque geral (quando o material tem estoque controlado).
  app.post('/equipes/:id/materiais', { preHandler: admin }, async (req, reply) => {
    const p = params.safeParse(req.params);
    const b = carga.safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send({ erro: 'Dados inválidos' });
    if (!(await equipeDoOrgao(p.data.id, req.user.orgao))) return reply.code(404).send({ erro: 'Equipe não encontrada' });
    const erro = await tx((c) => moveCarga(c, req.user.orgao, p.data.id, b.data.material_id, b.data.quantidade, true));
    return erro ? reply.code(erro.status).send({ erro: erro.msg }) : { ok: true };
  });

  // Ajusta a carga para um valor exato; 0 remove o material da equipe. A diferença volta/sai do estoque geral.
  app.put('/equipes/:id/materiais/:materialId', { preHandler: admin }, async (req, reply) => {
    const p = cargaParams.safeParse(req.params);
    const b = ajusteCarga.safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send({ erro: 'Dados inválidos' });
    if (!(await equipeDoOrgao(p.data.id, req.user.orgao))) return reply.code(404).send({ erro: 'Equipe não encontrada' });
    const erro = await tx((c) => moveCarga(c, req.user.orgao, p.data.id, p.data.materialId, b.data.quantidade, false));
    return erro ? reply.code(erro.status).send({ erro: erro.msg }) : { ok: true };
  });
}

function erroDuplicado(e: unknown) {
  return (e as { constraint?: string }).constraint === 'materiais_codigo_barras_uq'
    ? 'Esse código de barras já está em outro material'
    : 'Já existe um material com esse nome';
}

/** `soma`: acrescenta `quantidade` à carga; senão define a carga como `quantidade`. */
async function moveCarga(c: PoolClient, orgao: string, equipeId: string, materialId: string, quantidade: number, soma: boolean) {
  const mat = await c.query('SELECT estoque FROM materiais WHERE id = $1 AND orgao_id = $2 FOR UPDATE', [materialId, orgao]);
  if (!mat.rows[0]) return { status: 400, msg: 'Material inválido' };
  const atual = Number((await c.query('SELECT quantidade FROM equipe_materiais WHERE equipe_id = $1 AND material_id = $2', [equipeId, materialId])).rows[0]?.quantidade ?? 0);
  const nova = soma ? atual + quantidade : quantidade;
  const delta = nova - atual;
  if (mat.rows[0].estoque !== null && delta > Number(mat.rows[0].estoque)) {
    return { status: 409, msg: `Estoque insuficiente (disponível: ${Number(mat.rows[0].estoque)})` };
  }
  if (nova === 0) await c.query('DELETE FROM equipe_materiais WHERE equipe_id = $1 AND material_id = $2', [equipeId, materialId]);
  else {
    await c.query(
      `INSERT INTO equipe_materiais (equipe_id, material_id, quantidade) VALUES ($1,$2,$3)
       ON CONFLICT (equipe_id, material_id) DO UPDATE SET quantidade = EXCLUDED.quantidade`,
      [equipeId, materialId, nova],
    );
  }
  await c.query('UPDATE materiais SET estoque = estoque - $2 WHERE id = $1 AND estoque IS NOT NULL', [materialId, delta]);
  return null;
}
