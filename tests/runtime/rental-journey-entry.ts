/**
 * Isolated integration test entrypoint. This file is NEVER imported by
 * production routing, and its synthetic endpoints are unavailable online.
 */
import { publicListing } from '../../apps/platform/worker/features/leasing.server';
import { rentalStartPage, startRental, rentalPage, saveRentalSection, finishRentalApplicant, submitRental } from '../../apps/platform/worker/features/rental-applications.server';
import { updateRentalStatus } from '../../apps/platform/worker/features/rental-review.server';
import { dispatchRentalHandoffs } from '../../apps/platform/worker/features/rental-script-dispatch.server';
import { recordRentalOutcome } from '../../apps/platform/worker/features/rental-outcomes.server';
import { rentalTenancyHandoverStatus,prepareRentalTenancyHandover,activateRentalTenancyHandover,voidRentalTenancyHandover } from '../../apps/platform/worker/features/rental-tenancy-handover.server';
import type { Env } from '../../packages/database/types';
import type { Principal } from '../../packages/domain/index';

export default {
 async fetch(request:Request,env:Env){
  const url=new URL(request.url);
  if(env.APP_ENV!=='local')return new Response('Not available',{status:404});
  const path=url.pathname;
  try{
   if(path==='/__test/listing'){
    return Response.json(await publicListing(env,'residential',url.searchParams.get('slug')??''));
   }
   if(path==='/__test/start-page'){
    return Response.json(await rentalStartPage(env,url.searchParams.get('slug')??''));
   }
   if(path==='/__test/start'&&request.method==='POST'){
    const d=await request.json() as {listingId:string;name:string;email:string;consent:boolean};
    return Response.json(await startRental(env,request,d.listingId,{name:d.name,email:d.email,consent:d.consent}));
   }
   if(path==='/__test/page'&&request.method==='POST'){
    const d=await request.json() as {token:string};
    return Response.json(await rentalPage(env,d.token));
   }
   if(path==='/__test/section'&&request.method==='POST'){
    const d=await request.json() as {token:string;section:'identity'|'rental'|'employment'|'references';raw:Record<string,unknown>;version:number};
    return Response.json(await saveRentalSection(env,d.token,d.section,d.raw,d.version));
   }
   if(path==='/__test/complete'&&request.method==='POST'){
    const d=await request.json() as {token:string;version:number};
    return Response.json(await finishRentalApplicant(env,d.token,{accurate:true,shareWithRepresentative:true,notAnAgreement:true,noticeAcknowledged:true,referenceConsent:false},d.version));
   }
   if(path==='/__test/submit'&&request.method==='POST'){
    const d=await request.json() as {token:string};
    return Response.json(await submitRental(env,d.token));
   }
   if(path==='/__test/staff-ready'&&request.method==='POST'){
    const d=await request.json() as {applicationId:string;version:number};
    const staff={id:'usr_rental_synthetic_staff',staffRole:'operations_manager'} as Principal;
    return Response.json(await updateRentalStatus(env,staff,d.applicationId,{
     version:d.version,status:'ready_for_handoff',note:'Synthetic independent staff review: fictional application approved for transport fixture.'
    }));
   }
   if(path==='/__test/dispatch'&&request.method==='POST'){
    await dispatchRentalHandoffs(env);
    return Response.json({dispatched:true});
   }
   const staff={id:'usr_rental_synthetic_staff',staffRole:'operations_manager'} as Principal;
   if(path==='/__test/agency-outcome'&&request.method==='POST'){
    const d=await request.json() as {applicationId:string;version:number};
    return Response.json(await recordRentalOutcome(env,staff,d.applicationId,{
     version:d.version,outcome:'successful',authorityReference:'SYNTHETIC-WRITTEN-AGENCY-DECISION',
     note:'Synthetic positive decision recorded for a closed-loop tenant invitation test only.',notifyApplicants:true}));
   }
   if(path==='/__test/handover-prepare'&&request.method==='POST'){
    const d=await request.json() as {applicationId:string;applicationVersion:number;requestKey:string};
    return Response.json(await prepareRentalTenancyHandover(env,staff,d.applicationId,{
     requestKey:d.requestKey,applicationVersion:d.applicationVersion,startsOn:'2027-01-10',endsOn:'2027-02-10',
     writtenOfferReference:'SYNTHETIC-SEPARATE-OFFER-AUTHORITY',
     confirmWrittenOffer:true,confirmRecipientAuthority:true,confirmPrivateInvitations:true}));
   }
   if(path==='/__test/handover-status'&&request.method==='POST'){
    const d=await request.json() as {applicationId:string};
    return Response.json(await rentalTenancyHandoverStatus(env,staff,d.applicationId));
   }
   if(path==='/__test/handover-activate'&&request.method==='POST'){
    const d=await request.json() as {applicationId:string};
    return Response.json(await activateRentalTenancyHandover(env,staff,d.applicationId,{
     activationReference:'SYNTHETIC-COMMENCEMENT-REVIEW',
     confirmExecutedAgreement:true,confirmVerifiedParticipants:true,confirmCommencementRecords:true}));
   }
   if(path==='/__test/handover-void'&&request.method==='POST'){
    const d=await request.json() as {applicationId:string};
    return Response.json(await voidRentalTenancyHandover(env,staff,d.applicationId,{reasonReference:'SYNTHETIC-VOID-REVIEW',confirmVoid:true}));
   }
   return new Response('Unknown synthetic test endpoint',{status:404});
  }catch(error){
   const e=error as Error & {status?:number;code?:string};
   return Response.json({error:e.message,code:e.code??null},{status:e.status??422});
  }
 }
};
