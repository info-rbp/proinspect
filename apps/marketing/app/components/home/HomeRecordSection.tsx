import { Link } from 'react-router';
import { IllustrativeReport } from '../marketing-ui';

export function HomeRecordSection() {
  return (
    <section className="mkt-section pi-section pi-record" aria-labelledby="pi-outcome">
      <div className="site-container pi-record-grid">
        <div>
          <p className="eyebrow">More than the visit</p>
          <h2 id="pi-outcome">
            See what was done.
            <br />
            Know what needs attention.
          </h2>
          <p>
            Get a clear record of your property visit, including relevant photos and practical
            notes, so you can understand the outcome and decide what to do next. When your report is
            ready, you can access it securely from your workspace.
          </p>
          <ul>
            <li>See clear, dated observations from your service</li>
            <li>Review relevant photos and supporting notes</li>
            <li>Identify follow-up items and plan your next step</li>
          </ul>
          <Link to="/client-experience" data-pi-conversion="home-client-experience">
            See how your workspace keeps you informed <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className="pi-report-panel">
          <IllustrativeReport compact />
          <p>
            Illustrative report layout, not an actual issued report. Deliverables depend on the
            agreed service.
          </p>
        </div>
      </div>
    </section>
  );
}
