import {createHash} from 'node:crypto';
import {readdir, readFile} from 'node:fs/promises';

const files = new URL('../../../../database/postgres/migrations/', import.meta.url);
export async function applyMigrations(pool) {
  const names = (await readdir(files)).filter(name => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
  if (!names.length) throw Error('No PostgreSQL migrations in image');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(1701996912, 2)');
    await client.query("SET LOCAL statement_timeout='120s'");
    await client.query("SET LOCAL timezone='UTC'");
    await client.query('CREATE SCHEMA IF NOT EXISTS pi_migrations');
    await client.query('CREATE TABLE IF NOT EXISTS pi_migrations.ledger (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    const history = (await client.query('SELECT name, sha256 FROM pi_migrations.ledger ORDER BY name')).rows;
    if (history.some((row, i) => row.name !== names[i])) throw Error('Unexpected PostgreSQL migration history');
    const applied = [];
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const sql = await readFile(new URL(name, files),'utf8');
      const digest = createHash('sha256').update(sql).digest('hex');
      if (i < history.length) {
        if (history[i].sha256 !== digest) throw Error('PostgreSQL migration checksum mismatch: ' + name);
      } else {
        if (i === 0 && (await client.query("SELECT 1 FROM pg_tables WHERE schemaname='public' LIMIT 1")).rowCount) {
          throw Error('An untracked schema already exists');
        }
        await client.query(sql);
        await client.query('INSERT INTO pi_migrations.ledger(name,sha256) VALUES($1,$2)',[name,digest]);
        applied.push(name);
      }
    }
    await client.query('COMMIT');
    return applied;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
