import { z } from 'zod';
const text=z.string().trim().max(500);
const date=text.refine(s=>!s||(/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s),'Enter a valid date');
export const rentalHistoryEntry=z.object({
 address:text.min(5),rentAmount:text.regex(/^$|^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/),
 rentPeriod:z.enum(['Week','Fortnight','Month','Unknown']),from:date,to:date,
 lessor:text.min(2),contact:text,reasonLeaving:text,alternativeEvidence:text,
}).refine(s=>!s.from||!s.to||s.to>=s.from,'Check rental history dates')
 .refine(s=>Boolean((s.rentAmount&&s.rentPeriod!=='Unknown'&&s.from&&s.contact)||s.alternativeEvidence),'Complete the history or explain unavailable details and alternative evidence');
export const extraReference=z.object({name:text.min(2),relationship:text.min(2),phone:text,email:text})
 .refine(s=>Boolean(s.phone||z.email().safeParse(s.email).success),'Supply a contact method');
export type RentalHistoryEntry=z.infer<typeof rentalHistoryEntry>;
export type ExtraReference=z.infer<typeof extraReference>;
export const REPEATER_FIELDS={
 additionalHistory:['address','rentAmount','rentPeriod','from','to','lessor','contact','reasonLeaving','alternativeEvidence'],
 additionalReferences:['name','relationship','phone','email'],
} as const;
export function parseRepeater(key:keyof typeof REPEATER_FIELDS,value:unknown) {
 if(value===undefined||value==='')return [];
 if(typeof value!=='string'||value.length>12000)throw Error('REPEATER_INVALID');
 try {return key==='additionalHistory'?z.array(rentalHistoryEntry).max(10).parse(JSON.parse(value)):
  z.array(extraReference).max(8).parse(JSON.parse(value));}catch{throw Error('REPEATER_INVALID');}
}
/** Lossless display of encrypted repeaters, also used by restricted review and print. */
export function repeaterSummary(key:keyof typeof REPEATER_FIELDS,value:unknown):Array<[string,string]>{
 const rows=parseRepeater(key,value);
 return rows.map((row,index)=>[(key==='additionalHistory'?'Additional rental history ':'Additional personal reference ')+(index+1),
  Object.entries(row).filter(([,v])=>v).map(([k,v])=>k.replace(/([A-Z])/g,' $1')+': '+v).join(' · ')]);
}
