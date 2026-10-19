import { noticeEntry } from './form18.ts';
import { z } from 'zod';
export const listingInput=z.object({
 propertyId:z.string().min(3),instructedByClientId:z.string().min(3),ownerClientId:z.string().min(3).nullable().optional(),
 kind:z.enum(['residential','commercial']),slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(110),
 title:z.string().trim().min(10).max(160),description:z.string().trim().min(50).max(8000),
 displayAddress:z.string().trim().min(5).max(240),suburb:z.string().trim().min(2).max(100),postcode:z.string().regex(/^\d{4}$/),
 priceCents:z.number().int().min(0).max(100000000).nullable().optional(),
 pricePeriod:z.enum(['week','year','on_application']).default('week'),
 bedrooms:z.number().int().min(0).max(30).nullable().optional(),
 bathrooms:z.number().int().min(0).max(30).nullable().optional(),
 parking:z.number().int().min(0).max(100).nullable().optional(),
 areaSqm:z.number().int().min(0).max(10000000).nullable().optional(),
 availableFrom:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
 agentName:z.string().trim().min(2).max(180),
 agentRole:z.enum(['landlord','property_manager','leasing_agent']),
 applicationUrl:z.string().url().max(1000).nullable().optional(),
 applicationMode:z.enum(['unavailable','external','proinspect']).optional().default('unavailable'),
 applicationAuthorityReference:z.string().trim().max(200).optional().default(''),
 applicationRecipientEmail:z.string().trim().email().max(254).or(z.literal('')).optional().default(''),
 tenancyDatabaseNoticeMode:z.enum(['unconfigured','not_used','configured']).optional().default('unconfigured'),
 tenancyDatabaseNotices:z.array(noticeEntry).max(6).optional().default([])
});
export const sessionInput=z.object({listingId:z.string().min(3),startsAt:z.string().datetime({offset:true}),endsAt:z.string().datetime({offset:true}),capacity:z.number().int().min(1).max(200).nullable().optional(),instructions:z.string().trim().max(600).default('')});
export const leadInput=z.object({requestKey:z.string().uuid(),listingId:z.string().min(3),sessionId:z.string().min(3).nullable().optional(),kind:z.enum(['inspection','interest']),name:z.string().trim().min(2).max(120),email:z.string().trim().email().max(254).transform(x=>x.toLowerCase()),phone:z.string().trim().min(6).max(40),message:z.string().trim().max(1200).default(''),consent:z.literal(true)}).refine(x=>x.kind==='interest'?!x.sessionId:Boolean(x.sessionId),{message:'Select an inspection session for an inspection registration.'});
export type LeadInput=z.infer<typeof leadInput>;
export const handoffDisclaimer='ProInspect conducts advertised open inspections on behalf of the identified landlord, leasing agent or property manager. ProInspect is not the leasing agent, landlord or property manager for these listings. Applications are handled by the identified party or its nominated provider.';
export const leasingEventKinds=['registration.received','interest.received','registration.cancelled','session.updated','session.cancelled','session.reminder'] as const;
export function safeApplicationUrl(input:string|null|undefined):string|null {if(!input)return null;try {const u=new URL(input);return u.protocol==='https:'&& !u.username&&!u.password?u.href:null;}catch{return null;}}
export function propertyUrl(kind:string,slug:string){return '/properties-for-lease/'+kind+'/'+slug;}
export function displayPrice(cents:number|null,period:string){return cents===null||period==='on_application'?'Price on application':new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:0}).format(cents/100)+' / '+(period==='year'?'year':'week');}
