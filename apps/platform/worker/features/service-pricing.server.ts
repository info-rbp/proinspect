import {z} from 'zod';
import {assert,statement,now,uid,type Env} from '../../../../packages/database/types';
import type {Principal} from '../../../../packages/domain/index';
import {administrator} from '../../../../packages/authorization/server';
import {recordId,isoDate,reference,activity,guard,clearGuard} from '../../../../packages/operations/core';
import {digest} from '../../../../packages/auth/crypto';
import {v4Catalogue} from '../../../../packages/v4/catalogue';
import {catalogue} from '../services.server';
import {requireReleaseApproval} from './release-governance.server';
export const PROPERTY_TYPES=['House','Apartment','Townhouse','Villa','Office','Retail','Warehouse','Industrial','Mixed-use','Other'] as const;
type Variant={id:string;service_id:string;source_code:string;source_version:string;source_fee:string;label:string;scope_text:string;scope_sha256:string;unit_ex_gst_cents:number;minimum_cents:number;quantity_allowed:number;gst_basis_points:number;postcodes_json:string;property_types_json:string;starts_at:string;expires_at:string;payment_policy:string;status:string;created_by:string;approved_by:string|null};
export async function pricingAdmin(env:Env,user:Principal){administrator(user);const source=await v4Catalogue();return {services:await catalogue(env),sourceItems:source.services.filter(s=>s.priceRule==='Fixed listed'&&s.pathway==='Appointment'&&s.baseCents!==null&&s.baseCents>0).map(s=>({id:s.id,name:s.name,feeText:s.feeText})),propertyTypes:PROPERTY_TYPES,variants:(await statement(env.DB,'SELECT * FROM service_sale_variants ORDER BY created_at DESC LIMIT 150').all()).results};}
export async function pricingCommand(env:Env,user:Principal,command:string,input:unknown){
 administrator(user);
 if(command==='draft'){
  const d=z.object({serviceId:recordId,sourceCode:z.string().min(3).max(40),label:z.string().trim().min(3).max(180),scopeText:z.string().trim().min(30).max(5000),postcodes:z.string().min(4).max(1200),propertyTypes:z.array(z.enum(PROPERTY_TYPES)).min(1).max(10),gstBasisPoints:z.number().int().refine(v=>v===0||v===1000),startsAt:isoDate,expiresAt:isoDate,paymentPolicy:z.literal('invoice_after_confirmation')}).parse(input);
  const source=await v4Catalogue(),item=source.services.find(s=>s.id===d.sourceCode),service=(await catalogue(env)).find(s=>s.id===d.serviceId&&s.active===1);
  assert(item&&service&&service.sectors.includes(item.sector),422,'SOURCE_SERVICE_MISMATCH','Source item and operational service must have matching sectors.');
  assert(item.pathway==='Appointment'&&item.priceRule==='Fixed listed'&&item.baseCents!==null&&item.baseCents>0,422,'SOURCE_NOT_APPOINTMENT','Only a fixed standard appointment can use the existing fixed-duration scheduler. Other products use the scoped service-request and quotation workflow.');
  const postcodes=[...new Set(d.postcodes.split(',').map(s=>s.trim()))].sort(),types=[...new Set(d.propertyTypes)].sort();assert(postcodes.length<=200&&postcodes.every(p=>/^6[0-9]{3}$/.test(p)),422,'POSTCODE_SCOPE','Specify exact WA postcodes, not a guessed regional range.');
  assert(d.expiresAt>d.startsAt&&d.expiresAt>now(),422,'PRICE_DATES','Provide a valid future expiry.');
  const snapshot={serviceId:service.id,sourceCode:item.id,sourceVersion:source.sourceVersion,sourceFee:item.feeText,label:d.label,scope:d.scopeText,unitExGstCents:item.baseCents,minimumCents:0,quantityAllowed:false,gstBasisPoints:d.gstBasisPoints,postcodes,propertyTypes:types,startsAt:d.startsAt,expiresAt:d.expiresAt,paymentPolicy:d.paymentPolicy};
  const id=uid('ssv'),hash=await digest(JSON.stringify(snapshot));
  await env.DB.batch([statement(env.DB,'INSERT INTO service_sale_variants(id,service_id,source_code,source_version,source_fee,label,scope_text,scope_sha256,unit_ex_gst_cents,gst_basis_points,postcodes_json,property_types_json,starts_at,expires_at,payment_policy,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,service.id,item.id,source.sourceVersion,item.feeText,d.label,d.scopeText,hash,item.baseCents,d.gstBasisPoints,JSON.stringify(postcodes),JSON.stringify(types),d.startsAt,d.expiresAt,d.paymentPolicy,user.id,now()),activity(env,user,'pricing.variant_drafted','service_sale_variant',id)]);return {id,status:'draft',scopeSha256:hash};
 }
 if(command==='approve'){
  const d=z.object({variantId:recordId,scopeSha256:z.string().regex(/^[a-f0-9]{64}$/),reference:reference.refine(v=>v.length>=8),scopeAndServiceAreaConfirmed:z.literal(true),taxTreatmentConfirmed:z.literal(true),paymentTermsConfirmed:z.literal(true)}).parse(input);
  const v=await statement(env.DB,'SELECT * FROM service_sale_variants WHERE id=?',d.variantId).first<Variant>();assert(v&&v.status==='draft'&&v.scope_sha256===d.scopeSha256&&v.expires_at>now(),409,'PRICE_DRAFT_CHANGED','Review a current draft and its exact scope.');assert(v.created_by!==user.id,403,'INDEPENDENT_PRICE_APPROVAL','Another administrator must approve this price and scope.');
  await env.DB.batch([statement(env.DB,"UPDATE service_sale_variants SET status='approved',approved_by=?,approved_at=?,approval_reference=? WHERE id=? AND status='draft' AND scope_sha256=?",user.id,now(),d.reference,v.id,d.scopeSha256),guard(env),activity(env,user,'pricing.variant_approved','service_sale_variant',v.id),clearGuard(env)]);return {id:v.id,status:'approved',activated:false};
 }
 assert(command==='withdraw',404,'PRICING_ACTION','Unknown pricing operation.');const d=z.object({variantId:recordId,reference}).parse(input);await env.DB.batch([statement(env.DB,"UPDATE service_sale_variants SET status='withdrawn' WHERE id=? AND status IN('draft','approved')",d.variantId),guard(env),activity(env,user,'pricing.variant_withdrawn','service_sale_variant',d.variantId,null,null,{reference:d.reference}),clearGuard(env)]);return {id:d.variantId,status:'withdrawn'};
}
function projection(v:Variant){return {id:v.id,label:v.label,scope:v.scope_text,unitExGstCents:v.unit_ex_gst_cents,minimumCents:v.minimum_cents,quantityAllowed:!!v.quantity_allowed,gstBasisPoints:v.gst_basis_points,paymentPolicy:v.payment_policy};}
export async function guestPriceVariants(env:Env,serviceId:string,postcode:string,propertyType:string){
 if(env.SERVICE_SALE_VARIANTS_ENABLED!=='true')return {variants:[]};await requireReleaseApproval(env,'sale_variants');
 assert(/^6[0-9]{3}$/.test(postcode)&&PROPERTY_TYPES.includes(propertyType as any),422,'PROPERTY_SCOPE','Provide a valid postcode and property type.');
 const rows=(await statement(env.DB,"SELECT v.* FROM service_sale_variants v JOIN services s ON s.id=v.service_id AND s.active=1 WHERE v.service_id=? AND v.status='approved' AND v.starts_at<=? AND v.expires_at>? AND EXISTS(SELECT 1 FROM json_each(v.postcodes_json) WHERE value=?) AND EXISTS(SELECT 1 FROM json_each(v.property_types_json) WHERE value=?) ORDER BY v.label LIMIT 30",serviceId,now(),now(),postcode,propertyType).all<Variant>()).results;
 return {variants:rows.map(projection)};
}
export async function resolveGuestPrice(env:Env,input:{saleVariantId?:string;saleQuantity?:number;postcode:string;propertyType:string},service:{id:string;active:number}){
 if(!input.saleVariantId)return null;await requireReleaseApproval(env,'sale_variants');
 const v=await statement(env.DB,"SELECT * FROM service_sale_variants WHERE id=? AND service_id=? AND status='approved' AND starts_at<=? AND expires_at>?",input.saleVariantId,service.id,now(),now()).first<Variant>();
 assert(v&&service.active===1&&JSON.parse(v.postcodes_json).includes(input.postcode)&&JSON.parse(v.property_types_json).includes(input.propertyType),409,'PRICE_NOT_APPLICABLE','The approved price does not cover this location/property or has expired.');
 const quantity=input.saleQuantity??1;assert(Number.isSafeInteger(quantity)&&quantity>=1&&quantity<=500&&(v.quantity_allowed===1||quantity===1),422,'PRICE_QUANTITY','This scope does not support that quantity.');
 const ex=Math.max(v.minimum_cents,v.unit_ex_gst_cents*quantity),gst=Math.round(ex*v.gst_basis_points/10000);assert(Number.isSafeInteger(ex)&&ex+gst<=100000000,422,'PRICE_LIMIT','Request a quote for this scope.');
 return {priceExGstCents:ex,gstCents:gst,snapshot:{variantId:v.id,sourceCode:v.source_code,sourceVersion:v.source_version,scopeSha256:v.scope_sha256,label:v.label,scope:v.scope_text,quantity,postcode:input.postcode,propertyType:input.propertyType,priceExGstCents:ex,gstCents:gst,paymentPolicy:v.payment_policy}};
}
