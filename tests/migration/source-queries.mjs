// Validate standalone SQL literals and constant concatenations from real application source.
// Dynamic template branches are exercised separately by route and workflow fixtures.
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

export function sourceQueries() {
  const queries = new Set();
  const files = execFileSync('git',['ls-files','apps/platform/app','apps/platform/worker','packages'],{encoding:'utf8'}).trim().split('\n');
  function literal(node) {
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = literal(node.left), right = literal(node.right);
      if (left !== undefined && right !== undefined) return left + right;
    }
  }
  for (const file of files.filter(path => /\.tsx?$/.test(path))) {
    const source = ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
    function visit(node) {
      const sql = literal(node);
      if (sql !== undefined && /^\s*(?:SELECT|WITH|INSERT|DELETE|UPDATE)\b/i.test(sql)) queries.add(sql);
      ts.forEachChild(node,visit);
    }
    visit(source);
  }
  return JSON.parse(execFileSync('python3',['tests/migration/sqlite-query-oracle.py'],{
    input:JSON.stringify([...queries]), encoding:'utf8', maxBuffer:12*1024*1024}));
}
