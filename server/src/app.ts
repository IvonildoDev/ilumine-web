import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';

import { config } from './config.js';
import { authRoutes } from './routes/auth.js';
import { catalogoRoutes } from './routes/catalogos.js';
import { gestaoRoutes } from './routes/gestao.js';
import { osRoutes } from './routes/os.js';

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true, methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] });
  await app.register(jwt, { secret: config.JWT_SECRET });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

  app.get('/status', async () => ({ ok: true }));
  await app.register(authRoutes);
  await app.register(catalogoRoutes);
  await app.register(osRoutes);
  await app.register(gestaoRoutes);

  app.setErrorHandler((err: { statusCode?: number; message: string }, _req, reply) => {
    app.log.error(err);
    const status = err.statusCode ?? 500;
    reply.code(status).send({ erro: status < 500 ? err.message : 'Erro interno' });
  });

  return app;
}
