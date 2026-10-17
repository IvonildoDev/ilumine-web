import bcrypt from 'bcryptjs';

import { pool, tx } from './db.js';

const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@prefeitura.local';
const senha = process.env.SEED_ADMIN_PASSWORD;
if (!senha) throw new Error('Defina SEED_ADMIN_PASSWORD no .env');

// Mesmos tipos que hoje estão fixos em lib/types.ts do app.
const DEFEITOS = [
  ['lampada_piscando', 'Lâmpada Piscando', 'media', 'flash', false],
  ['lampada_apagada', 'Lâmpada Apagada', 'media', 'bulb-outline', false],
  ['luminaria_quebrada', 'Luminária Quebrada', 'media', 'image-outline', false],
  ['braco_torto', 'Braço / Suporte Torto', 'alta', 'return-up-forward', false],
  ['poste_abalroado', 'Poste Abalroado', 'alta', 'warning-outline', false],
  ['fiacao_exposta', 'Fiação Exposta', 'critica', 'flash-off-outline', true],
] as const;

const MATERIAIS = [
  ['Lâmpada LED', 'un'],
  ['Reator', 'un'],
  ['Relé fotoelétrico', 'un'],
  ['Cabo flexível', 'm'],
  ['Braço de luminária', 'un'],
  ['Fita isolante', 'un'],
] as const;

await tx(async (c) => {
  const org = await c.query<{ id: string }>(
    `INSERT INTO orgaos (nome) SELECT 'Iluminação Pública' WHERE NOT EXISTS (SELECT 1 FROM orgaos) RETURNING id`,
  );
  const orgaoId = org.rows[0]?.id ?? (await c.query<{ id: string }>('SELECT id FROM orgaos LIMIT 1')).rows[0].id;

  for (const [chave, nome, prioridade, icone, perigoso] of DEFEITOS) {
    await c.query(
      `INSERT INTO tipos_defeito (orgao_id, chave, nome, prioridade, icone, perigoso)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (orgao_id, chave) DO NOTHING`,
      [orgaoId, chave, nome, prioridade, icone, perigoso],
    );
  }
  for (const [nome, unidade] of MATERIAIS) {
    await c.query(
      `INSERT INTO materiais (orgao_id, nome, unidade) VALUES ($1,$2,$3) ON CONFLICT (orgao_id, nome) DO NOTHING`,
      [orgaoId, nome, unidade],
    );
  }
  await c.query(
    `INSERT INTO usuarios (orgao_id, nome, email, senha_hash, papel)
     VALUES ($1,'Administrador',$2,$3,'admin') ON CONFLICT (email) DO NOTHING`,
    [orgaoId, email, await bcrypt.hash(senha, 10)],
  );
});

await pool.end();
console.log(`seed ok. admin: ${email}`);
