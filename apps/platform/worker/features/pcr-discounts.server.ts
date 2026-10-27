import {statement,now,uid,type Env} from '../../../../packages/database/types';
import {pcrRoutineDiscount} from '../../../../packages/finance/pcr-discount';
import {releaseFeatureReady} from './release-governance.server';
export type DiscountOrder={id:string;verified_at:string|null;status:string;service_id:string;sector:string;offer_code?:string|null;purchaser_email_hash?:string|null;price_ex_gst_cents:number|null;gst_cents?:number|null};
export async function eligiblePcrDiscount(env:Env,o:DiscountOrder,propertyId:string|null){
 if(!o.verified_at||!propertyId||!o.purchaser_email_hash||o.service_id!=='routine-inspection'||o.sector!=='residential'||o.offer_code||!['verified','awaiting_appointment'].includes(o.status)||!o.price_ex_gst_cents)return null;
 if(!await releaseFeatureReady(env,'pcr_discount'))return null;
 const e=await statement(env.DB,`SELECT e.id,e.uses_remaining FROM pcr_routine_discount_entitlements e
 JOIN guest_service_orders g ON g.id=e.guest_order_id JOIN payments p ON p.id=e.source_payment_id
 WHERE e.purchaser_email_hash=? AND e.status='active' AND e.uses_remaining>0
 AND g.property_id=? AND g.status='confirmed' AND p.status='paid' AND p.refunded_cents=0
 AND NOT EXISTS(SELECT 1 FROM payment_disputes d WHERE d.payment_id=p.id)
 ORDER BY e.created_at,e.id LIMIT 1`,o.purchaser_email_hash,propertyId).first<{id:string;uses_remaining:number}>();
 if(!e)return null;
 return {entitlementId:e.id,usesRemaining:e.uses_remaining,...pcrRoutineDiscount(o.price_ex_gst_cents,o.gst_cents??Math.round(o.price_ex_gst_cents/10))};
}
export function reservePcrDiscount(env:Env,orderId:string,propertyId:string,paymentId:string,d:NonNullable<Awaited<ReturnType<typeof eligiblePcrDiscount>>>){
 return statement(env.DB,`INSERT INTO pcr_discount_reservations(id,entitlement_id,guest_order_id,payment_id,property_id,base_ex_gst_cents,base_gst_cents,discount_cents,total_cents,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,uid('pcrr'),d.entitlementId,orderId,paymentId,propertyId,d.baseExGstCents,d.baseGstCents,d.discountCents,d.totalCents,now(),now());
}
export function releaseUnstartedPcrDiscount(env:Env,orderId:string){
 return statement(env.DB,`UPDATE pcr_discount_reservations SET status='released',updated_at=? WHERE guest_order_id=? AND status='reserved'
 AND NOT EXISTS(SELECT 1 FROM payment_checkout_attempts a WHERE a.payment_id=pcr_discount_reservations.payment_id)
 AND EXISTS(SELECT 1 FROM payments p WHERE p.id=pcr_discount_reservations.payment_id AND p.status IN('payment_required','failed'))`,now(),orderId);
}
export function settlePcrDiscount(env:Env,paymentId:string){
 return statement(env.DB,"UPDATE pcr_discount_reservations SET status='redeemed',updated_at=? WHERE payment_id=? AND status='reserved'",now(),paymentId);
}
export function suspendPcrBenefits(env:Env,paymentId:string){
 return [statement(env.DB,"UPDATE pcr_routine_discount_entitlements SET status='suspended',updated_at=? WHERE source_payment_id=? AND status='active'",now(),paymentId),
 statement(env.DB,"UPDATE pcr_discount_reservations SET status='exception',updated_at=? WHERE entitlement_id IN(SELECT id FROM pcr_routine_discount_entitlements WHERE source_payment_id=?) AND status='reserved'",now(),paymentId)];
}
