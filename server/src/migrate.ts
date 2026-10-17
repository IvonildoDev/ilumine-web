import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { pool } from './db.js';

const dir = join(process.cwd(), 'db', 'migrations');

await pool.query(`CREATE TABLE IF NOT EXISTS _migracoes (
  nome text PRIMARY KEY,
  aplicada_em timestamptz NOT NULL DEFAULT now()
)`);

const done = new Set((await pool.query<{ nome: string }>('SELECT nome FROM _migracoes')).rows.map((r) => r.nome));

for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  if (done.has(file)) continue;
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(readFileSync(join(dir, file), 'utf8'));
    await c.query('INSERT INTO _migracoes (nome) VALUES ($1)', [file]);
    await c.query('COMMIT');
    console.log(`aplicada: ${file}`);
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

await pool.end();
console.log('migrações em dia');
