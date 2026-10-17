import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { comPapel } from '../auth.js';
import { pool } from '../db.js';

const periodo = z.object({
  de: z.coerce.date().optional(),
  ate: z.coerce.date().optional(),
});

/** Período padrão: últimos 30 dias, fim exclusivo no dia seguinte ao informado. */
function intervalo(q: unknown) {
  const p = periodo.parse(q);
  const ate = p.ate ? new Date(p.ate.getTime() + 86_400_000) : new Date(Date.now() + 86_400_000);
  const de = p.de ?? new Date(ate.getTime() - 31 * 86_400_000);
  return { de, ate };
}

const usuario = z.object({
  nome: z.string().min(1),
  email: z.string().email(),
  papel: z.enum(['campo', 'gestor', 'admin']),
  equipe_id: z.string().uuid().nullish(),
  ativo: z.boolean().default(true),
  senha: z.string().min(8).optional(),
});

const gestao = comPapel('gestor', 'admin');

export async function gestaoRoutes(app: FastifyInstance) {
  // ---------- Relatórios ----------
  app.get('/relatorios/resumo', { preHandler: gestao }, async (req, reply) => {
    const parsed = periodo.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ erro: 'Período inválido' });
    const { de, ate } = intervalo(req.query);
    const base = [req.user.orgao, de, ate];
    const noPeriodo = 'o.orgao_id = $1 AND o.criado_em >= $2 AND o.criado_em < $3';

    const [status, prioridade, defeito, bairro, equipe, dia, concluidas, tempo, equipeDefeito] = await Promise.all([
      pool.query(`SELECT o.status, count(*)::int AS total FROM os o WHERE ${noPeriodo} GROUP BY o.status`, base),
      pool.query(
        `SELECT td.prioridade, count(*)::int AS total
           FROM os o JOIN tipos_defeito td ON td.id = o.tipo_defeito_id WHERE ${noPeriodo} GROUP BY td.prioridade`,
        base,
      ),
      pool.query(
        `SELECT td.nome, td.prioridade, count(*)::int AS total
           FROM os o JOIN tipos_defeito td ON td.id = o.tipo_defeito_id WHERE ${noPeriodo}
          GROUP BY td.nome, td.prioridade ORDER BY total DESC`,
        base,
      ),
      pool.query(`SELECT o.bairro, count(*)::int AS total FROM os o WHERE ${noPeriodo} GROUP BY o.bairro ORDER BY total DESC LIMIT 10`, base),
      pool.query(
        `SELECT COALESCE(e.nome, 'Sem equipe') AS nome, count(*)::int AS total,
                count(*) FILTER (WHERE o.status = 'concluido')::int AS concluidas,
                round(avg(EXTRACT(EPOCH FROM (o.concluida_em - o.criado_em)) / 3600) FILTER (WHERE o.concluida_em IS NOT NULL)::numeric, 1) AS horas_medias
           FROM os o LEFT JOIN equipes e ON e.id = o.equipe_id WHERE ${noPeriodo}
          GROUP BY e.nome ORDER BY total DESC`,
        base,
      ),
      pool.query(
        `SELECT to_char(date_trunc('day', o.criado_em), 'YYYY-MM-DD') AS dia, count(*)::int AS total
           FROM os o WHERE ${noPeriodo} GROUP BY 1 ORDER BY 1`,
        base,
      ),
      pool.query(
        `SELECT to_char(date_trunc('day', o.concluida_em), 'YYYY-MM-DD') AS dia, count(*)::int AS total
           FROM os o WHERE o.orgao_id = $1 AND o.concluida_em >= $2 AND o.concluida_em < $3 GROUP BY 1 ORDER BY 1`,
        base,
      ),
      pool.query(
        `SELECT round(avg(EXTRACT(EPOCH FROM (o.concluida_em - o.criado_em)) / 3600)::numeric, 1) AS horas
           FROM os o WHERE ${noPeriodo} AND o.concluida_em IS NOT NULL`,
        base,
      ),
      // Serviços por equipe e tipo de ocorrência (para a matriz do relatório).
      pool.query(
        `SELECT COALESCE(e.nome, 'Sem equipe') AS equipe, td.nome AS defeito, count(*)::int AS total,
                count(*) FILTER (WHERE o.status = 'concluido')::int AS concluidas
           FROM os o JOIN tipos_defeito td ON td.id = o.tipo_defeito_id LEFT JOIN equipes e ON e.id = o.equipe_id
          WHERE ${noPeriodo} GROUP BY e.nome, td.nome ORDER BY equipe, total DESC`,
        base,
      ),
    ]);

    return {
      periodo: { de, ate },
      por_status: status.rows,
      por_prioridade: prioridade.rows,
      por_defeito: defeito.rows,
      por_bairro: bairro.rows,
      por_equipe: equipe.rows,
      por_equipe_defeito: equipeDefeito.rows,
      abertas_por_dia: dia.rows,
      concluidas_por_dia: concluidas.rows,
      horas_medias_atendimento: tempo.rows[0]?.horas ?? null,
    };
  });

  app.get('/relatorios/materiais', { preHandler: gestao }, async (req, reply) => {
    const parsed = periodo.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ erro: 'Período inválido' });
    const { de, ate } = intervalo(req.query);
    const base = [req.user.orgao, de, ate];
    const noPeriodo = 'o.orgao_id = $1 AND o.concluida_em >= $2 AND o.concluida_em < $3';

    const [total, porEquipe, estoque] = await Promise.all([
      pool.query(
        `SELECT m.nome, m.unidade, sum(om.quantidade)::float AS quantidade, count(DISTINCT o.id)::int AS os
           FROM os_materiais om JOIN os o ON o.id = om.os_id JOIN materiais m ON m.id = om.material_id
          WHERE ${noPeriodo} GROUP BY m.nome, m.unidade ORDER BY quantidade DESC`,
        base,
      ),
      pool.query(
        `SELECT COALESCE(e.nome, 'Sem equipe') AS equipe, m.nome AS material, m.unidade, sum(om.quantidade)::float AS quantidade
           FROM os_materiais om JOIN os o ON o.id = om.os_id JOIN materiais m ON m.id = om.material_id
           LEFT JOIN equipes e ON e.id = o.equipe_id
          WHERE ${noPeriodo} GROUP BY e.nome, m.nome, m.unidade ORDER BY equipe, quantidade DESC`,
        base,
      ),
      // Posição atual do estoque (não depende do período): só materiais com estoque controlado.
      pool.query(
        `SELECT nome, unidade, estoque::float AS estoque, estoque_minimo::float AS estoque_minimo
           FROM materiais WHERE orgao_id = $1 AND ativo AND estoque IS NOT NULL ORDER BY nome`,
        [req.user.orgao],
      ),
    ]);
    return { periodo: { de, ate }, por_material: total.rows, por_equipe: porEquipe.rows, estoque: estoque.rows };
  });

  // ---------- Usuários (só admin) ----------
  app.get('/usuarios', { preHandler: comPapel('admin') }, async (req) =>
    (
      await pool.query(
        `SELECT u.id, u.nome, u.email, u.papel, u.equipe_id, e.nome AS equipe_nome, u.ativo
           FROM usuarios u LEFT JOIN equipes e ON e.id = u.equipe_id WHERE u.orgao_id = $1 ORDER BY u.nome`,
        [req.user.orgao],
      )
    ).rows,
  );

  app.post('/usuarios', { preHandler: comPapel('admin') }, async (req, reply) => {
    const b = usuario.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ erro: 'Dados inválidos', detalhes: b.error.issues });
    if (!b.data.senha) return reply.code(400).send({ erro: 'Informe uma senha de ao menos 8 caracteres' });
    try {
      const r = await pool.query(
        `INSERT INTO usuarios (orgao_id, nome, email, senha_hash, papel, equipe_id, ativo)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, nome, email, papel, equipe_id, ativo`,
        [req.user.orgao, b.data.nome, b.data.email.toLowerCase(), await bcrypt.hash(b.data.senha, 10), b.data.papel, b.data.equipe_id ?? null, b.data.ativo],
      );
      return reply.code(201).send(r.rows[0]);
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return reply.code(409).send({ erro: 'Já existe um usuário com esse e-mail' });
      throw e;
    }
  });

  app.put('/usuarios/:id', { preHandler: comPapel('admin') }, async (req, reply) => {
    const p = z.object({ id: z.string().uuid() }).safeParse(req.params);
    const b = usuario.safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send({ erro: 'Dados inválidos' });
    if (p.data.id === req.user.sub && (!b.data.ativo || b.data.papel !== 'admin')) {
      return reply.code(400).send({ erro: 'Você não pode desativar nem rebaixar a si mesmo' });
    }
    const hash = b.data.senha ? await bcrypt.hash(b.data.senha, 10) : null;
    try {
      const r = await pool.query(
        `UPDATE usuarios SET nome=$3, email=$4, papel=$5, equipe_id=$6, ativo=$7, senha_hash=COALESCE($8, senha_hash)
          WHERE id=$1 AND orgao_id=$2 RETURNING id, nome, email, papel, equipe_id, ativo`,
        [p.data.id, req.user.orgao, b.data.nome, b.data.email.toLowerCase(), b.data.papel, b.data.equipe_id ?? null, b.data.ativo, hash],
      );
      return r.rows[0] ?? reply.code(404).send({ erro: 'Usuário não encontrado' });
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return reply.code(409).send({ erro: 'Já existe um usuário com esse e-mail' });
      throw e;
    }
  });
}
