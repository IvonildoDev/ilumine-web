import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET precisa ter ao menos 16 caracteres'),
  PORT: z.coerce.number().default(3333),
  UPLOAD_DIR: z.string().default('./uploads'),
});

export const config = schema.parse(process.env);
