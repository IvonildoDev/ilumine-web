import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { autenticado, comPapel, type Usuario } from '../auth.js';
import { config } from '../config.js';
import { pool, tx } from '../db.js';

const LISTA = `
  SELECT o.id, o.codigo_plaqueta AS codigo, o.status, o.latitude, o.longitude, o.rua, o.bairro,
         o.equipe_id, e.nome AS equipe_nome, o.criado_por, o.observacao,
         o.criado_em, o.atualizado_em, o.concluida_em,
         td.chave AS defeito, td.nome AS defeito_nome, td.prioridade,
         COALESCE((SELECT json_agg(f.id ORDER BY f.criado_em) FROM os_fotos f WHERE f.os_id = o.id), '[]') AS fotos
    FROM os o
    JOIN tipos_defeito td ON td.id = o.tipo_defeito_id
    LEFT JOIN equipes e ON e.id = o.equipe_id`;

/** Campo só enxerga o que criou ou o que é da sua equipe; gestor e admin veem o órgão todo. */
function escopo(u: Usuario, params: unknown[]) {
  params.push(u.orgao);
  let sql = `o.orgao_id = $${params.length}`;
  if (u.papel === 'campo') {
    params.push(u.sub, u.equipe);
    sql += ` AND (o.criado_por = $${params.length - 1} OR o.equipe_id = $${params.length})`;
  }
  return sql;
}

const idParam = z.object({ id: z.string().uuid() });

const novaOs = z.object({
  id: z.string().uuid(),
  codigo: z.string().trim().min(1).transform((s) => s.toUpperCase()),
  defeito: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  rua: z.string().min(1),
  bairro: z.string().min(1),
  criado_em: z.coerce.date().optional(),
});

const filtros = z.object({
  status: z.enum(['aguardando', 'em_rota', 'concluido']).optional(),
  equipe_id: z.string().uuid().optional(),
  desde: z.coerce.date().optional(),
  limite: z.coerce.number().int().min(1).max(500).default(200),
});

const atualiza = z
  .object({
    status: z.enum(['aguardando', 'em_rota', 'concluido']).optional(),
    equipe_id: z.string().uuid().nullable().optional(),
  })
  .refine((v) => v.status !== undefined || v.equipe_id !== undefined, 'Informe status ou equipe_id');

const conclui = z.object({
  observacao: z.string().max(2000).optional(),
  materiais: z
    .array(z.object({ material_id: z.string().uuid(), quantidade: z.number().positive() }))
    .max(50)
    .default([]),
});

