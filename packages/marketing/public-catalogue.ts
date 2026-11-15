import type { Service } from '../domain/index.ts';
import type { V4Service } from '../v4/catalogue.ts';
import type { V4Price } from '../v4/workflows.ts';
export const PUBLIC_PRICE_MESSAGE = 'Sign in to view individual service pricing or request a quote.';
/** Explicit allowlist: new database columns cannot accidentally become public prices. */
export function descriptiveCatalogue(services: readonly Service[]) {
  return services.map(s => ({id:s.id,name:s.name,family:s.family,sectors:s.sectors,summary:s.summary,
    duration_minutes:s.duration_minutes,buffer_before:s.buffer_before,buffer_after:s.buffer_after,
    notice_hours:s.notice_hours,horizon_days:s.horizon_days,booking_mode:s.booking_mode,active:s.active,
    price_ex_gst_cents:null}));
}
export function descriptiveV4Service(s: V4Service): V4Service {
  return {id:s.id,name:s.name,sector:s.sector,category:s.category,description:s.description,
    workflowCode:s.workflowCode,pathway:s.pathway,guestAvailability:s.guestAvailability,
    intakeGuide:s.intakeGuide,deliverable:s.deliverable,restrictions:s.restrictions,
    chargingUnit:s.chargingUnit,feeText:PUBLIC_PRICE_MESSAGE,priceRule:'POA',baseCents:null,
    minimumCents:null,staffGuide:'',subscriptionNote:'Scope and any subscription inclusion require a separate agreement.',
    scopeNote:'Scope and authorised extras are confirmed before work.',priority:s.priority,source:''};
}
export function descriptivePrice(unit: string): V4Price {
  return {kind:'quote',totalExGstCents:null,gstCents:null,unit,note:PUBLIC_PRICE_MESSAGE};
}
