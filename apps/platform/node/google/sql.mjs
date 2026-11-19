// Translate the SQL dialect actually used by the platform. Literals, comments and bind
// parameters are separate tokens. No application value is interpolated into query text.
const tokenPattern = /'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|\s+|[A-Za-z_]\w*|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\|\||<>|!=|<=|>=|==|./gs;
const isWord = (value) => /^[A-Za-z_]\w*$/.test(value ?? '');
function functionArgs(tokens, open) {
  let depth = 0;
  const argumentsAt = [];
  for (let i = open + 1; i < tokens.length; i++) {
    if (tokens[i] === '(') depth++;
    else if (tokens[i] === ')' && depth-- === 0) return argumentsAt;
    else if (tokens[i] === ',' && depth === 0) argumentsAt.push(i);
  }
  throw Error('Unclosed SQL function');
}

// SQLite sorts NULLs first in ascending order and last in descending order. PostgreSQL
// defaults to the inverse. Keep explicit source ordering and complete only omitted defaults.
function preserveNullOrdering(tokens) {
  const before = new Map();
  for (let start=0; start<tokens.length; start++) {
    if (tokens[start].toUpperCase() !== 'ORDER' || tokens[start+1]?.toUpperCase() !== 'BY') continue;
    let depth=0;
    for (let i=start+2; i<=tokens.length; i++) {
      const word=tokens[i]?.toUpperCase();
      const end=!word || [')','LIMIT','OFFSET','UNION','INTERSECT','EXCEPT','ROWS','RANGE','GROUPS','RETURNING'].includes(word);
      if (depth===0 && (end || word===',')) {
        const last=tokens[i-1]?.toUpperCase();
        if (!['FIRST','LAST'].includes(last)) before.set(i,last==='DESC' ? 'NULLS LAST' : 'NULLS FIRST');
        if (end) break;
      }
      if (word==='(') depth++;
      if (word===')') depth--;
    }
  }
  const result=[];
  for (let i=0; i<=tokens.length; i++) {
    if (before.has(i)) result.push(before.get(i));
    if (i<tokens.length) result.push(tokens[i]);
  }
  return result;
}

export function postgresQuery(sql, values = [], previousChanges) {
  let tokens = (sql.match(tokenPattern) ?? []).filter(token => !/^(?:\s|--|\/\*)/.test(token));
  if (tokens.at(-1) === ';') tokens.pop();
  if (tokens.includes(';') || !['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'WITH'].includes(tokens[0]?.toUpperCase())) {
    throw Error('Application query must contain one supported statement');
  }
  tokens = preserveNullOrdering(tokens);
  const word = i => tokens[i]?.toUpperCase();
  const binds = [];
  const output = [];
  const ignore = word(0) === 'INSERT' && word(1) === 'OR' && word(2) === 'IGNORE';
  const target = word(0) === 'INSERT' ? tokens[tokens.findIndex(t => t.toUpperCase() === 'INTO') + 1] : null;
  let inUpsert = false, nextValue = 0, addedConflict = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i], k = word(i);
    if (ignore && (i === 1 || i === 2)) continue;
    if (ignore && k === 'RETURNING') { output.push('ON CONFLICT DO NOTHING'); addedConflict = true; }
    if (k === 'UPDATE' && word(i - 1) === 'DO') inUpsert = true;
    if (k === 'RETURNING') inUpsert = false;
    if (t === '?') {
      const value = values[nextValue++];
      if (value === undefined) throw Error('Missing PostgreSQL bind value');
      binds.push(value);
      let marker = '$' + binds.length;
      // Standalone NULL tests provide PostgreSQL no type context.
      if (word(i + 1) === 'IS' && ['NULL', 'NOT'].includes(word(i + 2))) marker += '::text';
      if (word(i + 1) === 'COLLATE' && word(i + 2) === 'NOCASE') { marker += '::public.citext'; i += 2; }
      output.push(marker);
    } else if (k === 'CHANGES' && tokens[i + 1] === '(' && tokens[i + 2] === ')') {
      if (!Number.isInteger(previousChanges)) throw Error('changes() needs a preceding write in the same batch');
      binds.push(previousChanges);
      output.push('$' + binds.length + '::bigint');
      i += 2;
    } else if (k === 'IS' && word(i + 1) === 'NOT' && word(i + 2) !== 'NULL') {
      output.push('IS DISTINCT FROM'); i++;
    } else if (k === 'IS' && !['NOT','NULL','TRUE','FALSE'].includes(word(i + 1))) {
      output.push('IS NOT DISTINCT FROM');
    } else if (['MIN','MAX'].includes(k) && tokens[i + 1] === '(' && functionArgs(tokens, i + 1).length === 1) {
      output.push('pi_compat.scalar_' + k.toLowerCase());
    } else if (['JSON_EACH','JSON_EXTRACT','STRFTIME','JULIANDAY'].includes(k) && tokens[i + 1] === '(') {
      output.push('pi_compat.' + k.toLowerCase());
    } else if (k === 'LIKE') {
      output.push('ILIKE');
    } else if (k === 'INTEGER' && word(i-1) === 'AS') {
      output.push('BIGINT');
    } else if (k === 'INSTR' && tokens[i + 1] === '(') {
      output.push('strpos');
    } else if (['SQLITE_MASTER','SQLITE_SCHEMA'].includes(k) && word(i-1) === 'FROM') {
      output.push("(SELECT tablename AS name, 'table'::text AS type FROM pg_catalog.pg_tables WHERE schemaname='public') AS app_schema");
    } else if (t === '==') {
      output.push('=');
    } else if (word(i - 1) === 'AS' && isWord(t) && /[a-z]/.test(t) && /[A-Z]/.test(t)) {
      output.push('"' + t + '"'); // Keep camelCase result keys used by domain code.
    } else if (inUpsert && ['ATTEMPTS','EXPIRES_AT','VERSION'].includes(k) && tokens[i-1] !== '.' && !['SET', ','].includes(word(i-1))) {
      output.push(target + '.' + t);
    } else if (k === 'CURRENT_TIMESTAMP') {
      output.push("to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')");
    } else {
      output.push(t);
    }
  }
  if (nextValue !== values.length) throw Error('Unexpected PostgreSQL bind value');
  if (ignore && !addedConflict) output.push('ON CONFLICT DO NOTHING');
  return {text: output.join(' '), values: binds};
}
