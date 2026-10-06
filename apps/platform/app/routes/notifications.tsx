import { Link } from 'react-router';
import { OperationForm } from '../components/OperationForm';
import { useWorkspace } from '../lib/workspace';
import { PageHeading, EmptyState } from '../../../../packages/ui/components';
import { displayDate } from '../../../../packages/domain/index';
export default function Notifications() {
  const d = useWorkspace();
  return (
    <>
      <PageHeading
        eyebrow="Account activity"
        title="Notifications"
        description="Updates addressed to you across your authorised property relationships."
      />
      <section className="panel">
        {d.notifications.length ? (
          d.notifications.map((n) => (
            <article className="record-row" key={n.id}>
              <div>
                <h3>{n.title}</h3>
                <p>{n.message}</p>
                <p>{displayDate(n.created_at)}</p>
              </div>
              <div className="stack-sm">
                {!n.read_at && (
                  <OperationForm
                    endpoint={`/api/w/${d.workspace.kind}/${d.workspace.scopeId}/notifications/${n.id}/read`}
                    label="Mark as read"
                  />
                )}
                <Link
                  className="button secondary small"
                  to={n.href.startsWith('/') ? n.href : new URL(n.href).pathname}
                >
                  View update
                </Link>
              </div>
            </article>
          ))
        ) : (
          <EmptyState
            title="You are up to date"
            description="New reports and service updates will appear here."
          />
        )}
      </section>
    </>
  );
}
