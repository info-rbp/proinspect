import { legalStatements } from './features/legal-acceptance.server';
import { effectiveCashTerms, assertCashCreditCapacity } from './features/cash-terms.server';
import { requireReleaseApproval } from './features/release-governance.server';
import { bookingFingerprintFields } from '../../../packages/booking/inspection-checkout';
import { PCR_LAUNCH_SERVICE } from '../../../packages/marketing/pcr-campaign';
import { guestSchedulerOperation } from './features/guest-scheduler.server';
import { changeBooking } from './features/bookings.server';
import { nextMonthDate, guard, clearGuard, projection } from '../../../packages/operations/core';
import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../../../packages/database/types';
import { assert, AppError, statement, now, uid } from '../../../packages/database/types';
import type { Principal, Service } from '../../../packages/domain/index';
import { bookingSchema } from '../../../packages/validation/index';
import { workspace, propertyAccess } from '../../../packages/authorization/server';
import { digest, seal } from '../../../packages/auth/crypto';
import { mailEvent } from '../../../packages/notifications/server';
import { audit, catalogue } from './services.server';
import { includedSubscriptionBooking } from '../../../packages/authorization/subscription-booking';
import { assertCalendarSlot, calendarSchedulingEnabled, calendarSyncStatement, googleBusy, overlaps } from './features/calendar-scheduling.server';

