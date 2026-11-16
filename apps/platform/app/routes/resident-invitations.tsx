import { Link } from 'react-router';
import { useWorkspace, workspaceApi } from '../lib/workspace';
import { getOnboardingFlow } from '../../../../packages/onboarding/registry';
import { PageHeading } from '../../../../packages/ui/components';
import { OperationForm, Input, Select, Panel, options } from '../components/OperationForm';

/**
 * A single invitation UI backed by existing tenancy and scheme invite APIs.
 * These APIs recheck management, scheme and assignment authority server-side.
 * An invitation cannot be sent by claiming an email or address alone.
 */
export default function ResidentInvitations() {
  const d = useWorkspace();
  const w = d.workspace;
  const api = workspaceApi(w.kind,w.scopeId);
  const commercial = w.kind === 'commercial';
  const strata = w.kind === 'strata-manager';
  const allowed = ['landlord','property-manager','commercial','strata-manager'].includes(w.kind);
  const tenancyFlow = getOnboardingFlow(commercial ? 'ONB-INV-COM' : 'ONB-INV-RES')!;
  const buildingFlow = getOnboardingFlow('ONB-INV-STR')!;
  if (!allowed || w.role === 'viewer') {
    return <Panel title="Invitations unavailable"><p>Only an authorised property or scheme manager can invite a member. Invitations do not grant access to unrelated records.</p><Link to={w.href}>Return to overview</Link></Panel>;
  }
  return <>
    <PageHeading eyebrow="Resident & Member · invitation only" title="Invite a resident or member"
      description="Choose an existing authorised tenancy or scheme. The recipient verifies the invited email and gains only the specific approved property relationship."/>
    <div className="stack">
      {strata ? <>
        <Panel title="Building resident, lot owner or council member"
          description={buildingFlow.id+' v'+buildingFlow.version+' · Council members require an effective term and verified appointment.'}>
          <p>Select an authorised scheme below to invite a resident or lot owner and link the correct lot.</p>
          {d.schemes.length ? d.schemes.map((s:any)=>
            <div className="record-row" key={s.id}>
              <strong>{s.name}</strong>
              <Link className="button secondary small" to={w.href+'/schemes/'+s.id}>Invite from scheme</Link>
            </div>
          ) : <p>No authorised scheme is available. Complete the professional scheme assignment first.</p>}
        </Panel>
      </> : commercial ? <Panel title="Invite a commercial premises occupant"
        description="ONB-INV-COM v1.1.0 · Property-bound invitations for commercial tenants, staff and other authorised occupants.">
        <p>Select an existing commercial property and record the premises, relationship and authority reference. Only the invited email can activate limited premises access.</p>
        <Link className="button" to={w.href+'/commercial-occupancies'}>Manage commercial occupants</Link>
      </Panel> : <>
        <Panel title="Invite a residential tenant"
          description={'ONB-INV-RES v1.0.0 · The tenant must be linked to an existing tenancy; a property address alone is insufficient.'}>
          {d.tenancies.filter((t:any)=>t.status==='active').length ? <OperationForm
            endpoint={f=>api+'/tenancies/'+encodeURIComponent(String(f.get('tenancyId')))+'/invite'}
            label="Send secure invitation">
            <Select name="tenancyId" label="Active tenancy" options={d.tenancies.filter((t:any)=>t.status==='active').map((t:any)=>({
              value:t.id,label:d.properties.find((p:any)=>p.id===t.property_id)?.address ?? t.address ?? 'Tenancy',
            }))}/>
            <Input name="email" type="email" label="Recipient email address"/>
          </OperationForm> : <p>No active tenancy is available. Add a verified tenancy to the property before inviting its tenant.</p>}
          <p className="small">For a new tenancy, open Tenancies &amp; forms and choose Create tenancy &amp; invite tenant.</p>
          <Link className="button secondary" to={w.href+'/tenancies'}>Manage tenancies</Link>
        </Panel>
      </>}
      <Panel title="How Resident invitations work">
        <p>1. You select a verified tenancy, scheme or lot. 2. ProInspect emails the recipient. 3. The recipient signs in using the invited address and reviews the specific relationship. 4. Server-side permission checks activate only that relationship.</p>
        <p className="small">A Resident account cannot be opened independently. A scheme council appointment, management authority or sensitive document grant must be verified separately.</p>
      </Panel>
    </div>
  </>;
}
