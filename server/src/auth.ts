import type { FastifyReply, FastifyRequest } from 'fastify';

export type Papel = 'campo' | 'gestor' | 'admin';

export type Usuario = {
  sub: string;
  orgao: string;
  papel: Papel;
  equipe: string | null;
};

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: Usuario;
    user: Usuario;
  }
}

export async function autenticado(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ erro: 'Não autenticado' });
  }
}

export const comPapel =
  (...papeis: Papel[]) =>
  async (req: FastifyRequest, reply: FastifyReply) => {
    await autenticado(req, reply);
    if (reply.sent) return;
    if (!papeis.includes(req.user.papel)) return reply.code(403).send({ erro: 'Sem permissão' });
  };