export function appointmentWindow(service: Service, startsAt: string, clock = Date.now(), pcrLaunch = false) {
  const starts = new Date(startsAt);
  assert(Number.isFinite(starts.getTime()), 422, 'DATE_INVALID', 'Choose a valid appointment.');
  const ends = new Date(starts.getTime() + service.duration_minutes * 60000);
  const localStart = new Date(starts.getTime() + 8 * 3600000);
  const localEnd = new Date(ends.getTime() + 8 * 3600000);
  assert(
    starts.getTime() >= clock + service.notice_hours * 3600000 &&
      starts.getTime() <= clock + service.horizon_days * 86400000,
    422,
    'OUTSIDE_BOOKING_WINDOW',
    'Choose a date within this service booking window.',
  );
  if (pcrLaunch) {
    assert(service.id === PCR_LAUNCH_SERVICE, 403, 'PCR_SERVICE_REQUIRED', 'This appointment rule applies only to the PCR campaign.');
    assert(localStart.getUTCHours() >= 9 && localEnd.getUTCHours() <= 17 &&
      (localEnd.getUTCHours() < 17 || localEnd.getUTCMinutes() === 0) &&
      localStart.getUTCDate() === localEnd.getUTCDate(), 422, 'OUTSIDE_HOURS',
      'PCR appointments are available between 9 am and 5 pm Perth time.');
  } else {
    assert(localStart.getUTCDay() >= 1 && localStart.getUTCDay() <= 5, 422, 'OUTSIDE_HOURS', 'Appointments are available on weekdays.');
    assert(localStart.getUTCHours() >= 8 && localEnd.getUTCHours() <= 17 &&
      (localEnd.getUTCHours() < 17 || localEnd.getUTCMinutes() === 0) &&
      localStart.getUTCDate() === localEnd.getUTCDate(), 422, 'OUTSIDE_HOURS', 'Choose an appointment within 8 am to 5 pm AWST.');
  }
  assert(
    starts.getUTCMinutes() % 15 === 0 &&
      starts.getUTCSeconds() === 0 &&
      starts.getUTCMilliseconds() === 0,
    422,
    'INVALID_SLOT',
    'Choose a 15-minute appointment slot.',
  );
  return {
    startsAt: starts.toISOString(),
    endsAt: ends.toISOString(),
    reservedStart: new Date(starts.getTime() - service.buffer_before * 60000).toISOString(),
    reservedEnd: new Date(ends.getTime() + service.buffer_after * 60000).toISOString(),
  };
}
export async function availability(env: Env, serviceId: string, date: string, includedInSubscription = false, pcrLaunch = false) {
  assert(/^\d{4}-\d{2}-\d{2}$/.test(date), 422, 'DATE_INVALID', 'Choose a valid date.');
  const service = (await catalogue(env)).find((s) => s.id === serviceId);
  assert(service, 404, 'SERVICE_NOT_FOUND', 'Service not found.');
  if (pcrLaunch) assert(service.id === PCR_LAUNCH_SERVICE && env.PCR_LAUNCH_ENABLED === 'true', 403, 'PCR_OFFER_UNAVAILABLE', 'The PCR campaign is not active.');
  if (!includedInSubscription && !pcrLaunch && (service.booking_mode !== 'instant' || service.price_ex_gst_cents === null))
    return {
      slots: [],
      message: 'This service is not currently available for direct booking. Choose an included subscription service or submit a service request.',
    };
  const resource = await statement(
    env.DB,
    "SELECT id FROM schedule_resources WHERE id='default' AND active=1",
  ).first();
  if (!resource) return { slots: [], message: 'Online scheduling has not been opened yet.' };
  const candidates: { start: string; end: string; label: string }[] = [];
  const candidateReservations = new Map<string, { start: string; end: string }>();
  for (let minutes = pcrLaunch ? 540 : 480; minutes < 1020; minutes += 15) {
    try {
      const start = `${date}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00+08:00`;
      const window = appointmentWindow(service, start, Date.now(), pcrLaunch);
      const conflict = await statement(
        env.DB,
        `SELECT id FROM bookings WHERE resource_id='default' AND status!='cancelled' AND reserved_start<? AND reserved_end>? UNION ALL SELECT id FROM schedule_blocks WHERE resource_id='default' AND starts_at<? AND ends_at>? LIMIT 1`,
        window.reservedEnd,
        window.reservedStart,
        window.reservedEnd,
        window.reservedStart,
      ).first();
      if (!conflict) {
        candidateReservations.set(window.startsAt, { start: window.reservedStart, end: window.reservedEnd });
        candidates.push({
          start: window.startsAt,
          end: window.endsAt,
          label: new Intl.DateTimeFormat('en-AU', {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: 'Australia/Perth',
          }).format(new Date(window.startsAt)),
        });
      }
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
    }
  }
  let filtered = candidates;
  if (calendarSchedulingEnabled(env) && candidates.length) {
    const windows = [...candidateReservations.values()];
    let busy: { start: string; end: string }[];
    try {
      busy = await googleBusy(
        env,
        windows.reduce((minimum, w) => w.start < minimum ? w.start : minimum, windows[0].start),
        windows.reduce((maximum, w) => w.end > maximum ? w.end : maximum, windows[0].end),
      );
    } catch {
      // An API outage cannot silently turn a busy Google Calendar into open slots.
      throw new AppError(503, 'CALENDAR_UNAVAILABLE', 'Appointment availability cannot be verified right now.');
    }
    filtered = candidates.filter(slot =>
      !busy.some(period => overlaps(period, candidateReservations.get(slot.start)!)),
    );
  }
  return {
    slots: filtered,
    message: filtered.length ? '' : 'No appointments are available for this date.',
  };
}
export class BookingScheduler extends DurableObject<Env> {
  private tail: Promise<unknown> = Promise.resolve();
  async fetch(request: Request) {
    const task = this.tail.then(() => this.reserve(request));
    this.tail = task.catch(() => undefined);
    return task;
  }
  private async reserve(request: Request) {
    try {
      if(new URL(request.url).pathname==='/guest'){
        // Await inside this boundary so AppError remains a safe HTTP response across the DO call.
        return await guestSchedulerOperation(this.env,await request.json());
      }
      const {
        userId,
        clientId,
        input,
        kind = 'landlord',
        operation,
        bookingId,
      } = (await request.json()) as {
        userId: string;
        clientId: string;
        input: unknown;
        kind?: string;
        operation?: string;
        bookingId?: string;
      };
      const user = await statement(
        this.env.DB,
        'SELECT u.id,u.email,u.display_name,s.role AS staffRole FROM users u LEFT JOIN staff_profiles s ON s.user_id=u.id AND s.active=1 WHERE u.id=? AND u.active=1',
        userId,
      ).first<Principal>();
      assert(user, 403, 'USER_INACTIVE', 'This account is not active.');
      const w = await workspace(this.env, user, kind, clientId);
      if (operation === 'change') {
        assert(typeof bookingId === 'string', 422, 'BOOKING_REQUIRED', 'Select a booking.');
        return Response.json(await changeBooking(this.env, user, w, bookingId, input));
      }
      const data = bookingSchema.parse(input);
      const property = await propertyAccess(this.env, user, w, data.propertyId, true);
      const fingerprint = await digest(JSON.stringify(bookingFingerprintFields(data)));
      const existing = await statement(
        this.env.DB,
        'SELECT id,reference,fingerprint,user_id FROM bookings WHERE client_id=? AND request_key=?',
        clientId,
        data.requestKey,
      ).first<{ id: string; reference: string; fingerprint: string; user_id: string }>();
      if (existing) {
        assert(
          existing.fingerprint === fingerprint && existing.user_id === userId,
          409,
          'IDEMPOTENCY_MISMATCH',
          'This submission key was already used. Reload and review the booking.',
        );
        const pendingPayment=await statement(this.env.DB,
          `SELECT p.id AS payment_id,p.total_cents,p.status
           FROM registered_booking_payment_links l JOIN payments p ON p.id=l.payment_id
           WHERE l.booking_id=?`,existing.id).first<{payment_id:string;total_cents:number;status:string}>();
        const cashCharge=await statement(this.env.DB,
          `SELECT c.payment_id,p.total_cents,c.term_code
           FROM cash_booking_charges c JOIN payments p ON p.id=c.payment_id
           WHERE c.booking_id=?`,existing.id)
          .first<{payment_id:string;total_cents:number;term_code:'net_7'|'eom_7'}>();
        return Response.json({
          id:existing.id,reference:existing.reference,replayed:true,
          paymentId:pendingPayment?.payment_id??cashCharge?.payment_id??null,
          paymentRequired:Boolean(pendingPayment&&pendingPayment.status!=='paid'),
          totalCents:pendingPayment?.total_cents??cashCharge?.total_cents??0,
          paymentTerms:cashCharge?.term_code??(pendingPayment?'upon_booking':null),
          invoiceAfterService:Boolean(cashCharge),
        });
      }
      const service = (await catalogue(this.env)).find((s) => s.id === data.serviceId);
      assert(service, 404, 'SERVICE_NOT_FOUND', 'Service not found.');
      assert(
        service.sectors.includes(property.sector),
        422,
        'SERVICE_SECTOR_MISMATCH',
        'This service is not available for the selected property category.',
      );
      const includedSubscription = await includedSubscriptionBooking(
        this.env, clientId, property.id, service.id,
      );
      assert(
        includedSubscription ||
          (service.booking_mode === 'instant' && service.price_ex_gst_cents !== null),
        409,
        'SERVICE_NOT_OPEN',
        'This service is not included in an active subscription or enabled for direct booking.',
      );
      assert(
        await statement(
          this.env.DB,
          "SELECT id FROM schedule_resources WHERE id='default' AND active=1",
        ).first(),
        409,
        'SCHEDULING_CLOSED',
        'Online scheduling is not yet open.',
      );
      if (data.access.method === 'tenant')
        assert(
          data.access.noticeConfirmed,
          422,
          'ACCESS_CONFIRMATION_REQUIRED',
          'Confirm the access and notice arrangements before booking.',
        );
      const plan = data.recurringPlanId
        ? await statement(
            this.env.DB,
            "SELECT * FROM recurring_plans WHERE id=? AND client_id=? AND property_id=? AND service_id=? AND status='active'",
            data.recurringPlanId,
            clientId,
            property.id,
            service.id,
          ).first<Record<string, any>>()
        : null;
      if (data.recurringPlanId)
        assert(
          plan && plan.next_due === data.planDue,
          409,
          'PLAN_CHANGED',
          'The recurring plan has changed. Reload it before booking.',
        );
      const schemes =
        kind === 'strata-manager'
          ? (
              await statement(
                this.env.DB,
                "SELECT DISTINCT b.scheme_id FROM scheme_buildings b JOIN scheme_client_links l ON l.scheme_id=b.scheme_id WHERE b.property_id=? AND l.client_id=? AND l.role IN('strata_manager','building_manager') AND l.starts_at<=? AND (l.ends_at IS NULL OR l.ends_at>?)",
                property.id,
                clientId,
                now(),
                now(),
              ).all<{ scheme_id: string }>()
            ).results
          : [];
      if (kind === 'strata-manager')
        assert(
          schemes.length === 1,
          409,
          'SCHEME_REVIEW_REQUIRED',
          'The building must have one unambiguous managed scheme before booking.',
        );
      const scheme = schemes[0] ?? null;
      const window = appointmentWindow(service, data.startsAt);
      await assertCalendarSlot(this.env, window);
      const id = uid('bkg'),
        reference = `PI-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        woId = `wo_${id.slice(4)}`,
        time = now();
      const amountExGstCents = includedSubscription ? 0 : service.price_ex_gst_cents ?? 0;
      const terms = includedSubscription ? null : await effectiveCashTerms(this.env,clientId);
      const creditBooking = !includedSubscription && amountExGstCents > 0 && terms?.termCode !== 'upon_booking';
      const paymentRequired = !includedSubscription && amountExGstCents > 0 && !creditBooking;
      const gstCents = amountExGstCents > 0 ? Math.round(amountExGstCents / 10) : 0;
      if (creditBooking) {
        // Source-bound release approval and the credit flag are both required.
        // An approved customer profile alone must never activate deferred booking.
        await requireReleaseApproval(this.env,'cash_credit');
        await assertCashCreditCapacity(this.env,clientId,amountExGstCents+gstCents,terms!.creditLimitCents);
      }
      // The existing Checkout integration is sandbox-only; production must not
      // reserve an uncollectable one-off paid appointment until a separately
      // accepted live Stripe flow and legal/tax release are deployed.
      assert(!paymentRequired || this.env.APP_ENV!=='production',503,
        'ONE_OFF_LIVE_CHECKOUT_NOT_RELEASED',
        'New one-off paid appointments are not yet activated. No booking or charge has been created.');
      const paymentId = !includedSubscription && amountExGstCents > 0 ? uid('pay') : null;
      const legal = await legalStatements(this.env,{kind:'user',id:user.id},'booking',id,{clientId,propertyId:property.id,serviceId:service.id,startsAt:window.startsAt,priceExGstCents:includedSubscription?0:service.price_ex_gst_cents,subscriptionId:includedSubscription?.id??null,cashPaymentTerm:terms?.termCode??null,access:data.access},data.legalConsent);
      const statements = [
        ...legal,
        statement(
          this.env.DB,
          `INSERT INTO bookings(id,reference,client_id,user_id,property_id,service_id,resource_id,starts_at,ends_at,reserved_start,reserved_end,price_ex_gst_cents,snapshot_json,request_key,fingerprint,created_at) VALUES(?,?,?,?,?,?,'default',?,?,?,?,?,?,?,?,?)`,
          id,
          reference,
          clientId,
          user.id,
          property.id,
          service.id,
          window.startsAt,
          window.endsAt,
          window.reservedStart,
          window.reservedEnd,
          includedSubscription ? 0 : service.price_ex_gst_cents,
          JSON.stringify({
            property,
            serviceName: service.name,
            customerName: user.display_name,
            customerEmail: user.email,
            bookingBasis: includedSubscription ? 'subscription_included' : 'published_price',
            cashPaymentTerm: terms?.termCode ?? null,
            cashTermApprovalRequestId: terms?.approvalRequestId ?? null,
            subscription: includedSubscription
              ? { id: includedSubscription.id, planCode: includedSubscription.planCode }
              : null,
          }),
          data.requestKey,
          fingerprint,
          time,
        ),
        statement(
          this.env.DB,
          `INSERT INTO work_orders(id,reference,booking_id,client_id,property_id,title,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?, ?,?)`,
          woId,
          `WO-${reference.slice(3)}`,
          id,
          clientId,
          property.id,
          service.name,
          paymentRequired ? 'awaiting_approval' : 'scheduled',
          time,
          time,
        ),
        ...(paymentId ? [
          statement(this.env.DB,
            `INSERT INTO payments(id,client_id,property_id,work_order_id,description,amount_ex_gst_cents,gst_cents,total_cents,status,created_at,updated_at)
             VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
            paymentId,clientId,property.id,woId,service.name,amountExGstCents,gstCents,
            amountExGstCents+gstCents,paymentRequired?'payment_required':'pending',time,time),
          ...(paymentRequired ? [statement(this.env.DB,
            'INSERT INTO registered_booking_payment_links(booking_id,payment_id,price_ex_gst_cents,gst_cents,created_at) VALUES(?,?,?,?,?)',
            id,paymentId,amountExGstCents,gstCents,time)] : []),
          ...(creditBooking ? [
            // A concurrent Staff credit change must not race the scheduler's
            // earlier balance check. Validate the exact approved profile and
            // the now-current total exposure INSIDE the booking D1 batch.
            statement(this.env.DB,
              `INSERT INTO cash_booking_charges
               (booking_id,payment_id,client_id,term_code,amount_ex_gst_cents,gst_cents,status,created_at)
               SELECT ?,?,?,?,?,?,'awaiting_service',?
               WHERE EXISTS (
                 SELECT 1 FROM cash_client_terms t
                 WHERE t.client_id=? AND t.term_code=?
                   AND t.source_request_id=?
                   AND t.credit_limit_cents IS NOT NULL
                   AND t.credit_limit_cents >= ? + COALESCE((
                     SELECT SUM(p.total_cents)
                     FROM cash_booking_charges c JOIN payments p ON p.id=c.payment_id
                     WHERE c.client_id=? AND c.status!='cancelled'
                       AND p.status NOT IN('paid','waived','refunded')
                   ),0)
               )`,
              id,paymentId,clientId,terms!.termCode,amountExGstCents,gstCents,time,
              clientId,terms!.termCode,terms!.approvalRequestId,
              amountExGstCents+gstCents,clientId),
            guard(this.env),
          ] : []),
        ] : []),
        statement(
          this.env.DB,
          'INSERT INTO booking_access_secrets(booking_id,envelope,updated_at) VALUES(?,?,?)',
          id,
          await seal(this.env.DATA_ENCRYPTION_KEY, `booking:${id}`, data.access),
          time,
        ),
        ...(data.intake ? [statement(this.env.DB,
          'INSERT INTO booking_intake_secrets(booking_id,envelope,updated_at) VALUES(?,?,?)',
          id,await seal(this.env.DATA_ENCRYPTION_KEY,`booking-intake:${id}`,data.intake),time)] : []),
        audit(this.env, user, 'booking.created', 'booking', id, property.id, { workOrderId: woId }),
        await mailEvent(this.env, 'booking.confirmed', {
          to: user.email,
          subject: `${paymentRequired ? 'Payment required for booking' : 'Booking confirmed'}: ${reference}`,
          heading: paymentRequired ? 'Complete payment to proceed' : 'Your booking is confirmed',
          body: paymentRequired
            ? 'Your appointment has been recorded but service delivery requires a separately verified payment. Use Finance in your account to open secure Checkout after any required pricing, tax and provider approvals.'
            : creditBooking
              ? 'Your appointment is confirmed under your approved account invoice terms. The invoice will follow service completion and reconciliation.'
              : 'Your booking and work order are now linked to your property. Your report will appear in your account after it is issued.',
          href: `${this.env.APP_ORIGIN}${w.href}/bookings`,
          facts: {
            Reference: reference,
            Service: service.name,
            Property: `${property.address}, ${property.suburb}`,
            Appointment: new Intl.DateTimeFormat('en-AU', {
              dateStyle: 'full',
              timeStyle: 'short',
              timeZone: 'Australia/Perth',
            }).format(new Date(window.startsAt)),
          },
        }),
      ];
      if (this.env.OPERATIONS_EMAIL)
        statements.push(
          await mailEvent(this.env, 'operations.booking', {
            to: this.env.OPERATIONS_EMAIL,
            subject: `New work order: ${reference}`,
            heading: 'New service booking',
            body: 'Assign staff and review the access arrangements in ProInspect. Confidential access instructions are not included in email.',
            href: `${this.env.APP_ORIGIN}/w/staff/operations/work-orders`,
            facts: {
              Booking: reference,
              Service: service.name,
              Property: `${property.address}, ${property.suburb}`,
            },
          }),
        );
      if (scheme)
        statements.push(
          statement(
            this.env.DB,
            'UPDATE bookings SET scheme_id=? WHERE id=?',
            scheme.scheme_id,
            id,
          ),
          statement(
            this.env.DB,
            'UPDATE work_orders SET scheme_id=? WHERE id=?',
            scheme.scheme_id,
            woId,
          ),
        );
      if (plan)
        statements.push(
          statement(
            this.env.DB,
            'INSERT INTO plan_occurrences(plan_id,due_date,booking_id) VALUES(?,?,?)',
            plan.id,
            plan.next_due,
            id,
          ),
          statement(
            this.env.DB,
            'UPDATE recurring_plans SET next_due=?,version=version+1 WHERE id=? AND version=?',
            nextMonthDate(plan.next_due, plan.interval_months),
            plan.id,
            plan.version,
          ),
          guard(this.env),
          clearGuard(this.env),
        );
      if (calendarSchedulingEnabled(this.env)) statements.push(calendarSyncStatement(this.env, id, 1));
      statements.push(
        projection(this.env, 'booking.created', id, {
          reference,
          status: paymentRequired ? 'payment_required' : 'confirmed',
          propertyId: property.id,
          serviceId: service.id,
          workOrderId: woId,
          startsAt: window.startsAt,
        }),
      );
      await this.env.DB.batch(statements);
      return Response.json({
        id,reference,workOrderId:woId,paymentId,paymentRequired,
        totalCents:!includedSubscription ? amountExGstCents+gstCents : 0,
        paymentTerms:terms?.termCode??null,invoiceAfterService:creditBooking,
        message:paymentRequired ? 'Appointment recorded. Payment is required before service delivery.' : 'Booking confirmed.',
      },{status:201});
    } catch (error) {
      if (error instanceof AppError)
        return Response.json(
          { code: error.code, message: error.message },
          { status: error.status },
        );
      if (error instanceof Error && /SCHEDULE_CONFLICT|SCHEDULE_BLOCKED/.test(error.message))
        return Response.json(
          {
            code: 'SCHEDULE_CONFLICT',
            message: 'That appointment has just become unavailable. Choose another time.',
          },
          { status: 409 },
        );
      throw error;
    }
  }
}
