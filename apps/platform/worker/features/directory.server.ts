import { z } from 'zod';
import { statement, assert, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import { propertyScope } from '../../../../packages/authorization/server';
const cursorSchema = z.object({ address: z.string().max(180), id: z.string().max(100) });
export async function propertyDirectory(
  env: Env,
  user: Principal,
  w: Workspace,
  params: URLSearchParams,
) {
  const query = z
    .object({
      q: z.string().trim().max(100).default(''),
      limit: z.coerce.number().int().min(1).max(100).default(24),
      sector: z.enum(['residential', 'commercial', 'strata-building']).optional(),
      after: z.string().max(1000).optional(),
    })
    .parse(Object.fromEntries(params));
  let cursor: z.infer<typeof cursorSchema> | undefined;
  if (query.after) {
    try {
      cursor = cursorSchema.parse(
        JSON.parse(
          new TextDecoder().decode(Uint8Array.from(atob(query.after), (c) => c.charCodeAt(0))),
        ),
      );
    } catch {
      assert(false, 422, 'CURSOR_INVALID', 'The page position is invalid. Start the search again.');
    }
  }
  const scope = propertyScope(user, w),
    term = `%${query.q.replace(/[\\%_]/g, '\\$&')}%`;
  const where = `p.archived_at IS NULL AND (${scope.sql}) AND (p.address LIKE ? ESCAPE '\\' OR p.suburb LIKE ? ESCAPE '\\' OR p.postcode LIKE ? ESCAPE '\\') ${query.sector ? 'AND p.sector=?' : ''}`;
  const values: (string | number)[] = [
    ...scope.values,
    term,
    term,
    term,
    ...(query.sector ? [query.sector] : []),
  ];
  const count = await statement(
    env.DB,
    `SELECT COUNT(*) AS total FROM properties p WHERE ${where}`,
    ...values,
  ).first<{ total: number }>();
  const rows = (
    await statement(
      env.DB,
      `SELECT p.id,p.address,p.suburb,p.state,p.postcode,p.sector,p.property_type FROM properties p WHERE ${where} ${cursor ? 'AND (p.address>? OR (p.address=? AND p.id>?))' : ''} ORDER BY p.address,p.id LIMIT ?`,
      ...values,
      ...(cursor ? [cursor.address, cursor.address, cursor.id] : []),
      query.limit + 1,
    ).all<{ id: string; address: string; [key: string]: unknown }>()
  ).results;
  const hasMore = rows.length > query.limit,
    items = rows.slice(0, query.limit),
    last = items.at(-1);
  const next =
    hasMore && last
      ? btoa(
          String.fromCharCode(
            ...new TextEncoder().encode(JSON.stringify({ address: last.address, id: last.id })),
          ),
        )
      : null;
  return { items, total: count?.total ?? 0, next, query: query.q, limit: query.limit };
}
