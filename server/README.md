# Ilumine API

Node.js + TypeScript (Fastify) sobre PostgreSQL. Gerencia OS, equipes, tipos de defeito/prioridades e materiais.

## Rodar localmente

1. Crie o banco (PostgreSQL 18, porta 5433 nesta máquina):
   ```
   "C:\Program Files\PostgreSQL\18\bin\createdb.exe" -U postgres -p 5433 ilumine
   ```
2. `copy .env.example .env` e preencha `DATABASE_URL` (senha), `JWT_SECRET` e `SEED_ADMIN_PASSWORD`.
3. `npm run migrate` cria as tabelas. `npm run seed` cria o órgão, os tipos de defeito, os materiais e o admin.
4. `npm run dev` sobe a API em `http://localhost:3333` (`GET /status` para testar).

## Endpoints

| Método | Rota | Quem |
|---|---|---|
| POST | `/auth/login` | público |
| GET | `/me` | autenticado |
| GET | `/equipes`, `/tipos-defeito`, `/materiais` | autenticado |
| POST/PUT | `/equipes`, `/tipos-defeito`, `/materiais` (material aceita `codigo_barras`) | admin |
| GET | `/equipes/:id/materiais` (carga da equipe) | autenticado (campo: só a sua equipe) |
| POST | `/equipes/:id/materiais` (carregar: soma e baixa do estoque geral) | admin |
| PUT | `/equipes/:id/materiais/:materialId` (ajusta; 0 remove) | admin |
| POST | `/os` (id gerado no app; idempotente) | autenticado |
| GET | `/os`, `/os/:id` | campo: só as suas; gestor/admin: todas |
| PATCH | `/os/:id` (status e equipe) | gestor, admin |
| POST | `/os/:id/concluir` (materiais usados; baixa na carga da equipe da OS, ou no estoque geral se a equipe não tiver o material) | autenticado com acesso à OS |
| POST | `/os/:id/fotos` (multipart) | autenticado com acesso à OS |
| GET | `/fotos/:id` | autenticado com acesso à OS |

Todas as rotas, menos login e `/status`, exigem `Authorization: Bearer <token>`.