export async function osRoutes(app: FastifyInstance) {
  // Idempotente: o app gera o id; reenviar a mesma OS (fila offline) devolve a existente.
  app.post('/os', { preHandler: autenticado }, async (req, reply) => {
    const b = novaOs.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ erro: 'Dados inválidos', detalhes: b.error.issues });
    const d = b.data;

    const tipo = await pool.query('SELECT id FROM tipos_defeito WHERE orgao_id = $1 AND chave = $2 AND ativo', [
      req.user.orgao,
      d.defeito,
    ]);
    if (!tipo.rows[0]) return reply.code(400).send({ erro: 'Tipo de defeito desconhecido' });

    const criada = await tx(async (c) => {
      const r = await c.query(
        `INSERT INTO os (id, orgao_id, codigo_plaqueta, tipo_defeito_id, latitude, longitude, rua, bairro, criado_por, criado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING RETURNING id`,
        [d.id, req.user.orgao, d.codigo, tipo.rows[0].id, d.latitude, d.longitude, d.rua, d.bairro, req.user.sub, d.criado_em ?? new Date()],
      );
      if (r.rowCount) {
        await c.query(`INSERT INTO os_historico (os_id, usuario_id, para_status) VALUES ($1,$2,'aguardando')`, [d.id, req.user.sub]);
      }
      return !!r.rowCount;
    });

    const params: unknown[] = [];
    const where = escopo(req.user, params);
    params.push(d.id);
    const { rows } = await pool.query(`${LISTA} WHERE ${where} AND o.id = $${params.length}`, params);
    if (!rows[0]) return reply.code(409).send({ erro: 'Já existe uma OS com esse id' });
    return reply.code(criada ? 201 : 200).send(rows[0]);
  });

  app.get('/os', { preHandler: autenticado }, async (req, reply) => {
    const f = filtros.safeParse(req.query);
    if (!f.success) return reply.code(400).send({ erro: 'Filtros inválidos' });
    const params: unknown[] = [];
    let where = escopo(req.user, params);
    if (f.data.status) where += ` AND o.status = $${params.push(f.data.status)}`;
    if (f.data.equipe_id) where += ` AND o.equipe_id = $${params.push(f.data.equipe_id)}`;
    if (f.data.desde) where += ` AND o.atualizado_em >= $${params.push(f.data.desde)}`;
    params.push(f.data.limite);
    return (await pool.query(`${LISTA} WHERE ${where} ORDER BY o.criado_em DESC LIMIT $${params.length}`, params)).rows;
  });

  app.get('/os/:id', { preHandler: autenticado }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ erro: 'Id inválido' });
    const params: unknown[] = [];
    const where = escopo(req.user, params);
    params.push(p.data.id);
    const os = (await pool.query(`${LISTA} WHERE ${where} AND o.id = $${params.length}`, params)).rows[0];
    if (!os) return reply.code(404).send({ erro: 'OS não encontrada' });
    const [materiais, historico] = await Promise.all([
      pool.query(
        `SELECT m.id AS material_id, m.nome, m.unidade, om.quantidade
           FROM os_materiais om JOIN materiais m ON m.id = om.material_id WHERE om.os_id = $1`,
        [p.data.id],
      ),
      pool.query(`SELECT de_status, para_status, equipe_id, usuario_id, criado_em FROM os_historico WHERE os_id = $1 ORDER BY criado_em`, [p.data.id]),
    ]);
    return { ...os, materiais: materiais.rows, historico: historico.rows };
  });

  // Gestor: muda status e/ou atribui equipe (a distribuição do trabalho vive aqui, não no app).
  app.patch('/os/:id', { preHandler: comPapel('gestor', 'admin') }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    const b = atualiza.safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send({ erro: 'Dados inválidos' });

    if (b.data.equipe_id) {
      const e = await pool.query('SELECT 1 FROM equipes WHERE id = $1 AND orgao_id = $2 AND ativa', [b.data.equipe_id, req.user.orgao]);
      if (!e.rowCount) return reply.code(400).send({ erro: 'Equipe inválida' });
    }

    const ok = await tx(async (c) => {
      const atual = (await c.query('SELECT status, equipe_id FROM os WHERE id = $1 AND orgao_id = $2 FOR UPDATE', [p.data.id, req.user.orgao])).rows[0];
      if (!atual) return false;
      const status = b.data.status ?? atual.status;
      const equipe = b.data.equipe_id === undefined ? atual.equipe_id : b.data.equipe_id;
      await c.query(
        `UPDATE os SET status = $2::status_os, equipe_id = $3, atualizado_em = now(),
                concluida_em = CASE WHEN $2::status_os = 'concluido' THEN COALESCE(concluida_em, now()) ELSE NULL END
          WHERE id = $1`,
        [p.data.id, status, equipe],
      );
      await c.query(
        `INSERT INTO os_historico (os_id, usuario_id, de_status, para_status, equipe_id) VALUES ($1,$2,$3,$4,$5)`,
        [p.data.id, req.user.sub, atual.status, status, equipe],
      );
      return true;
    });
    return ok ? { ok: true } : reply.code(404).send({ erro: 'OS não encontrada' });
  });

  // Equipe de campo conclui informando os materiais usados.
  app.post('/os/:id/concluir', { preHandler: autenticado }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    const b = conclui.safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send({ erro: 'Dados inválidos' });

    const params: unknown[] = [];
    const where = escopo(req.user, params);
    params.push(p.data.id);
    const visivel = await pool.query(`SELECT o.status, o.equipe_id FROM os o WHERE ${where} AND o.id = $${params.length}`, params);
    if (!visivel.rows[0]) return reply.code(404).send({ erro: 'OS não encontrada' });
    if (visivel.rows[0].status === 'concluido') return reply.code(409).send({ erro: 'OS já concluída' });

    const ids = b.data.materiais.map((m) => m.material_id);
    if (ids.length) {
      const ok = await pool.query('SELECT count(*)::int AS n FROM materiais WHERE orgao_id = $1 AND id = ANY($2::uuid[])', [req.user.orgao, ids]);
      if (ok.rows[0].n !== new Set(ids).size) return reply.code(400).send({ erro: 'Material inválido' });
    }

    await tx(async (c) => {
      await c.query(`UPDATE os SET status='concluido', concluida_em=now(), atualizado_em=now(), observacao=$2 WHERE id=$1`, [p.data.id, b.data.observacao ?? null]);
      for (const m of b.data.materiais) {
        await c.query('INSERT INTO os_materiais (os_id, material_id, quantidade) VALUES ($1,$2,$3)', [p.data.id, m.material_id, m.quantidade]);
        // Baixa na carga da equipe da OS; sem carga desse material, baixa direto no estoque geral.
        const equipe = visivel.rows[0].equipe_id ?? req.user.equipe;
        const daEquipe = equipe
          ? await c.query('UPDATE equipe_materiais SET quantidade = GREATEST(quantidade - $3, 0) WHERE equipe_id = $1 AND material_id = $2', [equipe, m.material_id, m.quantidade])
          : null;
        if (!daEquipe?.rowCount) {
          await c.query('UPDATE materiais SET estoque = estoque - $2 WHERE id = $1 AND estoque IS NOT NULL', [m.material_id, m.quantidade]);
        }
      }
      await c.query(
        `INSERT INTO os_historico (os_id, usuario_id, de_status, para_status) VALUES ($1,$2,$3,'concluido')`,
        [p.data.id, req.user.sub, visivel.rows[0].status],
      );
    });
    return { ok: true };
  });

  app.post('/os/:id/fotos', { preHandler: autenticado }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ erro: 'Id inválido' });

    const params: unknown[] = [];
    const where = escopo(req.user, params);
    params.push(p.data.id);
    if (!(await pool.query(`SELECT 1 FROM os o WHERE ${where} AND o.id = $${params.length}`, params)).rowCount) {
      return reply.code(404).send({ erro: 'OS não encontrada' });
    }

    const file = await req.file();
    if (!file) return reply.code(400).send({ erro: 'Envie um arquivo no campo "foto"' });
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      file.file.resume();
      return reply.code(415).send({ erro: 'Apenas JPEG, PNG ou WebP' });
    }

    const nome = `${randomUUID()}${extname(file.filename).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.jpg'}`;
    await mkdir(config.UPLOAD_DIR, { recursive: true });
    await pipeline(file.file, createWriteStream(join(config.UPLOAD_DIR, nome)));
    if (file.file.truncated) return reply.code(413).send({ erro: 'Arquivo grande demais (máx. 10 MB)' });

    const r = await pool.query('INSERT INTO os_fotos (os_id, arquivo, tipo_mime) VALUES ($1,$2,$3) RETURNING id', [p.data.id, nome, file.mimetype]);
    return reply.code(201).send({ id: r.rows[0].id });
  });

  // Fotos só saem para quem pode ver a OS: não há URL pública do arquivo.
  app.get('/fotos/:id', { preHandler: autenticado }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ erro: 'Id inválido' });
    const params: unknown[] = [];
    const where = escopo(req.user, params);
    params.push(p.data.id);
    const { rows } = await pool.query(
      `SELECT f.arquivo, f.tipo_mime FROM os_fotos f JOIN os o ON o.id = f.os_id WHERE ${where} AND f.id = $${params.length}`,
      params,
    );
    if (!rows[0]) return reply.code(404).send({ erro: 'Foto não encontrada' });
    return reply.type(rows[0].tipo_mime).send(createReadStream(join(config.UPLOAD_DIR, rows[0].arquivo)));
  });
}
