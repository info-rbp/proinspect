/** Residential acquisition policy. Historical identities and grants remain intact. */
export const RESIDENTIAL_PLAN = {
  id: 'residential-all-inclusive-weekly-2026-11',
  name: 'Residential All Inclusive Subscription',
  currency: 'aud',
  weeklyExGstCents: 5000,
  weeklyIncGstCents: 5500,
  interval: 'week',
  quantity: 1,
  billingUnit: 'property',
  initialTermMonths: 24,
  cancellationNoticeDays: 60,
} as const;

export const RETIRED_WORKSPACES = new Set([
  'commercial',
  'commercial-occupant',
  'strata-manager',
  'building-manager',
  'building',
  'council',
]);
export function isResidentialSector(sector: unknown): boolean {
  return sector === 'residential';
}

/** Normalise React Router data requests and encoded/deep URLs too. */
export function retiredPublicPath(path: string): boolean {
  let normal: string;
  try {
    normal = decodeURIComponent(path)
      .replace(/\.data$/, '')
      .replace(/\/+$/, '');
  } catch {
    return true;
  }
  return (
    /^\/(?:commercial|strata|construction)(?:[-/]|$)/.test(normal) ||
    /^\/sectors\/(?:commercial|strata-building|construction)(?:\/|$)/.test(normal) ||
    /^\/properties-for-lease\/commercial(?:\/|$)/.test(normal) ||
    /^\/who-we-help\/(?:commercial[^/]*|strata[^/]*|building[^/]*|construction[^/]*|developers[^/]*)(?:\/|$)/.test(
      normal,
    ) ||
    /^\/services\/(?:COM-\d+|commercial-[^/]+|common-property-inspection|building-management-attendance|building-handover-attendance|urgent-building-attendance)$/.test(
      normal,
    )
  );
}

export function residentialPublicResponse(request: Request): Response | null {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\.data$/, '').replace(/\/+$/, '');
  if (path === '/student-living')
    return new Response(null, { status: 301, headers: { Location: '/co-living' } });
  if (!retiredPublicPath(path)) return null;
  return new Response(
    'This offering is no longer available. Explore Residential services at /residential or contact info@proinspect.systems. Existing account records remain available through sign-in.',
    {
      status: 410,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow',
        'Cache-Control': 'no-store',
      },
    },
  );
}

/** Earliest ordinary cancellation date; exceptions require separately reviewed authority. */
export function earliestResidentialCancellation(startedAt: string, noticeAt: string): string {
  const start = new Date(startedAt),
    notice = new Date(noticeAt);
  if (!Number.isFinite(+start) || !Number.isFinite(+notice))
    throw new Error('Invalid contract dates');
  const end = new Date(start);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + RESIDENTIAL_PLAN.initialTermMonths);
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, last));
  notice.setUTCDate(notice.getUTCDate() + RESIDENTIAL_PLAN.cancellationNoticeDays);
  return new Date(Math.max(+end, +notice)).toISOString();
}
