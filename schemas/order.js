// /schemas/order.js
import { z } from 'zod';

export const orderItemSchema = z.object({
  product_id: z.number().int(),
  qty: z.number().int().positive(),
  price: z.number().nonnegative()
});

export const orderSchema = z.object({
  client_id: z.number().int(),
  seller_id: z.number().int(),
  status: z.enum(['pending','on_route','delivered']).default('pending'),
  items: z.array(orderItemSchema).min(1)
});
