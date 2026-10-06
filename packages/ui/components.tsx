import { cloneElement, isValidElement, useId, type ReactNode } from 'react';
import { statusLabel } from '../domain/index';
export function Badge({ status }: { status: string }) {
  return <span className="badge" data-status={status}>{statusLabel(status)}</span>;
}
export function PageHeading({ eyebrow, title, description, children }: {
  eyebrow?: string; title: string; description?: string; children?: ReactNode;
}) {
  return <header className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{children && <div className="actions">{children}</div>}</header>;
}
export function EmptyState({ title, description, children }: {
  title: string; description: string; children?: ReactNode;
}) {
  return <div className="empty"><div className="empty-icon" aria-hidden="true">◇</div><h3>{title}</h3><p>{description}</p>{children}</div>;
}
export function Feedback({ value }: {
  value?: { message?: string; error?: string; fields?: Record<string, string[]>; ok?: boolean } | null;
}) {
  if (!value || (!value.message && !value.error)) return null;
  return <div className={`notice ${value.error ? 'error' : ''}`} role={value.error ? 'alert' : 'status'} tabIndex={-1}>
    <strong>{value.error ?? value.message}</strong>
    {value.fields && <ul className="error-list">{Object.entries(value.fields).flatMap(([key, errors]) => errors?.map(text => <li key={key + text}>{key}: {text}</li>) ?? [])}</ul>}
  </div>;
}
export function Field({ label, name, help, children }: {
  label: string; name?: string; help?: string; children: ReactNode;
}) {
  const generatedId = useId();
  const element = isValidElement<Record<string, unknown>>(children) ? children : null;
  const controlId = typeof element?.props.id === 'string' ? element.props.id : name ?? generatedId;
  const helpId = `${controlId}-help`;
  const describedBy = [element?.props['aria-describedby'], help ? helpId : null].filter(Boolean).join(' ');
  return <div className="field">
    <label htmlFor={controlId}>{label}</label>
    {element ? cloneElement(element, { id: controlId, 'aria-describedby': describedBy || undefined }) : children}
    {help && <span className="help" id={helpId}>{help}</span>}
  </div>;
}
export function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <div className="metric"><div className="overline">{label}</div><strong>{value}</strong><span>{detail}</span></div>;
}
