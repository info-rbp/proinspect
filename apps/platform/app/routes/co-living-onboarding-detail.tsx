import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace, workspaceApi } from '../lib/workspace';
import { PageHeading, Badge } from '../../../../packages/ui/components';
import { OperationForm, Input, Select, TextArea, choices } from '../components/OperationForm';
import {
  CO_LIVING_ONBOARDING_STAGES, CO_LIVING_ONBOARDING_GUIDE,
  type CoLivingOnboardingStage,
} from '../../../../packages/domain/co-living-onboarding';

export async function loader({request,context,params}:LoaderFunctionArgs){
  return await loadApi(request,context,
    '/api/w/'+params.kind+'/'+params.scopeId+'/co-living-onboardings/'+params.projectId);
}
const dollars=(c:number|null|undefined)=>
  new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format((c??0)/100);
const textStatus=(s:string)=>s.replaceAll('_',' ');
export default function CoLivingOnboardingDetail(){
  const d=useLoaderData<typeof loader>() as any;
  const w=useWorkspace().workspace,user=useWorkspace().user;
  const p=d.project as any,staff=w.kind==='staff',stage=p.stage as CoLivingOnboardingStage;
  const root=w.href+'/co-living-onboardings',endpoint=workspaceApi(w.kind,w.scopeId)+'/co-living-onboardings/'+p.id;
  const guide=CO_LIVING_ONBOARDING_GUIDE[stage],proposals=d.proposals??[],
    checks=d.checks??[],tasks=d.tasks??[],items=d.items??[],variations=d.variations??[];
  const ownerActions=['owner','admin'].includes(w.role)&&!staff;
  const proposal=proposals.find((v:any)=>v.status==='issued')??proposals.find((v:any)=>v.status==='accepted')??proposals[0];
  const derivedKeys=new Set(['assessment_reviewed','verified_owner_authority','current_proposal_issued',
    'establishment_budget_approved','first_tenancy_active']);
  const hasCheck=(code:string)=>checks.find((c:any)=>c.code===code);
  const ownerBudget=(proposals.find((v:any)=>v.status==='accepted')??{}),
    variationBudget=variations.filter((v:any)=>v.status==='approved').reduce((s:number,v:any)=>s+v.extra_budget_cents,0);
  const authorisedBudget=(ownerBudget.furnishing_budget_cents??0)+(ownerBudget.works_budget_cents??0)+variationBudget;
  const committed=items.filter((i:any)=>['ordered','delivered','installed'].includes(i.status))
    .reduce((sum:number,i:any)=>sum+(i.actual_total_cents??i.unit_cost_cents*i.quantity),0);
  return <>
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <Link to={root}>{staff?'Co-Living Establishments':'Co-Living Onboarding'}</Link><span>/</span><span>{p.address}</span>
    </nav>
    <PageHeading eyebrow={(staff?'ProInspect Operations':'Residential / Co-Living')+' · '+p.suburb}
      title={p.address}
      description={'Property onboarding · '+guide.label+' · '+textStatus(p.status)}/>
    <div className="stack">
      <section className="panel stack">
        <div className="panel-header"><h2>Your Co-Living establishment journey</h2><Badge status={p.status}/></div>
        <div className="grid-3">
          {CO_LIVING_ONBOARDING_STAGES.map((s,i)=><article key={s} className="panel">
            <p className="eyebrow">Stage {i+1} of 6</p>
            <h3>{CO_LIVING_ONBOARDING_GUIDE[s].label}</h3>
            <p className="small">{CO_LIVING_ONBOARDING_STAGES.indexOf(s)<CO_LIVING_ONBOARDING_STAGES.indexOf(stage)
              ?'Completed':s===stage?'Current stage':'Not started'}</p>
          </article>)}
        </div>
        <h3>{guide.label}: What ProInspect is doing</h3>
        <p>{guide.summary}</p>
        <p><strong>What we need from you:</strong> {guide.ownerAction}</p>
        <p><strong>Stage deliverable:</strong> {guide.deliverable}</p>
        <p className="small">An onboarding stage does not itself certify planning, building, tenancy or financial approvals.</p>
      </section>

      <section className="panel stack">
        <h2>Current stage — requirements and progress</h2>
        {d.stageRequirements?.length?<div className="record-list">{d.stageRequirements.map((code:string)=>{
          const c=hasCheck(code),derived=derivedKeys.has(code);
          return <div className="record-row" key={code}>
            <div><strong>{textStatus(code)}</strong><p className="small">{c?.status??(derived?'Checked against system records':'Not submitted')}</p></div>
            {staff&&!derived&&p.status==='active'&&stage!=='tenanted'&&
              (c?.status!=='verified')&&
              <div className="stack">
                <OperationForm endpoint={endpoint} defaults={{action:'submit_check',code}}
                  label={c?.status==='rejected'?'Resubmit evidence':'Submit evidence'}>
                  <Input name="evidenceReference" label="Evidence or issued document reference" />
                </OperationForm>
                {c?.status==='submitted'&&
                  <OperationForm endpoint={endpoint} defaults={{action:'review_check',code}}
                    label="Record independent review">
                    <Select name="decision" label="Review decision" options={choices(['verified','rejected'])}/>
                  </OperationForm>}
              </div>}
          </div>;
        })}</div>:<p>Ongoing operations have commenced. Remaining vacancies are handled through Leasing.</p>}
      </section>

      {d.assessment&&<section className="panel stack">
        <h2>Property assessment</h2>
        <p>{d.assessment.summary}</p>
        <p className="small">Proposed private rooms: {d.assessment.proposed_rooms} · {d.assessment.status} · Visited: {d.assessment.visit_at?new Date(d.assessment.visit_at).toLocaleDateString('en-AU'):'Not yet recorded'}</p>
        {staff&&<p className="small">Internal assessment note: {d.assessment.internal_notes}</p>}
        <p className="small">Evidence reference: {d.assessment.evidence_reference}</p>
      </section>}

      {stage==='site_visit'&&staff&&p.status==='active'&&<section className="panel stack">
        <h2>Site visit and assessment</h2>
        <OperationForm endpoint={endpoint} defaults={{action:'save_assessment'}} label="Save assessment for review">
          <Input name="visitAt" type="datetime-local" label="Site visit date and time (Perth)" />
          <Input name="proposedRooms" type="number" label="Proposed rooms (not yet approved)" />
          <TextArea name="summary" label="Owner-visible assessment findings" />
          <TextArea name="internalNotes" label="Confidential Staff assessment notes" />
          <Input name="evidenceReference" label="Assessment evidence reference" />
        </OperationForm>
        {d.assessment?.status==='draft'&&<OperationForm endpoint={endpoint}
          defaults={{action:'review_assessment'}} label="Independently review assessment">
          <p className="small">The author cannot review their own assessment.</p>
        </OperationForm>}
      </section>}

      {proposals.length>0&&<section className="panel stack">
        <h2>Investment proposal and commercial terms</h2>
        {proposal&&<div className="stack">
          <p>Proposal version {proposal.version} · <Badge status={proposal.status}/></p>
          <div className="grid-4">
            <div><p className="small">Potential weekly room rent</p><strong>{dollars(proposal.room_weekly_cents)}</strong></div>
            <div><p className="small">Weekly car-bay rent</p><strong>{dollars(proposal.parking_weekly_cents)}</strong></div>
            <div><p className="small">Traditional weekly rent</p><strong>{dollars(proposal.traditional_weekly_cents)}</strong></div>
            <div><p className="small">Proposed total setup budget</p>
              <strong>{dollars(proposal.furnishing_budget_cents+proposal.works_budget_cents)}</strong></div>
          </div>
          <p><strong>Management:</strong> 25% + GST of gross rental income actually collected.</p>
          <div className="stack">
            <h3>Illustrative owner income and annual utility allowance</h3>
            <p className="small">The following assumes a full 52-week year with both car bays rented and no separately modelled property expenses.</p>
            <div className="grid-4">
              <div><p className="small">Gross rent per week at full occupancy</p><strong>{dollars(proposal.room_weekly_cents+proposal.parking_weekly_cents)}</strong></div>
              <div><p className="small">Management fee plus GST per week</p><strong>{dollars(Math.round((proposal.room_weekly_cents+proposal.parking_weekly_cents)*0.275))}</strong></div>
              <div><p className="small">Owner balance per week before expenses</p><strong>{dollars(Math.round((proposal.room_weekly_cents+proposal.parking_weekly_cents)*0.725))}</strong></div>
              <div><p className="small">Potential annual utility cap</p><strong>{dollars(Math.round((proposal.room_weekly_cents+proposal.parking_weekly_cents)*52*0.25*0.25))}</strong></div>
            </div>
            <h3>Occupancy comparison</h3>
            <div className="record-list">
              {[1,0.95,0.9,0.85].map(rate=>{
                const gross=Math.round(proposal.room_weekly_cents*rate)+proposal.parking_weekly_cents;
                const management=Math.round(gross*0.25),gst=Math.round(management*0.1);
                return <div key={rate} className="record-row">
                  <div><strong>{Math.round(rate*100)}% room occupancy</strong><p className="small">Gross collected rent: {dollars(gross)}/week</p></div>
                  <div><strong>{dollars(gross-management-gst)}/week</strong>
                    <p className="small">Owner before property expenses · utility cap {dollars(Math.round(management*52*0.25))}/year</p>
                  </div>
                </div>;
              })}
            </div>
            <p className="small">Illustrations exclude vacancies in parking, actual utility overages, maintenance, cleaning outside the agreed package, insurance, rates, tax and establishment capital. The annual allowance is based on fees actually collected, not guaranteed potential rent.</p>
          </div>
          <p><strong>Annual utility allowance:</strong> 25% of collected ProInspect management fees excluding GST, for eligible electricity, gas and water consumption.</p>
          <p><strong>Assumptions and exclusions:</strong> {proposal.assumptions}</p>
          <p className="small">Agreement version: {proposal.agreement_version} · Document reference: {proposal.document_reference}</p>
          <p className="small">Figures are illustrative and do not include unverified conversion permissions, finance costs, tax or every ownership expense.</p>
        </div>}
        {!staff&&ownerActions&&p.status==='active'&&stage==='proposal'&&proposal?.status==='issued'&&
          <OperationForm endpoint={endpoint} defaults={{action:'owner_decision',proposalId:proposal.id,version:proposal.version}}
            label="Record your proposal decision">
            <Select name="decision" label="Decision" options={[
              {value:'approved',label:'Approve establishment scope and budget'},
              {value:'changes_requested',label:'Request changes'},
              {value:'declined',label:'Decline proposal'}]} />
            <TextArea name="note" label="Reason, instruction or approval acknowledgement" />
            <p className="small">This records an owner decision only. The separate executed service agreement must also be verified before works are authorised.</p>
          </OperationForm>}
      </section>}

      {stage==='proposal'&&staff&&p.status==='active'&&<section className="panel stack">
        <h2>Prepare versioned proposal</h2>
        <p className="small">All financial figures below are AUD cents. An independent reviewer must issue the draft; owner approval is required before establishment.</p>
        <OperationForm endpoint={endpoint} defaults={{action:'draft_proposal'}} label="Create new proposal draft">
          <div className="grid-2">
            <Input name="traditionalWeeklyCents" type="number" label="Traditional weekly rent (cents)"/>
            <Input name="roomWeeklyCents" type="number" label="Combined room rent per week (cents)"/>
            <Input name="parkingWeeklyCents" type="number" label="Car-bay rent per week (cents)"/>
            <Input name="furnishingBudgetCents" type="number" label="Furnishing budget (cents)"/>
            <Input name="worksBudgetCents" type="number" label="Conversion/works budget (cents)"/>
          </div>
          <TextArea name="assumptions" label="Income, operating-cost assumptions and exclusions"/>
          <Input name="agreementVersion" label="Agreement version identifier"/>
          <Input name="documentReference" label="Issued proposal document or approved reference"/>
        </OperationForm>
        {proposals.filter((v:any)=>v.status==='draft').map((v:any)=>
          <div className="record-row" key={v.id}>
            <div><strong>Proposal v{v.version}</strong><p className="small">Awaiting independent issue review</p></div>
            <OperationForm endpoint={endpoint} defaults={{action:'issue_proposal',proposalId:v.id}}
              label="Review and issue proposal">
              <p className="small">A different staff member must issue this proposal.</p>
            </OperationForm>
          </div>)}
      </section>}

      {stage==='advertising'&&<section className="panel stack">
        <h2>Room advertisements and leasing preparation</h2>
        <p>Only approved private rooms may be linked to published leasing listings. Linking a listing here never publishes a new advertisement.</p>
        {(d.listings??[]).map((l:any)=><p key={l.id} className="small">{l.room_label} — {l.title} · {l.status}</p>)}
        {staff&&p.status==='active'&&<OperationForm endpoint={endpoint} defaults={{action:'link_listing'}}
          label="Link existing approved room listing">
          <Input name="spaceId" label="Approved private space ID (from Manage Co-Living)"/>
          <Input name="listingId" label="Existing published Residential listing ID"/>
          <Input name="evidenceReference" label="Listing approval reference"/>
          <p className="small">The room space, advertisement and property must match. Published status and onboarding gate are independently checked.</p>
        </OperationForm>}
        <Link to={w.href+'/properties/'+encodeURIComponent(p.property_id)+'/co-living'}>Open room configuration and occupancy</Link>
      </section>}

      {stage==='implementation'&&<section className="panel stack">
        <h2>Furnishing, purchases and property establishment</h2>
        <div className="grid-3">
          <div><p className="small">Approved budget including variations</p><strong>{dollars(authorisedBudget)}</strong></div>
          <div><p className="small">Recorded commitments / actual spend</p><strong>{dollars(committed)}</strong></div>
          <div><p className="small">Remaining authorised budget</p><strong>{dollars(authorisedBudget-committed)}</strong></div>
        </div>
        <div className="record-list">
          {items.map((i:any)=><div className="record-row" key={i.id}>
            <div><strong>{i.space_label} — {i.item_name}</strong>
              <p className="small">{i.quantity} × {dollars(i.unit_cost_cents)} · {i.supplier} · {i.status}</p>
              {i.warranty_reference&&<p className="small">Warranty reference: {i.warranty_reference}</p>}
            </div>
            {staff&&p.status==='active'&&<OperationForm endpoint={endpoint} defaults={{action:'update_item',itemId:i.id}}
              label="Update item progress">
              <Select name="status" label="Status" value={i.status} options={choices(['planned','quoted','ordered','delivered','installed'])}/>
              <Input name="actualTotalCents" label="Actual cost (AUD cents, optional)" type="number" required={false}/>
              <Input name="receiptReference" label="Receipt reference (optional)" required={false}/>
              <Input name="warrantyReference" label="Warranty reference (optional)" required={false}/>
            </OperationForm>}
          </div>)}
        </div>
        {staff&&p.status==='active'&&<>
          <h3>Add furnishing or appliance</h3>
          <OperationForm endpoint={endpoint} defaults={{action:'add_item'}} label="Add establishment item">
            <Input name="spaceLabel" label="Bedroom or shared area"/>
            <Input name="itemName" label="Item name"/>
            <Input name="supplier" label="Supplier"/>
            <Input name="quantity" type="number" label="Quantity"/>
            <Input name="unitCostCents" type="number" label="Budget per item (AUD cents)"/>
          </OperationForm>
          <h3>Request additional owner expenditure</h3>
          <OperationForm endpoint={endpoint} defaults={{action:'request_variation'}} label="Request budget variation">
            <TextArea name="description" label="Scope and reason"/>
            <Input name="extraBudgetCents" type="number" label="Additional approved budget requested (AUD cents)"/>
          </OperationForm>
        </>}
        {variations.length>0&&<h3>Budget variations</h3>}
        {variations.map((v:any)=><div className="record-row" key={v.id}>
          <div><strong>{v.description}</strong><p>{dollars(v.extra_budget_cents)} · {v.status}</p></div>
          {ownerActions&&p.status==='active'&&v.status==='pending'&&
            <OperationForm endpoint={endpoint} defaults={{action:'variation_decision',variationId:v.id}} label="Record variation decision">
              <Select name="decision" label="Decision" options={choices(['approved','declined'])}/>
            </OperationForm>}
        </div>)}
      </section>}

      <section className="panel stack">
        <h2>Tasks and project activity</h2>
        {tasks.length?<div className="record-list">{tasks.map((t:any)=><div className="record-row" key={t.id}>
          <div><strong>{t.title}</strong><p className="small">{t.stage.replaceAll('_',' ')} · {t.status}{t.due_at?' · Due '+new Date(t.due_at).toLocaleDateString('en-AU'):''}</p></div>
          {staff&&t.stage===stage&&p.status==='active'&&
            <OperationForm endpoint={endpoint} defaults={{action:'update_task',taskId:t.id}} label="Update task">
              <Select name="status" label="Task status" value={t.status} options={choices(['open','blocked','completed'])}/>
              <Input name="evidenceReference" label="Progress evidence reference"/>
            </OperationForm>}
        </div>)}</div>:<p>No tasks are currently recorded.</p>}
        {staff&&p.status==='active'&&<OperationForm endpoint={endpoint}
          defaults={{action:'add_task',ownerVisible:true}} label="Add staff task">
          <Input name="title" label="Task description"/>
          <Input name="dueAt" type="datetime-local" label="Due date (optional)" required={false}/>
        </OperationForm>}
        <details><summary>View project history</summary>
          {d.events?.map((e:any)=><p className="small" key={e.id}>
            {new Date(e.created_at).toLocaleString('en-AU')} · {e.action.replaceAll('_',' ')} — {e.detail}
          </p>)}
        </details>
      </section>

      {staff&&p.status==='active'&&stage!=='tenanted'&&<section className="panel stack">
        <h2>Operations — stage advancement</h2>
        <p>All required evidence, independent reviews and outstanding tasks must satisfy the server's stage gate. Advancing never executes a contract, makes a supplier payment or publishes a listing.</p>
        <OperationForm endpoint={endpoint} defaults={{action:'advance',version:p.version}}
          label={'Complete '+CO_LIVING_ONBOARDING_GUIDE[stage].label+' and advance'}>
          <p className="small">Current project version: {p.version}.</p>
        </OperationForm>
        <h3>Pause or close the project</h3>
        <OperationForm endpoint={endpoint} defaults={{action:'set_status',version:p.version}} label="Change project status">
          <Select name="status" label="Status" options={choices(['on_hold','withdrawn'])}/>
          <TextArea name="reason" label="Reason for change"/>
        </OperationForm>
      </section>}
      {staff&&p.status==='on_hold'&&<section className="panel">
        <h2>Resume a paused project</h2>
        <OperationForm endpoint={endpoint} defaults={{action:'set_status',version:p.version,status:'active'}}
          label="Resume onboarding"><Input name="reason" label="Reason for resuming"/></OperationForm>
      </section>}
      {stage==='tenanted'&&<section className="panel">
        <h2>Ongoing Co-Living operations</h2>
        <p>The property has passed the onboarding handover. Leasing continues for any remaining vacant rooms.</p>
        <Link className="button secondary" to={w.href+'/properties/'+encodeURIComponent(p.property_id)+'/co-living'}>
          Open rooms and resident operations
        </Link>
      </section>}
    </div>
  </>;
}
