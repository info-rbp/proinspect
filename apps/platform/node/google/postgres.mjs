import pg from 'pg';
import {Connector, IpAddressTypes, AuthTypes} from '@google-cloud/cloud-sql-connector';
import {postgresQuery} from './sql.mjs';

function numberFromDatabase(text) {
  const value = Number(text);
  if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
    throw RangeError('Database result exceeds the safe numeric range');
  }
  return value;
}
const types = {getTypeParser(oid, format) {
  if (format !== 'binary' && [20, 1700].includes(oid)) return numberFromDatabase;
  return pg.types.getTypeParser(oid, format);
}};
export const poolOptions = {max: 2, connectionTimeoutMillis: 7000, idleTimeoutMillis: 10000, statement_timeout: 20000, idle_in_transaction_session_timeout: 25000, options: '-c timezone=UTC', types};
const writerLock = 'SELECT pg_advisory_xact_lock(1701996912, 1)';

export function createDatabase(pool, client = null) {
  async function execute(connection, prepared, changes) {
    if (prepared.owner !== api) throw Error('Statement belongs to a different database');
    const query = postgresQuery(prepared.sql, prepared.values, changes);
    try {
      const result = await connection.query(query);
      const written = ['INSERT','UPDATE','DELETE'].includes(result.command);
      // SQLite/D1 exposes SQL truth values as 0/1, including EXISTS projections.
      const boolColumns = result.fields.filter(field => field.dataTypeID === 16).map(field => field.name);
      for (const row of result.rows) for (const column of boolColumns) {
        if (row[column] !== null) row[column] = Number(row[column]);
      }
      return {success: true, results: result.rows, meta: {changes: written ? result.rowCount : 0}, written};
    } catch (error) {
      if (error.code === '23505') {
        const columns = /^Key \(([\w, ]+)\)=/.exec(error.detail ?? '')?.[1];
        const names = columns?.split(', ').map(col => error.table + '.' + col).join(', ');
        throw Object.assign(Error('UNIQUE constraint failed: ' + (names || error.constraint)), {code: error.code});
      }
      throw error;
    }
  }
  const api = {
    prepare(sql) {
      function statement(values) {
        return {
          owner: api, sql, values,
          bind(...args) { return statement(args); },
          run() { return execute(client ?? pool, this); },
          all() { return this.run(); },
          async first(column) {
            const row = (await this.run()).results[0];
            if (!row) return null;
            if (column !== undefined && !Object.hasOwn(row, column)) throw Error('Unknown result column');
            return column === undefined ? row : row[column];
          },
          async raw() { return (await this.run()).results.map(row => Object.values(row)); }
        };
      }
      return statement([]);
    },
    async batch(statements) {
      const connection = client ?? await pool.connect();
      const nested = Boolean(client);
      try {
        await connection.query(nested ? 'SAVEPOINT pi_batch' : 'BEGIN');
        if (!nested) await connection.query(writerLock);
        const results = [];
        let changes;
        for (const statement of statements) {
          const result = await execute(connection, statement, changes);
          if (result.written) changes = result.meta.changes;
          results.push(result);
        }
        await connection.query(nested ? 'RELEASE SAVEPOINT pi_batch' : 'COMMIT');
        return results;
      } catch (error) {
        await connection.query(nested ? 'ROLLBACK TO SAVEPOINT pi_batch' : 'ROLLBACK');
        throw error;
      } finally {
        if (!nested) connection.release();
      }
    },
    // The existing booking operation reads, authorizes and checks capacity before building a batch.
    // Keep those reads and the batch under the same cross-instance database lock.
    async schedule(callback) {
      if (client) throw Error('Nested scheduling is unsupported');
      const connection = await pool.connect();
      try {
        await connection.query('BEGIN');
        await connection.query(writerLock);
        const response = await callback(createDatabase(pool, connection));
        await connection.query(response.ok ? 'COMMIT' : 'ROLLBACK');
        return response;
      } catch (error) {
        await connection.query('ROLLBACK');
        throw error;
      } finally { connection.release(); }
    }
  };
  return api;
}

export async function connectCloudSql(stage, role = 'runtime', database = 'proinspect_' + stage) {
  if (!['dev','staging'].includes(stage) || !['runtime','migrate'].includes(role)) throw Error('Invalid database binding');
  const connector = new Connector();
  const project = 'proinspect-property-services';
  try {
    const opts = await connector.getOptions({
      instanceConnectionName: project + ':australia-southeast1:pi-mig-' + stage + '-pg',
      ipType: IpAddressTypes.PRIVATE, authType: AuthTypes.IAM
    });
    const pool = new pg.Pool({...opts, ...poolOptions, user: 'pi-mig-' + stage + '-' + role + '@' + project + '.iam', database});
    return {pool, db: createDatabase(pool), async close() { try { await pool.end(); } finally { connector.close(); } }};
  } catch (error) {
    connector.close();
    throw error;
  }
}
