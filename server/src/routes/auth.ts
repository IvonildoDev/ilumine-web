import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { autenticado } from '../auth.js';
import { pool } from '../db.js';

const login = z.object({ email: z.string().email(), senha: z.string().min(1) });

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (req, reply) => {
    const body = login.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ erro: 'E-mail ou senha inválidos' });

    const { rows } = await pool.query(
      `SELECT id, orgao_id, equipe_id, nome, senha_hash, papel FROM usuarios WHERE email = $1 AND ativo`,
      [body.data.email.toLowerCase()],
    );
    const u = rows[0];
    // Mesma resposta para e-mail inexistente e senha errada, para não revelar quais e-mails existem.
    if (!u || !(await bcrypt.compare(body.data.senha, u.senha_hash))) {
      return reply.code(401).send({ erro: 'E-mail ou senha incorretos' });
    }

    const token = app.jwt.sign(
      { sub: u.id, orgao: u.orgao_id, papel: u.papel, equipe: u.equipe_id },
      { expiresIn: '12h' },
    );
    return { token, usuario: { id: u.id, nome: u.nome, papel: u.papel, equipe_id: u.equipe_id } };
  });

  app.get('/me', { preHandler: autenticado }, async (req) => {
    const { rows } = await pool.query(
      `SELECT u.id, u.nome, u.email, u.papel, u.equipe_id, e.nome AS equipe_nome
         FROM usuarios u LEFT JOIN equipes e ON e.id = u.equipe_id WHERE u.id = $1`,
      [req.user.sub],
    );
    return rows[0];
  });
}
