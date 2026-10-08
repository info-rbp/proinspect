import { Link } from 'react-router';
import { useWorkspace, workspaceApi } from '../lib/workspace';
import { PageHeading, Badge } from '../../../../packages/ui/components';
import {
  OperationForm,
  Input,
  TextArea,
  Panel,
  Select,
  choices,
  options,
} from '../components/OperationForm';
export default function DocumentOperations() {
  const d = useWorkspace(),
    w = d.workspace,
    api = workspaceApi(w.kind, w.scopeId),
    manager =
      w.kind === 'staff'
        ? ['administrator', 'operations_manager'].includes(d.user.staffRole ?? '')
        : ['landlord', 'property-manager', 'strata-manager', 'commercial'].includes(w.kind) &&
          w.role !== 'viewer';
  return (
    <>
      <PageHeading
        title="Document preparation and issue"
        description="Upload a reviewed PDF, select its operational context, and explicitly select who receives it. A replacement is a new version, not an overwritten file."
      />
      <div className="stack">
        {manager && (
          <Panel title="Upload document for review">
            <OperationForm endpoint={`${api}/documents/upload`} multipart label="Upload for review">
              <Input name="title" label="Document title" />
              <Select
                name="category"
                label="Document category"
                options={choices([
                  'tenancy_document',
                  'property_condition_report',
                  'property_record',
                  'quote',
                  'building_document',
                  'service_report',
                ])}
              />
              <Select
                name="propertyId"
                label="Property context (choose property OR scheme)"
                optional
                options={options(d.properties, 'address')}
              />
              <Select
                name="schemeId"
                label="Scheme context"
                optional
                options={options(d.schemes)}
              />
              <Select
                name="previousDocumentId"
                label="Replace issued version"
                optional
                options={options(
                  d.documents.filter((x) => x.status === 'issued'),
                  'title',
                )}
              />
              <Input name="file" label="Reviewed PDF (up to 10 MB)" type="file" />
            </OperationForm>
          </Panel>
        )}
        <Panel title="Issue and audience controls">
          {d.documents
            .filter(
              (doc) =>
                manager &&
                (['review', 'approved'].includes(doc.status) ||
                  (w.kind === 'staff' && doc.status === 'issued') ||
                  doc.created_by === d.user.id ||
                  doc.uploaded_client_id === w.scopeId),
            )
            .map((doc) => (
              <details key={doc.id}>
                <summary>
                  {doc.title} - Version {doc.version} - {doc.status}
                </summary>
                <a href={`/api${d.workspace.href}/documents/${doc.id}/download`}>
                  Download for review
                </a>
                <OperationForm
                  endpoint={`${api}/documents/${doc.id}/issue`}
                  label="Issue to selected audience"
                >
                  <Select
                    name="audience"
                    label="Audience type"
                    options={choices(
                      doc.scheme_id
                        ? ['client', 'scheme_resident', 'scheme_owner', 'scheme_council']
                        : ['client', 'tenancy'],
                    )}
                  />
                  <Select
                    name="recipientId"
                    optional={w.kind === 'staff'}
                    label="Specific account, tenancy or scheme"
                    options={[
                      { value: w.scopeId, label: `This workspace: ${w.name}` },
                      ...options(
                        d.tenancies.map((t) => ({ ...t, name: `Tenancy: ${t.address || t.id}` })),
                      ),
                      ...options(d.schemes),
                    ]}
                  />
                  {w.kind === 'staff' && (
                    <Input
                      name="recipientId"
                      label="Recipient account ID (Staff override)"
                      required={false}
                    />
                  )}
                  <Input name="reviewReference" label="Review / release reference" />
                </OperationForm>
              </details>
            ))}
        </Panel>
        {w.kind !== 'staff' && manager && (
          <Panel
            title="Request a document"
            description="Give ProInspect the purpose and instructions. No unreviewed legal template is automatically issued."
          >
            <OperationForm endpoint={`${api}/document-requests`} label="Submit document request">
              <Select
                name="propertyId"
                label="Property"
                options={options(d.properties, 'address')}
              />
              <Select
                name="productCode"
                label="Document service"
                options={choices([
                  'property_record',
                  'tenancy_document',
                  'commercial_document',
                  'strata_document',
                ])}
              />
              <Input name="title" label="Request title" />
              <TextArea name="answers.purpose" label="Purpose and information required" />
              <TextArea
                name="answers.instructions"
                label="Additional instructions"
                required={false}
              />
            </OperationForm>
          </Panel>
        )}
        <Panel title="Document request progress">
          {d.documentRequests.map((r) => (
            <div className="record-row" key={r.id}>
              <div>
                <Link to={`${w.href}/document-requests/${r.id}`}>{r.title}</Link>
                <p>{r.product_code}</p>
              </div>
              <Badge status={r.status} />
            </div>
          ))}
        </Panel>
        <Link className="button secondary" to={`${w.href}/documents`}>
          View documents and reports
        </Link>
      </div>
    </>
  );
}
