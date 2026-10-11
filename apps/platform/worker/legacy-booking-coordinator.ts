import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../../../packages/database/types';

/**
 * Compatibility export for the EXISTING proinspect-platform Worker.
 * The original cf-v1 migration created the SQLite-backed BookingCoordinator
 * namespace. Cloudflare will reject a replacement script that removes the
 * class while Durable Objects belonging to that namespace still exist.
 *
 * BookingCoordinator and BookingScheduler have different booking contracts.
 * Never rename/delete the old namespace or forward old requests into the new
 * scheduler: doing so could corrupt bookings or destroy historical storage.
 * No new application code routes requests to this compatibility class.
 * Retire it only after an explicit migration/retention review.
 */
export class BookingCoordinator extends DurableObject<Env> {
  async fetch(_request: Request): Promise<Response> {
    return Response.json(
      {
        code: 'LEGACY_BOOKING_COORDINATOR_UNAVAILABLE',
        message: 'This former booking service is no longer available. Please use the current ProInspect application.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
