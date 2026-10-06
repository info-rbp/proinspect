/** Carry a service slug through onboarding, never an arbitrary redirect URL. */
export function bookingIntent(value: unknown): string | null {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{2,79}$/.test(value) ? value : null;
}
export function propertySetupPath(workspaceHref: string, serviceId: string | null): string {
  return `${workspaceHref}/properties${serviceId ? `?service=${encodeURIComponent(serviceId)}` : ''}`;
}
