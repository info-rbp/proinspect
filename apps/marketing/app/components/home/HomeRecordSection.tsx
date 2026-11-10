import { Link } from 'react-router';
import { IllustrativeReport } from '../marketing-ui';

export function HomeRecordSection() {
  return (
    <section className="mkt-section pi-section pi-record" aria-labelledby="pi-outcome">
      <div className="site-container pi-record-grid">
        <div>
          <p className="eyebrow">More than the visit</p>
          <h2 id="pi-outcome">See what was done. Know what needs attention.</h2>
          <p>
            Inspection findings, relevant photographs and attendance information stay connected with
            the property. When a report is issued, authorised customers can review it in their
            workspace.
          </p>
          <ul>
            <li>Clear dated observations within the agreed scope</li>
            <li>Relevant images or supporting notes where applicable</li>
            <li>Follow-up matters identified for your review</li>
          </ul>
          <Link to="/client-experience" data-pi-conversion="home-client-experience">
            Explore the client experience <span aria-hidden="true">→</span>
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
