import { Link } from 'react-router';
import { useWorkspace } from '../lib/workspace';
import { PageHeading, Badge, EmptyState } from '../../../../packages/ui/components';
import { displayDate } from '../../../../packages/domain/index';
export default function Documents() {
  const d = useWorkspace();
  return (
    <>
      <div className="actions">
        {['landlord', 'property-manager', 'commercial', 'strata-manager', 'staff'].includes(
          d.workspace.kind,
        ) && (
          <Link className="button secondary" to={`${d.workspace.href}/document-operations`}>
            Prepare or request a document
          </Link>
        )}
      </div>
      <PageHeading
        eyebrow="Your property record"
        title="Documents & reports"
        description="Files issued to your authorised account or tenancy. Document access is checked whenever you download."
      />
      {d.documents.length ? (
        <div className="grid-3">
          {d.documents.map((doc) => (
            <article className="panel stack" key={doc.id}>
              <div className="actions" style={{ justifyContent: 'space-between' }}>
                <span className="eyebrow">PDF document</span>
                <Badge status={doc.status} />
              </div>
              <h2>{doc.title}</h2>
              <p className="small">{doc.address}</p>
              <p className="small">
                {displayDate(doc.issued_at || doc.created_at)}
                <br />
                Version {doc.version} · {(doc.size / 1024).toFixed(0)} KB
              </p>
              <a
                className="button secondary"
                href={`/api${d.workspace.href}/documents/${doc.id}/download`}
              >
                Download PDF
              </a>
            </article>
          ))}
        </div>
      ) : (
        <section className="panel">
          <EmptyState
            title="No documents have been issued yet"
            description="When a report or document is made available to you, it will appear here. You will also receive a notification."
          />
        </section>
      )}
    </>
  );
}
