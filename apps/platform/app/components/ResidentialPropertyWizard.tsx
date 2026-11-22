import { useState } from 'react';
import { Form } from 'react-router';
import { Field } from '../../../../packages/ui/components';

type Tenant = { key: number; name: string; email: string; phone: string };
export type ResidentialSetup = {
  canEdit?: boolean;
  profile: null | {
    bedrooms: number; bathrooms: number; ensuites: number;
    separateToilets: number; carSpaces: number;
    furnishing: string; notes: string; version: number;
  };
  tenancy: null | {
    occupancyStatus: string; leaseType: string | null;
    startsOn: string | null; endsOn: string | null;
    tenants: {name:string;email?:string;phone?:string}[];
  };
};
const RESIDENTIAL_TYPES = ['House','Apartment','Unit','Townhouse','Villa','Duplex','Studio','Other'];
const STEP_LABELS = ['Property details','About the property','Tenancy details','Anything else'];

export function ResidentialPropertyWizard({mode,busy,serviceId='',address='',suburb='',
  postcode='',propertyType='House',setup}: {
  mode: 'create'|'edit'; busy: boolean; serviceId?: string;
  address?: string; suburb?: string; postcode?: string; propertyType?: string;
  setup?: ResidentialSetup|null;
}) {
  const [step,setStep] = useState(0);
  const [street,setStreet] = useState(address),[city,setCity] = useState(suburb);
  const [postal,setPostal] = useState(postcode),[kind,setKind] = useState(propertyType);
  const [features,setFeatures] = useState({
    bedrooms: setup?.profile?.bedrooms ?? 0,
    bathrooms: setup?.profile?.bathrooms ?? 0,
    ensuites: setup?.profile?.ensuites ?? 0,
    separateToilets: setup?.profile?.separateToilets ?? 0,
    carSpaces: setup?.profile?.carSpaces ?? 0,
  });
  const [furnishing,setFurnishing] = useState(setup?.profile?.furnishing ?? 'unknown');
  const [occupancy,setOccupancy] = useState(setup?.tenancy?.occupancyStatus ?? 'unknown');
  const [leaseType,setLeaseType] = useState(setup?.tenancy?.leaseType ?? 'unknown');
  const [startsOn,setStartsOn] = useState(setup?.tenancy?.startsOn ?? '');
  const [endsOn,setEndsOn] = useState(setup?.tenancy?.endsOn ?? '');
  const [tenants,setTenants] = useState<Tenant[]>(
    (setup?.tenancy?.tenants ?? []).map((t,i) => ({key:i+1,name:t.name,email:t.email??'',phone:t.phone??''})),
  );
  const [notes,setNotes] = useState(setup?.profile?.notes ?? '');
  const [selfManaged,setSelfManaged] = useState(false);
  const [stepError,setStepError] = useState('');
  const applicable = occupancy==='tenanted'||occupancy==='upcoming';
  const validDate = (value: string) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
  function canContinue() {
    if (step===0 && mode==='create' &&
      (street.trim().length<5||city.trim().length<2||!/^\d{4}$/.test(postal))) {
      setStepError('Enter a street address, suburb and valid four-digit postcode.'); return false;
    }
    if(step===1 && features.ensuites>features.bathrooms){
      setStepError('En-suites must not exceed the total number of bathrooms.'); return false;
    }
    if(step===2 && applicable){
      if(!validDate(startsOn)||!validDate(endsOn)||
        (leaseType==='fixed'&&!!endsOn&&!startsOn)||
        (leaseType==='fixed'&&!!endsOn&&endsOn<=startsOn)){
        setStepError('Check the lease commencement and end dates.'); return false;
      }
      if(tenants.some(t=>t.name.trim().length<2 || (t.email && !/^\S+@\S+\.\S+$/.test(t.email)))){
        setStepError('Provide a name for each listed tenant and check any email addresses.'); return false;
      }
    }
    setStepError('');
    return true;
  }
  function next() { if(canContinue()) setStep(s=>Math.min(3,s+1)); }
  function updateCount(name:keyof typeof features,delta:number) {
    setFeatures(current=>{
      const value=Math.max(0,Math.min(40,current[name]+delta));
      return {...current,[name]:value,
        ...(name==='bathrooms'?{ensuites:Math.min(current.ensuites,value)}:{})};
    });
  }
  function updateTenant(key:number,name:'name'|'email'|'phone',value:string) {
    setTenants(list=>list.map(t=>t.key===key?{...t,[name]:value}:t));
  }
  const tenancyData = applicable ? {
    occupancyStatus: occupancy, leaseType, startsOn: startsOn||null,
    endsOn: leaseType==='fixed'?(endsOn||null):null,
    tenants: tenants.map(({name,email,phone})=>({
      name:name.trim(),email:email.trim(),phone:phone.trim(),
    })),
  } : {
    occupancyStatus: occupancy, leaseType:null, startsOn:null, endsOn:null,tenants:[],
  };
  const profileData={...features,furnishing};
  return <Form method="post" className="property-setup-wizard">
    <input type="hidden" name="address" value={street}/>
    <input type="hidden" name="suburb" value={city}/>
    <input type="hidden" name="postcode" value={postal}/>
    <input type="hidden" name="propertyType" value={kind}/>
    <input type="hidden" name="serviceId" value={serviceId}/>
    <input type="hidden" name="profile" value={JSON.stringify(profileData)}/>
    <input type="hidden" name="tenancy" value={JSON.stringify(tenancyData)}/>
    <input type="hidden" name="notes" value={notes}/>
    {mode==='edit'&&<>
      <input type="hidden" name="intent" value="save-setup"/>
      <input type="hidden" name="expectedVersion" value={setup?.profile?.version??0}/>
    </>}
    <nav className="property-setup-steps" aria-label="Property setup progress">
      {STEP_LABELS.map((label,i)=><div key={label} className={'property-setup-step'+(i===step?' active':i<step?' done':'')}
        aria-current={i===step?'step':undefined}>
        <span className="property-setup-number">{i<step?'✓':i+1}</span>
        <span>{label}</span>
      </div>)}
    </nav>
    <div className="property-setup-content">
      <p className="eyebrow">Step {step+1} of 4</p>
      {step===0&&<div className="form">
        <h2>Where is your property?</h2>
        <p className="small">Your address is used to locate the property and avoid creating duplicate records.</p>
        {mode==='edit'
          ? <div className="panel"><strong>{street}</strong><p>{city} WA {postal} · {kind}</p>
              <p className="small">Address or property-type corrections are reviewed separately by ProInspect.</p></div>
          : <>
            <Field label="Street address, including unit number" name="property-street">
              <input id="property-street" value={street} onChange={e=>setStreet(e.target.value)}
                minLength={5} maxLength={180} autoComplete="street-address" required/>
            </Field>
            <div className="grid-2">
              <Field label="Suburb" name="property-suburb">
                <input id="property-suburb" value={city} onChange={e=>setCity(e.target.value)}
                  autoComplete="address-level2" minLength={2} maxLength={80} required/>
              </Field>
              <Field label="WA postcode" name="property-postcode">
                <input id="property-postcode" value={postal} onChange={e=>setPostal(e.target.value)}
                  pattern="[0-9]{4}" inputMode="numeric" autoComplete="postal-code" required/>
              </Field>
            </div>
            <Field label="Property type" name="property-kind">
              <select id="property-kind" value={kind} onChange={e=>setKind(e.target.value)}>
                {RESIDENTIAL_TYPES.map(t=><option key={t}>{t}</option>)}
              </select>
            </Field>
          </>}
      </div>}
      {step===1&&<div className="form">
        <h2>Tell us about the property</h2>
        <p className="small">These facts are saved with the property and can be reused for future inspections.</p>
        <div className="property-setup-counters">
          {([
            ['bedrooms','Bedrooms','Total bedrooms'],
            ['bathrooms','Bathrooms','Including en-suites'],
            ['ensuites','En-suites','Included in the bathroom total'],
            ['separateToilets','Separate toilets','Additional toilets outside bathrooms'],
            ['carSpaces','Car spaces','Garage, carport and open parking combined'],
          ] as const).map(([key,label,description])=><div className="property-setup-counter" key={key}>
            <div><strong>{label}</strong><p className="small">{description}</p></div>
            <div className="property-setup-counter-actions" aria-label={label+' count'}>
              <button type="button" className="secondary" aria-label={'Remove '+label}
                disabled={features[key]===0} onClick={()=>updateCount(key,-1)}>−</button>
              <output aria-label={label}>{features[key]}</output>
              <button type="button" className="secondary" aria-label={'Add '+label}
                disabled={features[key]>=40||(key==='ensuites'&&features.ensuites>=features.bathrooms)}
                onClick={()=>updateCount(key,1)}>+</button>
            </div>
          </div>)}
        </div>
        <Field label="Furnishing" name="furnishing-choice">
          <select id="furnishing-choice" value={furnishing} onChange={e=>setFurnishing(e.target.value)}>
            <option value="unknown">Not yet confirmed</option>
            <option value="unfurnished">Unfurnished</option>
            <option value="part_furnished">Partially furnished</option>
            <option value="furnished">Fully furnished</option>
          </select>
        </Field>
      </div>}
      {step===2&&<div className="form">
        <h2>Is the property currently tenanted?</h2>
        <p className="small">Tenancy information can change over time. Adding contact details here will not send invitations or give anyone access to the portal.</p>
        <Field label="Current tenancy status" name="occupancy-choice">
          <select id="occupancy-choice" value={occupancy} onChange={e=>{
            setOccupancy(e.target.value);setStepError('');
          }}>
            <option value="tenanted">Currently tenanted</option>
            <option value="upcoming">New tenancy arranged</option>
            <option value="vacant">Vacant</option>
            <option value="unknown">Not yet confirmed</option>
          </select>
        </Field>
        {applicable&&<>
          <Field label="Lease arrangement" name="lease-choice">
            <select id="lease-choice" value={leaseType} onChange={e=>setLeaseType(e.target.value)}>
              <option value="unknown">Not yet confirmed</option>
              <option value="fixed">Fixed-term tenancy</option>
              <option value="periodic">Periodic tenancy</option>
            </select>
          </Field>
          <div className="grid-2">
            <Field label="Lease commencement date (if known)" name="lease-start">
              <input id="lease-start" type="date" value={startsOn} onChange={e=>setStartsOn(e.target.value)}/>
            </Field>
            {leaseType==='fixed'&&<Field label="Fixed-term lease end date (if known)" name="lease-end">
              <input id="lease-end" type="date" min={startsOn||undefined}
                value={endsOn} onChange={e=>setEndsOn(e.target.value)}/>
            </Field>}
          </div>
          <h3>Tenant contacts (if known)</h3>
          <p className="small">Record the people named on the tenancy. This is not an invitation or statutory notice.</p>
          {tenants.map((t,i)=><section className="panel property-setup-tenant" key={t.key}>
            <div className="panel-header"><h3>Tenant {i+1}</h3>
              <button type="button" className="button secondary small"
                onClick={()=>setTenants(a=>a.filter(x=>x.key!==t.key))}>Remove</button></div>
            <Field label={'Tenant '+(i+1)+' full name'} name={'tenant-name-'+t.key}>
              <input id={'tenant-name-'+t.key} value={t.name} maxLength={120} required
                onChange={e=>updateTenant(t.key,'name',e.target.value)}/>
            </Field>
            <div className="grid-2">
              <Field label={'Tenant '+(i+1)+' email (optional)'} name={'tenant-email-'+t.key}>
                <input id={'tenant-email-'+t.key} type="email" maxLength={254} value={t.email}
                  onChange={e=>updateTenant(t.key,'email',e.target.value)}/>
              </Field>
              <Field label={'Tenant '+(i+1)+' phone (optional)'} name={'tenant-phone-'+t.key}>
                <input id={'tenant-phone-'+t.key} type="tel" maxLength={40} value={t.phone}
                  onChange={e=>updateTenant(t.key,'phone',e.target.value)}/>
              </Field>
            </div>
          </section>)}
          <button className="secondary" type="button" disabled={tenants.length>=10}
            onClick={()=>setTenants(a=>[...a,{key:Math.max(0,...a.map(x=>x.key))+1,name:'',email:'',phone:''}])}>
            + Add a tenant
          </button>
        </>}
        {!applicable&&<p className="notice">No tenant contact details are needed for a vacant or unconfirmed property. You can update the tenancy information later.</p>}
      </div>}
      {step===3&&<div className="form">
        <h2>Anything else we should know?</h2>
        <p className="small">Include additional property features or useful background. You can edit this later.</p>
        <Field label="Additional information (optional)" name="additional-information">
          <textarea id="additional-information" rows={4} maxLength={3000}
            value={notes} onChange={e=>setNotes(e.target.value)}
            placeholder="Other property details, pool, outdoor areas, special features…"/>
        </Field>
        <p className="small">Do not enter keys, alarm codes, lockbox combinations or passwords here. Provide access arrangements securely when booking a service.</p>
        <section className="property-setup-review" aria-label="Review property details">
          <h3>Review your details</h3>
          <p><strong>{street}</strong> · {city} WA {postal} · {kind}</p>
          <p>{features.bedrooms} bedrooms · {features.bathrooms} bathrooms · {features.ensuites} en-suites · {features.carSpaces} car spaces</p>
          <p>Tenancy: {occupancy==='tenanted'?'Currently tenanted':occupancy==='upcoming'?'Upcoming tenancy':occupancy==='vacant'?'Vacant':'Not yet confirmed'}{applicable?' · '+tenants.length+' named tenant(s)':''}</p>
        </section>
        {mode==='create'&&<label className="checkbox">
          <input type="checkbox" checked={selfManaged}
            onChange={e=>setSelfManaged(e.target.checked)} required/>
          <span>I confirm I own and self-manage this property and am authorised to provide this information.</span>
        </label>}
        <p className="small">Adding this property does not start a subscription or activate payment. Tenant portal access requires a separate verified invitation.</p>
      </div>}
    </div>
    {stepError&&<p className="notice error" role="alert">{stepError}</p>}
    <div className="property-setup-controls">
      {step>0?<button className="secondary" type="button" onClick={()=>{setStep(x=>x-1);setStepError('');}}>
        Back</button>:<span className="small">Your information stays in this form until you submit it.</span>}
      {step<3?<button className="primary" type="button" onClick={next}>Continue →</button>
        :<button className="primary" type="submit" disabled={busy||(mode==='create'&&!selfManaged)}>
          {busy?'Saving…':mode==='edit'?'Save property details':'Add property'}</button>}
    </div>
  </Form>;
}
