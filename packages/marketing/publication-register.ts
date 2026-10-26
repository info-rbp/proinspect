import { SERVICE_SEEDS } from '../service-catalogue/index.ts';
import { SERVICE_SCOPE_DETAILS } from './service-scopes.ts';
/**
 * Version-controlled evidence register. "pending" is never a publication approval.
 * Keep customer information, consent forms and licensed assets outside this public source tree.
 */
export type ApprovalState = 'pending' | 'approved' | 'rejected' | 'withdrawn';
export type PublicationRecord = {
  id: string;
  category: 'copy' | 'service' | 'media' | 'report-example' | 'accessibility' | 'legal' | 'seo';
  subject: string;
  status: ApprovalState;
  reviewer: string | null;
  approvedAt: string | null;
  evidenceReference: string | null;
  notes: string;
};
const record = (id: string, category: PublicationRecord['category'], subject: string, notes: string): PublicationRecord =>
  ({ id, category, subject, status: 'pending', reviewer: null, approvedAt: null, evidenceReference: null, notes });
export const PUBLICATION_REGISTER: readonly PublicationRecord[] = [
  record('COPY-HOME', 'copy', '/', 'Approve homepage positioning, service boundaries and guest/subscriber CTA statements.'),
  record('COPY-SECTORS', 'copy', '/sectors/*', 'Verify role boundaries; ProInspect is not represented as the leasing agent or property manager.'),
  record('COPY-ENGAGEMENT', 'copy', '/how-we-work/*', 'Approve commercial engagement-model claims and scope.'),
  ...SERVICE_SEEDS.map(s => record('SERVICE-' + s.id, 'service', '/services/' + s.id,
    'Review indicative inclusions, exclusions and deliverables; confirm against accepted service specifications.')),
  ...(['home-hero','sector-residential','sector-commercial','sector-strata','service-hero'] as const)
    .map(slot => record('MEDIA-' + slot, 'media', slot, 'Rights, permitted use, property/person consent, alt text and public-asset approval required.')),
  ...(['routine-inspection','property-condition-report','commercial-property-inspection'] as const)
    .map(id => record('REPORT-' + id, 'report-example', id, 'Use synthetic data from the actual reporting engine or explicitly authorised and redacted report output.')),
  record('LEGAL-PRIVACY', 'legal', '/privacy', 'Formal approval, operator identity, vendor disclosures, retention and effective date required.'),
  ...(['website-terms', 'platform-terms', 'booking-policy', 'service-scopes', 'subscription-terms'] as const).map(key => record('LEGAL-' + key.toUpperCase(), 'legal', '/' + key, 'Independent exact-version approval required before publication.')),
  record('LEGAL-TERMS', 'legal', '/terms', 'Final service, booking, cancellation and consumer provisions plus effective date required.'),
  record('A11Y-MANUAL', 'accessibility', 'Public website', 'WCAG 2.2 AA manual keyboard, zoom, screen-reader and responsive checks.'),
  record('SEO-RELEASE', 'seo', 'Public website', 'Verify title, canonical, sitemap, metadata, links, robots and published approval states.'),
] as const;
export function publicationRecord(id: string) { return PUBLICATION_REGISTER.find(r => r.id === id) ?? null; }
export function isPublicationApproved(record: PublicationRecord): boolean {
  return record.status === 'approved' && !!record.reviewer?.trim() && !!record.approvedAt &&
    !Number.isNaN(Date.parse(record.approvedAt)) && !!record.evidenceReference?.trim();
}
export function assertPublicationRegisterIntegrity(): void {
  const ids = PUBLICATION_REGISTER.map(r => r.id);
  if (ids.length !== new Set(ids).size) throw new Error('Duplicate publication record');
  const scopeIds = Object.keys(SERVICE_SCOPE_DETAILS).sort();
  const serviceIds = SERVICE_SEEDS.map(s => s.id).sort();
  if (JSON.stringify(scopeIds) !== JSON.stringify(serviceIds)) throw new Error('Missing service scope coverage');
  for (const r of PUBLICATION_REGISTER) {
    if (r.status === 'approved' && !isPublicationApproved(r))
      throw new Error('Unsubstantiated approval for ' + r.id);
  }
}
