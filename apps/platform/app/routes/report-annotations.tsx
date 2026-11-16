import {Form,Link,useLoaderData,useActionData,useNavigation,data,
  type LoaderFunctionArgs,type ActionFunctionArgs} from 'react-router';
import {loadApi,callApi} from '../lib/api.server';
import {useWorkspace} from '../lib/workspace';
import {PageHeading,Feedback} from '../../../../packages/ui/components';

export async function loader({request,context,params}:LoaderFunctionArgs){
  return loadApi(request,context,
    `/api/w/${params.kind}/${params.scopeId}/reports/${params.reportId}/annotations`);
}
export async function action({request,context,params}:ActionFunctionArgs){
  const f=await request.formData();
  const action=String(f.get('action')??'');
  const input:Record<string,unknown>={action,evidenceId:f.get('evidenceId'),
    sourceReference:f.get('sourceReference')};
  if(action==='save'){
    input.sourceSha256=f.get('sourceSha256');
    const x=Number(f.get('x')),y=Number(f.get('y')),label=String(f.get('label')??'');
    input.annotations=[{x,y,label}];
  } else if(action==='review')input.decision=f.get('decision');
  else return data({error:'Unsupported annotation action.'},{status:422});
  const r=await callApi(request,context,`/api/w/${params.kind}/${params.scopeId}/reports/${params.reportId}/annotations`,
    {method:'POST',body:input});
  const result=await r.json() as Record<string,unknown>;
  return data(r.ok?{ok:true,message:'Annotation '+(result.status??'saved')}: {error:result.message??'Action unavailable.'},{status:r.status});
}
export default function ReportAnnotations(){
  const d=useWorkspace();
  const result=useActionData<any>(),busy=useNavigation().state!=='idle';
  const {reportId,reportStatus,photos,overlays}=useLoaderData<typeof loader>() as {
    reportId:string;reportStatus:string;
    photos:{id:string;sha256:string;status:string;area_id:string}[];
    overlays:{evidence_id:string;annotations:{x:number;y:number;label:string}[];
      review_status:string;created_by:string}[];
  };
  const editor=['draft','changes_requested'].includes(reportStatus);
  const reviewer=['draft','changes_requested','submitted'].includes(reportStatus) &&
    ['administrator','operations_manager'].includes(d.user.staffRole??'');
  return <>
    <PageHeading eyebrow="Staff report quality" title="Photo observation overlays"
      description="Numbered annotation markers are placed on a derivative PDF. Original accepted JPEG bytes remain unchanged, verified against their SHA-256 fingerprint."/>
    <div className="stack">
      <Link to={d.workspace.href+'/reports/'+reportId}>Back to report</Link>
      <Feedback value={result}/>
      {photos.map(p=>{
        const overlay=overlays.find(o=>o.evidence_id===p.id);
        return <section className="panel stack" key={p.id}>
          <h2>Photograph {p.id}</h2>
          <p className="small">Area: {p.area_id} · Original evidence: {p.status} ·
            SHA-256 {p.sha256.slice(0,16)}…</p>
          <a href={d.workspace.href.replace('/w/','/api/w/')+'/reports/'+reportId+'/evidence/'+p.id+'/download'}
             target="_blank" rel="noreferrer">View private original photograph</a>
          {overlay&&<div className="stack">
            <p>Annotation review: <strong>{overlay.review_status}</strong></p>
            {overlay.annotations.map((a,i)=><p key={i}>{i+1}. {a.label} ({Math.round(a.x*100)}%, {Math.round(a.y*100)}%)</p>)}
          </div>}
          {editor&&p.status==='accepted'&&(!overlay||overlay.review_status==='draft')&&
            <Form method="post" className="form">
              <input name="action" type="hidden" value="save"/>
              <input name="evidenceId" type="hidden" value={p.id}/>
              <input name="sourceSha256" type="hidden" value={p.sha256}/>
              <p className="small">Marker coordinates are normalised: 0 is left/top, 1 is right/bottom.</p>
              <div className="grid-2">
                <label className="field">Horizontal position (0–1)
                  <input name="x" type="number" min="0" max="1" step="0.01" defaultValue="0.5" required/></label>
                <label className="field">Vertical position (0–1)
                  <input name="y" type="number" min="0" max="1" step="0.01" defaultValue="0.5" required/></label>
              </div>
              <label className="field">Observation<input name="label" minLength={2} maxLength={120} required/></label>
              <label className="field">Source/evidence reference
                <input name="sourceReference" minLength={8} maxLength={240} required/></label>
              <button className="button secondary" disabled={busy}>Save marker for independent review</button>
            </Form>}
          {reviewer&&overlay?.review_status==='draft'&&overlay.created_by!==d.user.id&&
            <Form method="post" className="form">
              <input name="action" type="hidden" value="review"/>
              <input name="evidenceId" type="hidden" value={p.id}/>
              <label className="field">Independent review reference<input name="sourceReference" minLength={8} required/></label>
              <div className="actions">
                <button name="decision" value="accepted" className="button secondary" disabled={busy}>Accept annotation</button>
                <button name="decision" value="rejected" className="button secondary" disabled={busy}>Reject</button>
              </div>
            </Form>}
        </section>;
      })}
      {!photos.length&&<p>No uploaded photographic evidence is available for this report.</p>}
    </div>
  </>;
}
