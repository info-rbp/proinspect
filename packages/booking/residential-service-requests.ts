import { z } from 'zod';
import { RESIDENTIAL_REQUEST_ONLY, RESIDENTIAL_SERVICE_IDS } from '../service-catalogue/residential-workflows';

/** Intake is confidential and separate from the visible request summary. */
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value =>
  !Number.isNaN(Date.parse(value+'T00:00:00Z')) &&
    new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value,
  'Choose a valid calendar date.');
const recipient = z.object({
  name:z.string().trim().min(2).max(120),
  email:z.string().trim().toLowerCase().email().max(254),
});
export const residentialServiceRequestIntakeSchema = z.object({
  serviceCode:z.string().trim().min(3).max(100),
  preferredDate:date.optional(),
  timeFrame:z.enum(['morning','afternoon','evening']).optional(),
  preferredTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  marketingRequested:z.boolean().default(false),
  tenantApplicationRequested:z.boolean().default(false),
  recipients:z.array(recipient).max(10).default([]),
  attendeeName:z.string().trim().max(120).optional(),
  attendeeEmail:z.union([z.string().trim().toLowerCase().email(),z.literal('')]).optional(),
  attendeePhone:z.string().trim().max(40).optional(),
  claimReference:z.string().trim().max(150).optional(),
  incidentDate:date.optional(),
  listingPlatforms:z.string().trim().max(300).optional(),
  rentReviewInstructions:z.string().trim().max(1000).optional(),
}).superRefine((value,ctx)=>{
  if(!RESIDENTIAL_SERVICE_IDS.has(value.serviceCode) &&
    !RESIDENTIAL_REQUEST_ONLY.some(s=>s.id===value.serviceCode)) {
    ctx.addIssue({code:'custom',path:['serviceCode'],message:'Choose a known residential service.'});
  }
  if(value.serviceCode==='open-home'&&(!value.preferredDate||!value.timeFrame))
    ctx.addIssue({code:'custom',path:['preferredDate'],message:'Choose the preferred date and morning, afternoon or evening.'});
  if(value.serviceCode==='private-open-home'&&(!value.preferredDate||!value.preferredTime))
    ctx.addIssue({code:'custom',path:['preferredTime'],message:'Choose a preferred date and exact time for your private viewing.'});
  if(value.serviceCode==='video-walkthrough-property'&&!value.recipients.length)
    ctx.addIssue({code:'custom',path:['recipients'],message:'Enter at least one authorised video recipient.'});
  if(value.serviceCode!=='open-home'&&value.serviceCode!=='private-open-home' &&
    (value.marketingRequested||value.tenantApplicationRequested))
    ctx.addIssue({code:'custom',path:['marketingRequested'],
      message:'Leasing add-ons can only be requested alongside an Open Home.'});
  if(value.serviceCode==='private-open-home'&&
    ![value.attendeeName,value.attendeeEmail,value.attendeePhone].some(Boolean))
    ctx.addIssue({code:'custom',path:['attendeeName'],
      message:'Provide a private viewing attendee or contact.'});
});
export type ResidentialServiceRequestIntake = z.infer<typeof residentialServiceRequestIntakeSchema>;

const groupStart:Record<'morning'|'afternoon'|'evening',string> = {
  morning:'08:00',afternoon:'12:00',evening:'17:00',
};
export function assertOpenHomeLead(
  intake: ResidentialServiceRequestIntake,clock=Date.now(),
): void {
  if(intake.serviceCode!=='open-home') return;
  if(!intake.preferredDate||!intake.timeFrame)
    throw new Error('Choose a preferred Open Home date and time frame.');
  const start = new Date(`${intake.preferredDate}T${groupStart[intake.timeFrame]}:00+08:00`);
  if(Number.isNaN(start.getTime())||start.getTime()<clock+72*3600000)
    throw new Error('Standard Open Homes require at least 72 hours notice.');
}
