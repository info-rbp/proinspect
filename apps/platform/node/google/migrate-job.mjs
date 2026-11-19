import {connectCloudSql} from './postgres.mjs';
import {applyMigrations} from './migrations.mjs';
const stage = process.env.FOUNDATION_ENV;
if (!['dev','staging'].includes(stage)) throw Error('Only migration environments are allowed');
const database = 'proinspect_' + stage;
const runtime = '"pi-mig-' + stage + '-runtime@proinspect-property-services.iam"';
// The Admin API cannot set PostgreSQL's LC_CTYPE. Create the UTF-8 database from template0.
const admin = await connectCloudSql(stage,'migrate','postgres');
try {
  const c = await admin.pool.connect();
  try {
    await c.query('SELECT pg_advisory_lock(1701996912, 2)');
    const existing = await c.query('SELECT 1 FROM pg_database WHERE datname=$1',[database]);
    if (!existing.rowCount) {
      await c.query('CREATE DATABASE ' + database + " WITH TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'");
    }
    await c.query('REVOKE ALL ON DATABASE ' + database + ' FROM PUBLIC');
    await c.query('GRANT CONNECT ON DATABASE ' + database + ' TO ' + runtime);
  } finally { c.release(true); }
} finally { await admin.close(); }
const connection = await connectCloudSql(stage,'migrate');
try {
  const applied = await applyMigrations(connection.pool);
  await connection.pool.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  await connection.pool.query('GRANT USAGE ON SCHEMA public, pi_compat TO ' + runtime);
  await connection.pool.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ' + runtime);
  await connection.pool.query('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ' + runtime);
  console.info(JSON.stringify({event:'migration.schema.ready',environment:stage,applied}));
} finally { await connection.close(); }
