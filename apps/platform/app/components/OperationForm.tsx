import { useRef, useState, type ReactNode, type FormEvent } from 'react';
import { useRevalidator, useNavigate } from 'react-router';
import { Feedback, Field } from '../../../../packages/ui/components';

/** Shared form mechanics; the server independently checks every relationship and operation. */
export function OperationForm({
  endpoint,
  children,
  label = 'Save',
  multipart = false,
  defaults = {},
  result,
  redirect,
}: {
  endpoint: string | ((f: FormData) => string);
  children?: ReactNode;
  label?: string;
  multipart?: boolean;
  defaults?: Record<string, unknown>;
  result?: (data: any) => ReactNode;
  redirect?: string | ((data: any) => string);
}) {
  const [state, setState] = useState<any>(null),
    [busy, setBusy] = useState(false),
    key = useRef<string | null>(null),
    revalidator = useRevalidator(),
    navigate = useNavigate();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setState(null);
    const form = new FormData(event.currentTarget);
    key.current ??= crypto.randomUUID();
    try {
      const path = typeof endpoint === 'function' ? endpoint(form) : endpoint;
      const body = multipart
        ? form
        : JSON.stringify({ ...formValues(form), requestKey: key.current, ...defaults });
      const response = await fetch(path, {
        method: 'POST',
        credentials: 'same-origin',
        headers: multipart ? {} : { 'Content-Type': 'application/json' },
        body,
      });
      const data: any = await response.json();
      if (!response.ok)
        setState({
          error: data.message ?? 'This operation could not be completed.',
          fields: data.fields,
        });
      else {
        setState({ ok: true, message: 'Saved. Your workspace has been updated.', data });
        key.current = null;
        revalidator.revalidate();
        const destination = typeof redirect === 'function' ? redirect(data) : redirect;
        if (destination?.startsWith('/') && !destination.startsWith('//')) navigate(destination);
      }
    } catch {
      revalidator.revalidate();
      setState({
        error:
          'The connection was interrupted. Check the updated workspace before retrying; this action may already have been saved.',
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="stack operation-form">
      <fieldset disabled={busy}>
        {children}
        <div className="actions">
          <button className="button" type="submit">
            {busy ? 'Saving...' : label}
          </button>
        </div>
      </fieldset>
      <Feedback value={state} />
      {state?.ok && result?.(state.data)}
    </form>
  );
}
const numberFields = new Set([
  'version',
  'amountCents',
  'amountExGstCents',
  'gstCents',
  'rentCents',
  'intervalMonths',
]);
const boolFields = new Set([
  'emailEnabled',
  'active',
  'assigned',
  'residentVisible',
  'accessConfirmed',
  'acceptCondition',
  'selfManaged',
  'noticeConfirmed',
]);
export function formValues(form: FormData) {
  const data: Record<string, unknown> = {};
  for (const [key, value] of form) {
    if (key.startsWith('_') || value instanceof File || value === '') continue;
    if (numberFields.has(key)) data[key] = Number(value);
    else if (boolFields.has(key)) data[key] = value === 'true' || value === 'on';
    else if (
      ['startsAt', 'endsAt', 'expiresAt', 'validUntil', 'scheduledAt', 'dueAt'].includes(key)
    )
      data[key] = new Date(String(value)).toISOString();
    else if (key === 'propertyIds')
      data[key] = form
        .getAll(key)
        .flatMap((v) => String(v).split(/[\s,]+/))
        .filter(Boolean);
    else data[key] = value;
  }
  for (const prefix of ['access', 'answers']) {
    const nested: Record<string, unknown> = {};
    for (const key of Object.keys(data)) {
      if (key.startsWith(prefix + '.')) {
        const field = key.slice(prefix.length + 1);
        nested[field] = boolFields.has(field)
          ? data[key] === 'true' || data[key] === 'on'
          : data[key];
        delete data[key];
      }
    }
    if (Object.keys(nested).length) data[prefix] = nested;
  }
  return data;
}
export function Input({
  label,
  name,
  type = 'text',
  required = true,
  value,
  help,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  value?: string | number;
  help?: string;
}) {
  return (
    <Field label={label} help={help}>
      <input type={type} name={name} required={required} defaultValue={value} />
    </Field>
  );
}
export function TextArea({
  label,
  name,
  required = true,
  help,
}: {
  label: string;
  name: string;
  required?: boolean;
  help?: string;
}) {
  return (
    <Field label={label} help={help}>
      <textarea name={name} required={required} rows={3} />
    </Field>
  );
}
export function Select({
  label,
  name,
  options,
  optional = false,
  value,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  optional?: boolean;
  value?: string;
}) {
  return (
    <Field label={label}>
      <select name={name} required={!optional} defaultValue={value ?? ''}>
        <option value="">{optional ? 'Not selected' : 'Select...'}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
export const options = (rows: any[], label = 'name') =>
  rows.map((r) => ({ value: r.id, label: r[label] ?? r.title ?? r.reference ?? r.id }));
export const choices = (values: string[]) =>
  values.map((value) => ({ value, label: value.replaceAll('_', ' ') }));
