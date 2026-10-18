import { Link,useLoaderData,type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace,workspaceApi } from '../lib/workspace';
import { PageHeading } from '../../../../packages/ui/components';
import { OperationForm,Panel,Input,Select } from '../components/OperationForm';
import { WA_RESIDENTIAL_FORMS } from '../../../../packages/wa-residential/forms';
type Template={form_code:string;version:string;official_source_url:string;official_sha256:string;
 legal_review_reference:string;approved_at:string;retired_at:string|null;file_size:number};
export const meta=()=>[{title:'Official WA forms library | ProInspect'}];
export async function loader({request,context,params}:LoaderFunctionArgs){
 return await loadApi(request,context,`/api/w/${params.kind}/${params.scopeId}/wa-form-templates`) as {templates:Template[]};
}
export default function WaOfficialTemplates(){
 const d=useLoaderData<typeof loader>(),w=useWorkspace().workspace;
 const api=workspaceApi(w.kind,w.scopeId);
 return <div className="stack">
  <PageHeading title="Official WA residential form library"
   description="Staff-only version register for official PDFs. Upload verified WA Consumer Protection source files and retain formal review evidence. This does not authorise legal service."/>
  <Link to={`${w.href}/wa-form-queue`}>Back to statutory review queue</Link>
  <Panel title="Register an independently reviewed official source PDF">
   <OperationForm endpoint={`${api}/wa-form-templates/upload`} multipart
    label="Upload reviewed official PDF">
    <Select name="formCode" label="Prescribed form" options={WA_RESIDENTIAL_FORMS.filter(f=>f.kind!=='restricted'&&f.code!=='WA_BOND_DISPOSAL').map(f=>({value:f.code,label:f.name}))}/>
    <Input name="templateVersion" label="Edition and document version (e.g. July 2024 / 1)" />
    <Input name="officialSourceUrl" type="url" label="Original WA Consumer Protection PDF URL"/>
    <Input name="legalReviewReference" label="Independent legal/document sign-off reference"/>
    <Input name="file" type="file" label="Original, unmodified official PDF"/>
   </OperationForm>
   <p className="small">The service stores the original bytes in private R2 and calculates the SHA-256 digest itself. A typed hash alone cannot register a template. Approved source and field mappings still require independent verification before live use.</p>
  </Panel>
  <Panel title="Retained official template versions">
   {!d.templates.length&&<p>No template binaries have been registered yet. Issuance is blocked until a current official source is uploaded and reviewed.</p>}
   {d.templates.map(t=><div className="record-row" key={t.form_code+':'+t.version}>
    <div><strong>{t.form_code} · {t.version}</strong>
      <p className="small">Registered {t.approved_at} · {t.file_size} bytes</p>
      <p className="small">SHA-256: <code>{t.official_sha256}</code></p>
      <p className="small">Review reference: {t.legal_review_reference}</p>
      {t.retired_at&&<p>Retired: {t.retired_at}</p>}
    </div>
    <a href={t.official_source_url} target="_blank" rel="noopener noreferrer">Official source →</a>
   </div>)}
  </Panel>
 </div>;
}
