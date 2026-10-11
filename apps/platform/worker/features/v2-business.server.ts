import { z } from 'zod';
import { assert, now, statement, uid, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import { operationsWrite, booksServices, propertyScope } from '../../../../packages/authorization/server';
import { activity, guard, clearGuard, recordId, shortText, reference, isoDate } from '../../../../packages/operations/core';
import { calculateV2Quote } from '../../../../packages/v2/pricing';

const n = (max = 100000000) => z.coerce.number().int().min(0).max(max);
const id = recordId;
const assetRef = z.string().regex(/^[a-zA-Z0-9_:-]+$/).max(180);
const planRef = z.string().regex(/^[A-Z]{3}:(inspection|standard|outsourced):v[0-9]+$/).max(80);
const scope = z.object({propertyId: id.optional(), schemeId: id.optional()}).refine(
  v => Boolean(v.propertyId) !== Boolean(v.schemeId),
  'Choose exactly one property or scheme'
);
const choice = <T extends readonly [string,...string[]]>(values: T) => z.enum(values);
const booleanString = z.union([z.boolean(), z.enum(['true','false']).transform(v=>v==='true')]);
function staffReader(user: Principal, w: Workspace) {
  assert(w.kind==='staff' && user.staffRole && user.staffRole!=='inspector',403,
    'V2_STAFF_REQUIRED','The V2 business register is restricted to authorised ProInspect staff.');
}
function staffEditor(user: Principal, w: Workspace) {
  staffReader(user,w);
  operationsWrite(user);
}
function onlyOne(propertyId?: string, schemeId?: string) {
  assert(Boolean(propertyId)!==Boolean(schemeId),422,'V2_SCOPE_REQUIRED','Select one property or scheme.');
}
async function contextExists(env: Env, propertyId?: string, schemeId?: string) {
  onlyOne(propertyId,schemeId);
  const table=propertyId?'properties':'strata_schemes';
  const found=await statement(env.DB,'SELECT id FROM '+table+' WHERE id=?',propertyId??schemeId??'').first();
  assert(found,422,'V2_CONTEXT_UNKNOWN','The selected property or scheme does not exist.');
}
function saved(env: Env, user: Principal, event: string, entity: string, entityId: string, propertyId: string | null = null, schemeId: string | null = null) {
  return activity(env,user,event,entity,entityId,propertyId,schemeId);
}
async function transaction(env: Env, user: Principal, sql: string, args: (string|number|null)[], event: string, entity: string, entityId: string, propertyId:string|null=null,schemeId:string|null=null) {
  await env.DB.batch([statement(env.DB,sql,...args),guard(env),saved(env,user,event,entity,entityId,propertyId,schemeId),clearGuard(env)]);
}
export async function v2StaffData(env: Env, user: Principal, w: Workspace, market: string) {
  staffReader(user,w);
  assert(/^[A-Z]{3}$/.test(market),422,'V2_MARKET_INVALID','Choose a recognised property market.');
  const [
    markets,services,rules,plans,assets,assignments,engagements,subscriptions,usage,rateCards,quotes,clients,properties,schemes,
  ]=await Promise.all([
    statement(env.DB,'SELECT * FROM v2_markets ORDER BY code').all(),
    statement(env.DB,'SELECT code,name,family,summary,status,legacy_service_id,delivery_gate,version FROM v2_services ORDER BY code').all(),
    statement(env.DB,'SELECT r.*,s.name FROM v2_market_service_rules r JOIN v2_services s ON s.code=r.service_code WHERE r.market_code=? ORDER BY r.service_code',market).all(),
    statement(env.DB,'SELECT * FROM v2_plan_versions ORDER BY market_code,plan_code,version DESC LIMIT 200').all(),
    statement(env.DB,'SELECT * FROM v2_assets ORDER BY created_at,id DESC LIMIT 250').all(),
    statement(env.DB,'SELECT * FROM v2_asset_markets ORDER BY market_code,id LIMIT 250').all(),
    statement(env.DB,'SELECT * FROM v2_engagements ORDER BY created_at DESC LIMIT 100').all(),
    statement(env.DB,'SELECT * FROM v2_subscription_periods ORDER BY created_at DESC LIMIT 100').all(),
    statement(env.DB,'SELECT subscription_id,service_code,metric,SUM(quantity) AS consumed FROM v2_usage_ledger GROUP BY subscription_id,service_code,metric ORDER BY subscription_id LIMIT 150').all(),
    statement(env.DB,'SELECT * FROM v2_rate_cards ORDER BY created_at DESC LIMIT 100').all(),
    statement(env.DB,'SELECT id,client_id,market_code,service_code,amount_ex_gst_cents,gst_cents,total_cents,created_at FROM v2_quote_snapshots ORDER BY created_at DESC LIMIT 60').all(),
    statement(env.DB,"SELECT id,name,client_type FROM clients WHERE status='active' ORDER BY name LIMIT 300").all(),
    statement(env.DB,"SELECT id,address,suburb,sector FROM properties WHERE archived_at IS NULL ORDER BY address LIMIT 300").all(),
    statement(env.DB,"SELECT id,name,scheme_number FROM strata_schemes ORDER BY name LIMIT 300").all(),
  ]);
  return {markets:markets.results,services:services.results,rules:rules.results,plans:plans.results,
    assets:assets.results,assignments:assignments.results,engagements:engagements.results,
    subscriptions:subscriptions.results,usage:usage.results,rateCards:rateCards.results,quotes:quotes.results,
    clients:clients.results,properties:properties.results,schemes:schemes.results,
    ruleMarket:market, draftOnly: true};
}
export async function v2CustomerData(env:Env,user:Principal,w:Workspace) {
  assert(booksServices(w),403,'V2_CLIENT_REQUIRED','Choose an authorised customer workspace.');
  const current=await statement(env.DB,
    "SELECT c.id FROM clients c JOIN client_memberships m ON m.client_id=c.id JOIN client_entitlements ce ON ce.client_id=c.id AND ce.workspace_kind=? AND ce.active=1 WHERE c.id=? AND c.status='active' AND m.user_id=? AND m.active=1",
    w.kind,w.scopeId,user.id).first();
  assert(current,403,'V2_CLIENT_FORBIDDEN','The current customer account is unavailable.');
  // Only activated engagements appear in a customer account. Draft proposals remain Staff-only.
  // Reuse the canonical portfolio/management scope. Being a client member does not
  // grant access to every property or every scheme in a professional portfolio.
  const ps=propertyScope(user,w);
  const time=now();
  const scopedSql="SELECT e.id,e.reference,e.market_code,e.scope_summary,e.property_id,e.scheme_id,e.status,e.starts_at,e.ends_at FROM v2_engagements e WHERE e.client_id=? AND e.status IN('active','paused','ended') AND ("
    +"(e.property_id IS NOT NULL AND EXISTS(SELECT 1 FROM properties p WHERE p.id=e.property_id AND ("+ps.sql+")))"
    +" OR (e.scheme_id IS NOT NULL AND ?='strata-manager' AND EXISTS(SELECT 1 FROM scheme_client_links l WHERE l.scheme_id=e.scheme_id AND l.client_id=? AND l.role IN('strata_manager','building_manager') AND l.starts_at<=? AND (l.ends_at IS NULL OR l.ends_at>?)))"
    +") ORDER BY e.created_at DESC LIMIT 100";
  const engagements=await statement(env.DB,scopedSql,w.scopeId,...ps.values,w.kind,w.scopeId,time,time).all<{id:string}>();
  const ids=engagements.results.map(e=>e.id);
  if (!ids.length)return {engagements:[],subscriptions:[],usage:[]};
  const slots=ids.map(()=>'?').join(',');
  const subscriptions=await statement(env.DB,
    "SELECT sp.id,sp.engagement_id,sp.period_start,sp.period_end,sp.agreed_monthly_cents,sp.status,p.plan_code,p.included_hours_milli,p.included_visits,p.included_tickets,p.included_reports FROM v2_subscription_periods sp JOIN v2_plan_versions p ON p.id=sp.plan_id WHERE sp.engagement_id IN ("+slots+") ORDER BY sp.period_start DESC",
    ...ids).all();
  const subscriptionIds=subscriptions.results.map(x=>(x as {id:string}).id);
  const usage=subscriptionIds.length?await statement(env.DB,
    "SELECT subscription_id,service_code,metric,SUM(quantity) AS consumed FROM v2_usage_ledger WHERE subscription_id IN ("+subscriptionIds.map(()=>'?').join(',')+") GROUP BY subscription_id,service_code,metric",
    ...subscriptionIds).all():{results:[]};
  return {engagements:engagements.results,subscriptions:subscriptions.results,usage:usage.results};
}
export async function v2Command(env: Env, user: Principal, w: Workspace, area: string, key: string|undefined, action: string|undefined, input: unknown) {
  staffEditor(user,w);
  const data=input;
  if(area==='assets' && !key) {
    const d=scope.and(z.object({kind:choice(['building','premises','lot','common_area','plant','equipment','facility','infrastructure','other']),name:shortText,parentId:assetRef.optional(),reference:z.string().trim().max(200).optional()})).parse(data);
    await contextExists(env,d.propertyId,d.schemeId);
    const assetId=uid('v2a');
    await transaction(env,user,
      'INSERT INTO v2_assets(id,property_id,scheme_id,parent_id,kind,name,reference,created_at) VALUES(?,?,?,?,?,?,?,?)',
      [assetId,d.propertyId??null,d.schemeId??null,d.parentId??null,d.kind,d.name,d.reference??null,now()],
      'v2.asset_created','asset',assetId,d.propertyId??null,d.schemeId??null);
    return {id:assetId};
  }
  if(area==='asset-markets' && !key) {
    const d=scope.and(z.object({marketCode:choice(['RES','COM','STR','CTS','STA','SOC','SDA','RET','AGE','RUR','INS'])})).parse(data);
    await contextExists(env,d.propertyId,d.schemeId);
    const assetMarketId=uid('v2am');
    await transaction(env,user,
      'INSERT INTO v2_asset_markets(id,property_id,scheme_id,market_code) VALUES(?,?,?,?)',
      [assetMarketId,d.propertyId??null,d.schemeId??null,d.marketCode],
      'v2.asset_market_proposed','asset-market',assetMarketId,d.propertyId??null,d.schemeId??null);
    return {id:assetMarketId};
  }
  if(area==='asset-markets' && key && action==='review') {
    const d=z.object({status:choice(['approved','blocked']),verificationReference:reference.optional()}).parse(data);
    if(d.status==='approved') assert(d.verificationReference,422,'V2_REVIEW_REFERENCE_REQUIRED','Record the evidence supporting this property-market classification.');
    await transaction(env,user,"UPDATE v2_asset_markets SET status=?,verified_by=?,verified_at=?,verification_reference=? WHERE id=? AND status='proposed'",
      [d.status,user.id,now(),d.verificationReference??null,key],'v2.asset_market_reviewed','asset-market',key);
    return {id:key,status:d.status};
  }
  if(area==='markets' && key && action==='enable') {
    const d=z.object({enabled:booleanString}).parse(data);
    await transaction(env,user,'UPDATE v2_markets SET enabled=? WHERE code=?',
      [d.enabled?1:0,key],'v2.market_availability_changed','market',key);
    return {market:key,enabled:d.enabled};
  }
  if(area==='services' && key && action==='review') {
    const d=z.object({status:choice(['review','approved']),approvalReference:reference.optional()}).parse(data);
    if(d.status==='approved') assert(d.approvalReference,422,'V2_REVIEW_REFERENCE_REQUIRED','Record the approved service scope and responsible reviewer.');
    await transaction(env,user,
      "UPDATE v2_services SET status=?,approved_by=?,approved_at=?,approval_reference=? WHERE code=? AND status IN ('draft','review')",
      [d.status,d.status==='approved'?user.id:null,d.status==='approved'?now():null,d.approvalReference??null,key],
      'v2.service_reviewed','service',key);
    return {service:key,status:d.status};
  }
  if(area==='rules' && !key) {
    const d=z.object({marketCode:choice(['RES','COM','STR','CTS','STA','SOC','SDA','RET','AGE','RUR','INS']),serviceCode:id,status:choice(['proposed','approved','blocked']),notes:z.string().trim().max(500).default('')}).parse(data);
    const existing=await statement(env.DB,'SELECT status FROM v2_market_service_rules WHERE market_code=? AND service_code=?',d.marketCode,d.serviceCode).first();
    if(existing) {
      await transaction(env,user,'UPDATE v2_market_service_rules SET status=?,notes=?,verified_by=?,verified_at=? WHERE market_code=? AND service_code=?',
        [d.status,d.notes,d.status==='proposed'?null:user.id,d.status==='proposed'?null:now(),d.marketCode,d.serviceCode],
        'v2.market_service_reviewed','market-service',d.marketCode+':'+d.serviceCode);
    } else {
      assert(d.status==='proposed',422,'V2_REVIEW_FIRST','New market/service rules must first be proposed.');
      await transaction(env,user,'INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES(?,?,?,?)',
        [d.marketCode,d.serviceCode,d.status,d.notes],
        'v2.market_service_proposed','market-service',d.marketCode+':'+d.serviceCode);
    }
    return {marketCode:d.marketCode,serviceCode:d.serviceCode,status:d.status};
  }
  if(area==='plans' && key && action==='configure') {
    const d=z.object({includedHoursMilli:n(),includedVisits:n(1000000),includedTickets:n(1000000),includedReports:n(1000000),monthlyFeeCents:n()}).parse(data);
    await transaction(env,user,
      "UPDATE v2_plan_versions SET included_hours_milli=?,included_visits=?,included_tickets=?,included_reports=?,monthly_fee_cents=? WHERE id=? AND status='draft'",
      [d.includedHoursMilli,d.includedVisits,d.includedTickets,d.includedReports,d.monthlyFeeCents,key],
      'v2.plan_configured','plan',key);
    return {id:key};
  }
  if(area==='plans' && key && action==='service') {
    const d=z.object({serviceCode:id,inclusion:choice(['included','optional','excluded'])}).parse(data);
    const plan=await statement(env.DB,"SELECT id FROM v2_plan_versions WHERE id=? AND status='draft'",key).first();
    assert(plan,409,'V2_PLAN_LOCKED','Only a draft plan can be configured.');
    await env.DB.batch([
      statement(env.DB,'INSERT INTO v2_plan_services(plan_id,service_code,inclusion) VALUES(?,?,?) ON CONFLICT(plan_id,service_code) DO UPDATE SET inclusion=excluded.inclusion',
        key,d.serviceCode,d.inclusion),
      saved(env,user,'v2.plan_service_configured','plan',key)
    ]);
    return {id:key,serviceCode:d.serviceCode};
  }
  if(area==='plans' && key && action==='limit') {
    const d=z.object({serviceCode:id,metric:choice(['hours_milli','visits','tickets','reports']),limitQuantity:n()}).parse(data);
    const plan=await statement(env.DB,"SELECT id FROM v2_plan_versions WHERE id=? AND status='draft'",key).first();
    assert(plan,409,'V2_PLAN_LOCKED','Only a draft plan can be configured.');
    await env.DB.batch([
      statement(env.DB,'INSERT INTO v2_plan_entitlements(plan_id,service_code,metric,limit_quantity) VALUES(?,?,?,?) ON CONFLICT(plan_id,service_code,metric) DO UPDATE SET limit_quantity=excluded.limit_quantity',
        key,d.serviceCode,d.metric,d.limitQuantity),
      saved(env,user,'v2.plan_limit_configured','plan',key)
    ]);
    return {id:key,serviceCode:d.serviceCode};
  }
  if(area==='plans' && key && action==='approve') {
    await transaction(env,user,"UPDATE v2_plan_versions SET status='approved',approved_by=?,approved_at=? WHERE id=? AND status='draft'",
      [user.id,now(),key],'v2.plan_approved','plan',key);
    return {id:key,status:'approved'};
  }
  if(area==='rate-cards' && !key) {
    const d=z.object({
      marketCode:choice(['RES','COM','STR','CTS','STA','SOC','SDA','RET','AGE','RUR','INS']),
      version:z.coerce.number().int().min(1).max(1000),
      loadedHourlyCents:n(),travelVisitCents:n(),fixedAdminCents:n(),
      contingencyBp:n(5000),targetMarginBp:n(9500),gstBp:n(3000)
    }).parse(data);
    const rateCardId=uid('v2rc');
    await env.DB.batch([
      statement(env.DB,'INSERT INTO v2_rate_cards(id,market_code,version,loaded_hourly_cents,travel_visit_cents,fixed_admin_cents,contingency_bp,target_margin_bp,gst_bp,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
        rateCardId,d.marketCode,d.version,d.loadedHourlyCents,d.travelVisitCents,d.fixedAdminCents,d.contingencyBp,d.targetMarginBp,d.gstBp,now()),
      saved(env,user,'v2.rate_card_drafted','rate-card',rateCardId)
    ]);
    return {id:rateCardId};
  }
  if(area==='rate-cards' && key && action==='approve') {
    const d=z.object({approvalReference:reference}).parse(data);
    await transaction(env,user,"UPDATE v2_rate_cards SET status='approved',approved_by=?,approved_at=?,approval_reference=? WHERE id=? AND status='draft'",
      [user.id,now(),d.approvalReference,key],'v2.rate_card_approved','rate-card',key);
    return {id:key,status:'approved'};
  }
  if(area==='engagements' && !key) {
    const d=scope.and(z.object({
      clientId:id,marketCode:choice(['RES','COM','STR','CTS','STA','SOC','SDA','RET','AGE','RUR','INS']),
      reference,scopeSummary:shortText,startsAt:isoDate,endsAt:isoDate.optional(),
    })).parse(data);
    await contextExists(env,d.propertyId,d.schemeId);
    assert(!d.endsAt||d.endsAt>d.startsAt,422,'V2_ENGAGEMENT_DATES','Contract end must follow start.');
    const engagementId=uid('v2e');
    await env.DB.batch([
      statement(env.DB,
        'INSERT INTO v2_engagements(id,client_id,property_id,scheme_id,market_code,reference,scope_summary,starts_at,ends_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        engagementId,d.clientId,d.propertyId??null,d.schemeId??null,d.marketCode,d.reference,d.scopeSummary,d.startsAt,d.endsAt??null,user.id,now()),
      saved(env,user,'v2.engagement_drafted','engagement',engagementId,d.propertyId??null,d.schemeId??null)
    ]);
    return {id:engagementId};
  }
  if(area==='engagements' && key && action==='activate') {
    const d=z.object({authorityReference:reference}).parse(data);
    await transaction(env,user,
      "UPDATE v2_engagements SET status='active',authority_reference=?,verified_by=?,verified_at=? WHERE id=? AND status='draft'",
      [d.authorityReference,user.id,now(),key],
      'v2.engagement_activated','engagement',key);
    return {id:key,status:'active'};
  }
  if(area==='engagements' && key && action==='status') {
    const d=z.object({status:choice(['active','paused','ended'])}).parse(data);
    const old=await statement(env.DB,'SELECT status FROM v2_engagements WHERE id=?',key).first<{status:string}>();
    assert(old,404,'V2_ENGAGEMENT_NOT_FOUND','The engagement was not found.');
    const transitions:Record<string,string[]>={active:['paused','ended'],paused:['active','ended']};
    assert(transitions[old.status]?.includes(d.status),409,'V2_ENGAGEMENT_TRANSITION','This engagement status cannot be changed.');
    await transaction(env,user,'UPDATE v2_engagements SET status=?,version=version+1 WHERE id=? AND status=?',
      [d.status,key,old.status],'v2.engagement_status_changed','engagement',key);
    return {id:key,status:d.status};
  }
  if(area==='subscriptions' && key && action==='end') {
    await transaction(env,user,"UPDATE v2_subscription_periods SET status='ended' WHERE id=? AND status='active'",
      [key],'v2.subscription_ended','subscription',key);
    return {id:key,status:'ended'};
  }
  if(area==='subscriptions' && !key) {
    const d=z.object({engagementId:id,planId:planRef,periodStart:isoDate,periodEnd:isoDate,
      agreedMonthlyCents:n()}).parse(data);
    assert(d.periodEnd>d.periodStart,422,'V2_PERIOD_INVALID','The agreement period must end after it starts.');
    const subscriptionId=uid('v2s');
    await env.DB.batch([
      statement(env.DB,
        'INSERT INTO v2_subscription_periods(id,engagement_id,plan_id,period_start,period_end,agreed_monthly_cents,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)',
        subscriptionId,d.engagementId,d.planId,d.periodStart,d.periodEnd,d.agreedMonthlyCents,user.id,now()),
      saved(env,user,'v2.subscription_started','subscription',subscriptionId)
    ]);
    return {id:subscriptionId};
  }
  if(area==='usage' && !key) {
    const d=z.object({subscriptionId:id,serviceCode:id,metric:choice(['hours_milli','visits','tickets','reports']),
      quantity:z.coerce.number().int().positive().max(100000000),sourceKey:reference,
      bookingId:id.optional(),workOrderId:id.optional()}).parse(data);
    onlyOne(d.bookingId,d.workOrderId);
    const usageId=uid('v2u');
    await env.DB.batch([
      statement(env.DB,'INSERT INTO v2_usage_ledger(id,subscription_id,service_code,metric,quantity,source_key,booking_id,work_order_id,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
        usageId,d.subscriptionId,d.serviceCode,d.metric,d.quantity,d.sourceKey,d.bookingId??null,d.workOrderId??null,user.id,now()),
      saved(env,user,'v2.usage_recorded','usage',usageId)
    ]);
    return {id:usageId};
  }
  if(area==='quotes' && !key) {
    const d=scope.and(z.object({clientId:id,marketCode:choice(['RES','COM','STR','CTS','STA','SOC','SDA','RET','AGE','RUR','INS']),
      serviceCode:id,rateCardId:id,engagementId:id.optional(),
      hoursMilli:n(),visits:n(10000),quantity:z.coerce.number().int().min(1).max(10000),
      complexityBp:z.coerce.number().int().min(1000).max(50000),
      externalPassThroughCents:n()
    })).parse(data);
    await contextExists(env,d.propertyId,d.schemeId);
    const rate=await statement(env.DB,
      "SELECT loaded_hourly_cents,travel_visit_cents,fixed_admin_cents,contingency_bp,target_margin_bp,gst_bp FROM v2_rate_cards WHERE id=? AND market_code=? AND status='approved'",
      d.rateCardId,d.marketCode).first<{loaded_hourly_cents:number;travel_visit_cents:number;fixed_admin_cents:number;contingency_bp:number;target_margin_bp:number;gst_bp:number}>();
    assert(rate,409,'V2_RATE_NOT_APPROVED','An approved rate card is required.');
    const calculated=calculateV2Quote({
      hoursMilli:d.hoursMilli,visits:d.visits,quantity:d.quantity,complexityBp:d.complexityBp,
      externalPassThroughCents:d.externalPassThroughCents,loadedHourlyCents:rate.loaded_hourly_cents,
      travelVisitCents:rate.travel_visit_cents,fixedAdminCents:rate.fixed_admin_cents,
      contingencyBp:rate.contingency_bp,targetMarginBp:rate.target_margin_bp,gstBp:rate.gst_bp
    });
    const quoteId=uid('v2q');
    await env.DB.batch([
      statement(env.DB,
        "INSERT INTO v2_quote_snapshots(id,client_id,property_id,scheme_id,market_code,service_code,rate_card_id,engagement_id,calculation_json,amount_ex_gst_cents,gst_cents,total_cents,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        quoteId,d.clientId,d.propertyId??null,d.schemeId??null,d.marketCode,d.serviceCode,d.rateCardId,d.engagementId??null,
        JSON.stringify({inputs:d,costs:rate,result:calculated}),calculated.exGstCents,calculated.gstCents,calculated.totalCents,user.id,now()),
      saved(env,user,'v2.quote_calculated','quote',quoteId,d.propertyId??null,d.schemeId??null)
    ]);
    return {id:quoteId,pricing:calculated,status:'draft'};
  }
  assert(false,404,'V2_OPERATION_UNKNOWN','The requested V2 business operation is not available.');
}
