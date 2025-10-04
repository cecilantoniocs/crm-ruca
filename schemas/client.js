// /schemas/client.js
import { z } from 'zod';

export const clientSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(7).optional().nullable(),
  address: z.string().optional().nullable(),
  rut: z.string().optional().nullable(),
});
