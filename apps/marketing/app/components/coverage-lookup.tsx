import { useState } from 'react';
import { Link } from 'react-router';
import { findServiceArea } from '../../../../packages/marketing/service-areas';
export function CoverageLookup() {
  const [result, setResult] = useState<ReturnType<typeof findServiceArea>>();
  return <div className="mkt-callout-panel">
    <h3>Check a suburb and postcode</h3>
    <p>Match both fields. Reference entries require confirmation and do not promise automatic coverage.</p>
    <form className="form" onSubmit={event => {event.preventDefault(); const form = new FormData(event.currentTarget); setResult(findServiceArea(String(form.get('suburb')), String(form.get('postcode'))));}}>
      <label>Suburb or locality<input name="suburb" required maxLength={100} autoComplete="address-level2"/></label>
      <label>Postcode<input name="postcode" required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="postal-code"/></label>
      <button className="button">Check location</button>
    </form>
    {result && <p role="status">{result.message} <Link to="/contact">Confirm your service area</Link>.</p>}
  </div>;
}
