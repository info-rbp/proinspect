import { z } from 'zod';
export const enquirySchema = z.object({
  requestKey: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).transform((s) => s.toLowerCase()),
  phone: z.string().trim().max(40).default(''),
  organisation: z.string().trim().max(180).default(''),
  suburb: z.string().trim().max(100).default(''),
  kind: z.enum(['service', 'portfolio', 'strata', 'other']),
  serviceId: z.string().regex(/^[a-z0-9-]+$/).max(100).optional(),
  message: z.string().trim().min(15).max(4000),
  consent: z.literal(true),
});
export type EnquiryInput = z.infer<typeof enquirySchema>;
export const ENQUIRY_STATES = ['new','reviewing','awaiting_customer','qualified','closed','spam'] as const;
export function canTransitionEnquiry(from: string, to: string) {
  const map: Record<string, string[]> = {
    new: ['reviewing', 'spam', 'closed'],
    reviewing: ['awaiting_customer', 'qualified', 'closed', 'spam'],
    awaiting_customer: ['reviewing', 'qualified', 'closed', 'spam'],
    qualified: ['reviewing', 'closed'], closed: ['reviewing'], spam: ['reviewing'],
  };
  return from === to || (map[from]?.includes(to) ?? false);
}
const encoder = new TextEncoder();
function signatureBytes(hex: string) {
  return Uint8Array.from(hex.match(/../g) ?? [], (b) => parseInt(b, 16));
}
async function key(secret: string) {
  return crypto.subtle.importKey('raw',encoder.encode(secret),{ name: 'HMAC', hash: 'SHA-256' },false,['sign', 'verify']);
}
const canonical = (timestamp: string, body: string) => encoder.encode(`proinspect-enquiry-v1\n${timestamp}\n${body}`);
export async function signEnquiry(secret: string, timestamp: string, body: string) {
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), canonical(timestamp, body)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
export async function verifyEnquiry(secret: string,timestamp: string,signature: string,body: string,time = Date.now()) {
  if (secret.length < 32 || !/^\d{13}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(signature) || Math.abs(time - Number(timestamp)) > 120000) return false;
  return crypto.subtle.verify('HMAC',await key(secret),signatureBytes(signature),canonical(timestamp, body));
}
