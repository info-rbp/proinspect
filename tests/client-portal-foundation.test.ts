import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PUBLIC_NAVIGATION } from '../packages/marketing/public-navigation.ts';
import { resolveClientAreas } from '../packages/domain/client-navigation.ts';
import type { Workspace, Property, Service } from '../packages/domain/index.ts';
const read=(path:string)=>readFileSync(path,'utf8');
const w=(kind:Workspace['kind'],role='owner'):Workspace=>({kind,scopeId:'client_a',href:'/w/'+kind+'/client_a',name:'Example',role});
const prop=(sector:string):Property=>({id:'prop_a',address:'Example',suburb:'Perth',state:'WA',postcode:'6000',property_type:'House',sector});
const svc=(sectors:string[]):Service=>({id:'svc',name:'Inspection',family:'inspections',sectors,summary:'',duration_minutes:45,buffer_before:0,buffer_after:0,notice_hours:1,horizon_days:30,price_ex_gst_cents:10000,booking_mode:'instant',active:1});
test('public navigation reflects the twelve approved destinations in order',()=>{
 assert.deepEqual(PUBLIC_NAVIGATION.map(x=>x.label),['Home','Residential','Commercial','Strata','Co-Living','Construction','Leasing','Maintenance','About Us','Who We Help','Sign Up / Sign In','Contact Us']);
 const routes=read('apps/platform/app/routes.ts');
 for(const path of ['residential','commercial','strata','co-living','construction','leasing','maintenance'])assert.ok(routes.includes("route('"+path+"'"));
 assert.match(routes,/route\('client', 'routes\/client-entry\.tsx'\)/);
});
test('different verified account types have different navigation',()=>{
 const residential=resolveClientAreas(w('landlord'),[prop('residential')],[],['maintenance'],[svc(['residential'])]);
 assert.ok(residential.some(x=>x.area==='residential'&&x.status==='available'));
 assert.ok(!residential.some(x=>x.area==='commercial'&&x.status==='available'));
 const commercial=resolveClientAreas(w('commercial'),[prop('commercial')],[],[],[svc(['commercial'])]);
 assert.ok(commercial.some(x=>x.area==='commercial'&&x.status==='available'));
 assert.ok(!commercial.some(x=>x.area==='residential'&&x.status==='available'));
 const strata=resolveClientAreas(w('strata-manager'),[],[{id:'scheme_1'}],[],[svc(['strata-building'])]);
 assert.ok(strata.some(x=>x.area==='strata'&&x.status==='available'));
});
test('requests never make unfinished sectors bookable',()=>{
 const list=resolveClientAreas(w('landlord'),[prop('residential')],[],['co-living','construction','commercial'],[svc(['residential'])]);
 for(const name of ['co-living','construction']) assert.deepEqual(list.find(x=>x.area===name)?.status,'planned');
 assert.equal(list.find(x=>x.area==='commercial')?.href,null);
});
test('resident and staff workspaces have no customer service tabs',()=>{
 for(const kind of ['tenant','building','council','building-manager','staff'] as Workspace['kind'][])assert.deepEqual(resolveClientAreas(w(kind),[prop('residential')],[],['residential'],[svc(['residential'])]),[]);
});
test('client selections do not change existing financial or booking mutations',()=>{
 const pref=read('apps/platform/worker/features/client-service-interests.server.ts');
 assert.match(pref,/clientMembership\(env,user,clientId,true\)/);
 assert.match(pref,/\['owner','admin'\]/);
 assert.ok(!pref.includes('stripe'));
 const routes=read('apps/platform/app/routes.ts');
 assert.match(routes,/route\('book\/:serviceId\?', 'routes\/book\.tsx'\)/);
});
