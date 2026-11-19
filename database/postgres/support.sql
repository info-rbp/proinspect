-- Apply to a fresh UTF-8 database with LC_CTYPE=C so citext matches SQLite's ASCII NOCASE.
DO $$
BEGIN
  IF (SELECT datctype FROM pg_database WHERE datname = current_database()) NOT IN ('C', 'POSIX') THEN
    RAISE EXCEPTION 'PostgreSQL migration requires LC_CTYPE=C for the existing email uniqueness contract';
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;
CREATE SCHEMA pi_compat;
CREATE FUNCTION pi_compat.strftime(fmt text, val text, delta text DEFAULT '0 hours')
RETURNS text LANGUAGE plpgsql STABLE STRICT AS $$
DECLARE
  instant timestamp := ((CASE WHEN val = 'now' THEN statement_timestamp() ELSE val::timestamptz END)
                         AT TIME ZONE 'UTC') + delta::interval;
BEGIN
  CASE fmt
    WHEN '%Y-%m-%dT%H:%M:%fZ' THEN RETURN to_char(instant, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    WHEN '%Y-%m-%d' THEN RETURN to_char(instant, 'YYYY-MM-DD');
    WHEN '%M' THEN RETURN to_char(instant, 'MI');
    WHEN '%H' THEN RETURN to_char(instant, 'HH24');
    WHEN '%s' THEN RETURN floor(extract(epoch FROM instant))::bigint::text;
    WHEN '%w' THEN RETURN extract(dow FROM instant)::integer::text;
    ELSE RAISE EXCEPTION 'Unsupported strftime format %', fmt;
  END CASE;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN NULL;
END $$;
CREATE FUNCTION pi_compat.julianday(val text) RETURNS numeric
LANGUAGE plpgsql STABLE STRICT AS $$
BEGIN
  RETURN extract(epoch FROM val::timestamptz) / 86400 + 2440587.5;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN NULL;
END $$;
-- JSON stays text to preserve exact envelope and signed payload bytes.
CREATE FUNCTION pi_compat.json_length(val text) RETURNS integer
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT CASE WHEN json_typeof(val::json) = 'array' THEN json_array_length(val::json) ELSE 0 END
$$;
-- Serialize nonproduction writers ahead of row/trigger reads, including direct SQL writes.
-- A second statement on a waiting READ COMMITTED connection observes the preceding commit.
CREATE FUNCTION pi_compat.writer_lock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(1701996912, 1);
  RETURN NULL;
END $$;
CREATE FUNCTION pi_compat.json_each(val text) RETURNS TABLE(value text)
LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT json_array_elements_text(val::json) $$;
CREATE FUNCTION pi_compat.json_extract(val text, path text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT val::json #>> string_to_array(substr(path, 3), '.') $$;
CREATE FUNCTION pi_compat.scalar_min(a anycompatible, b anycompatible) RETURNS anycompatible
LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT least(a,b) $$;
CREATE FUNCTION pi_compat.scalar_max(a anycompatible, b anycompatible) RETURNS anycompatible
LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT greatest(a,b) $$;
