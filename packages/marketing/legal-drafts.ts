/**
 * REVIEW DRAFTS ONLY. This module intentionally does not constitute approved
 * business privacy policy or service terms. Do not flip the approval flags
 * without independently verified operator/legal review.
 *
 * Source of technical facts: docs/ARCHITECTURE.md, docs/AUTHORIZATION.md,
 * docs/UNIFIED_SITE.md, and the actual contact/booking/records code.
 */
export const PUBLIC_LEGAL_APPROVAL = {
  privacy: { approved: false, reviewedBy: null, effectiveDate: null },
  terms: { approved: false, reviewedBy: null, effectiveDate: null },
} as const;

type LegalSection = [heading: string, body: string];
export const PUBLIC_LEGAL_DRAFTS: Record<'privacy' | 'terms', {
  title: string;
  intro: string;
  sections: LegalSection[];
}> = {
  privacy: {
    title: 'Privacy information and handling practices',
    intro: 'Review draft: this document explains the platform’s known information flows. It has not yet been approved as ProInspect’s final privacy policy.',
    sections: [
      ['Who operates this service',
        'ProInspect provides property-inspection and property-operations services in Western Australia. Before this notice becomes the operative privacy policy, the business must confirm its contracting legal entity, ABN (if applicable), postal address, telephone contact and designated privacy contact. For questions about this draft, use info@proinspect.systems.'],
      ['Information requested',
        'A public enquiry can include your name, email, optional telephone number, organisation, general suburb, selected service and description of the property task. Authenticated workflows can include account and organisation details, property and tenancy relationships, appointments, access instructions, contractor/work-order records, uploaded material and issued reports. The exact information requested depends on your role and the task.'],
      ['How information is received',
        'Information is entered directly in forms, supplied by appropriately authorised clients, staff or invited participants, or generated through the service workflow (for example, a work-order status or an inspection record). Email sign-in and relationship invitations may also produce authentication and activity records.'],
      ['Why information is used',
        'The application uses relevant information to identify users, verify authorised relationships, respond to enquiries, assess service suitability, coordinate property attendance, manage work orders, issue records and reports, provide customer support and maintain audit and security controls. Public enquiry consent relates to responding to that enquiry; it is not an automatic marketing subscription.'],
      ['Who may receive information',
        'The application is designed to provide access according to verified property, tenancy, organisation, scheme or work assignments. Authorised staff may process the information required for their role. Where an approved workflow uses a contractor, email, payment or hosting provider, limited information may be processed to deliver that function. The actual providers, contractual roles and disclosures must be verified before this draft is approved.'],
      ['Property records and restricted material',
        'Issued property documents are held in private storage and require a specific authorised relationship or grant before download. The platform distinguishes ordinary operational records from restricted information. Initial public enquiries should not include entry codes, confidential tenant material or sensitive evidence. This is an architectural control description, not a guarantee that a particular account already has production access.'],
      ['Security and account access',
        'The application uses verified sessions, server-side authorisation, access restrictions, audit events and encrypted storage for selected sensitive information. No internet service can guarantee absolute security. Do not use the public contact form for emergencies or confidential evidence.'],
      ['Access and correction requests',
        'For a request concerning your personal information, email info@proinspect.systems with “Privacy access or correction” in the subject. ProInspect must confirm an identity-verification and response procedure, a responsible contact person, and lawful exceptions before approving this draft. Access to another person’s tenancy or property record is not granted simply by knowing its identifier.'],
      ['Complaints and privacy concerns',
        'Send a privacy concern to info@proinspect.systems with a general description and safe contact method. The business must publish its nominated privacy officer, complaint assessment and escalation procedure, and the process for applicable external review before activating this as its final policy.'],
      ['Retention, correction and deletion',
        'Some service, compliance, audit and issued-document records may need to be retained after an engagement ends. The operator has not yet approved the applicable retention periods, secure disposal process, statutory exceptions or destruction/de-identification schedule. No promise of immediate deletion or indefinite retention is made here.'],
      ['Hosting and overseas recipients',
        'The service is built on Cloudflare infrastructure and may use contracted communications or payment integrations. The business must audit the actual recipients, applicable countries, data-transfer arrangements and any legally required overseas-disclosure statement before this policy becomes final. No claim of exclusively Australian storage is made.'],
      ['Changes and approval',
        'This is a review draft, not an operative final privacy policy. The final policy requires a named approved operator, published effective date, finalised handling/disclosure/retention details and review of applicable Australian privacy obligations.'],
    ],
  },
  terms: {
    title: 'Property service terms — review draft',
    intro: 'These proposed service terms explain the intended booking and attendance model. They are not an approved customer contract.',
    sections: [
      ['Parties and document status',
        'This is a draft for review. The operating legal entity, ABN if applicable, business contact details, effective date and any organisation-specific contract hierarchy must be confirmed before these terms can be offered to customers.'],
      ['Services and agreed scope',
        'The online catalogue describes possible inspections, attendance, contractor-access support, documentation and operational services. Every engagement is limited to the confirmed instruction, relevant property, agreed output and any exclusions communicated before acceptance. A catalogue description is not an unlimited service obligation.'],
      ['Requests, quotations and confirmation',
        'Selecting a service or sending an enquiry does not automatically create a confirmed appointment. Available services and times, location, access, pricing and applicable customer approval are checked through the authorised booking or instruction workflow. The accepted booking or individual agreement records what has been confirmed.'],
      ['Authority to instruct and access',
        'The person instructing ProInspect must hold the required authority for the property and provide lawful access arrangements. A verified email or property reference alone does not confer ownership, tenancy management or strata decision-making authority. Access requirements for occupied properties and common areas remain subject to applicable law and the agreed instruction.'],
      ['Pricing, inclusions and payment',
        'An applicable price, inclusion entitlement, GST treatment, authorised payment mechanism and any additional charges must be disclosed and confirmed for the particular booking or commercial arrangement. Published marketing pages do not independently establish a quote. Payment processes and reconciliation are handled through authorised application workflows.'],
      ['Cancellation, changes and missed access',
        'The operator must approve and publish the cancellation, rescheduling, notice, missed-access and refund arrangements before these terms become operative. No universal cancellation fee, non-refundable deposit or unilateral pricing-change right is created by this draft.'],
      ['Condition reports and service outputs',
        'Reports and property attendance records document only the observations and activities within the accepted service scope. Unless separately agreed by an appropriately qualified provider, ordinary inspections do not constitute engineering certification, electrical compliance assessments, building warranties, statutory determinations or emergency response.'],
      ['Follow-up work and contractor responsibilities',
        'Observing a matter that may need further attention does not itself authorise repairs, specialist assessments, additional expenditure or third-party works. Additional work requires the appropriate instruction, contractor agreement and approvals. Scheme governance and council decisions remain with the authorised parties.'],
      ['Customer materials, privacy and secure records',
        'Customers should provide necessary accurate property information and avoid including confidential evidence in the public enquiry channel. Reports and issued documents are made available only through authorised application access. Refer to the applicable approved privacy policy once published.'],
      ['Consumer and statutory rights',
        'Nothing in an approved service contract should exclude, restrict or modify non-excludable rights or remedies under the Australian Consumer Law or other applicable law. The final terms must be reviewed for fairness, clarity and consistency with consumer and small-business protections.'],
      ['Concerns and dispute handling',
        'Service concerns may be raised through info@proinspect.systems. The operator must approve escalation contacts, response commitments, any complaint process and the applicable governing-business details before this draft is published as binding terms.'],
      ['Release approval',
        'These are proposed terms only. The final document requires a confirmed contracting entity and approved commercial schedules, authorised cancellation terms, payment/refund and dispute procedures, legal review and a published effective date.'],
    ],
  },
};
