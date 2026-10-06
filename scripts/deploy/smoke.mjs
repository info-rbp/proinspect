import { readFileSync, writeFileSync } from 'node:fs';
const path = 'artifacts/staging-deployment.json';
const receipt = JSON.parse(readFileSync(path, 'utf8'));
if (receipt.environment !== 'staging') throw new Error('Smoke test is restricted to staging.');
for (const [name, origin] of [['platform', receipt.appOrigin], ['marketing', receipt.marketingOrigin]]) {
  let valid = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      valid = response.ok && result.environment === 'staging' && result.application === name && result.source === receipt.sourceSha;
      if (valid) break;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  if (!valid) throw new Error(`${name} staging health check did not match the accepted source.`);
  const page = await fetch(origin, { signal: AbortSignal.timeout(15000) });
  if (!page.ok || !page.headers.get('X-Robots-Tag')?.includes('noindex')) throw new Error(`${name} staging page or noindex check failed.`);
}
const catalogue = await fetch(`${receipt.appOrigin}/api/catalogue`, { signal: AbortSignal.timeout(15000) });
const data = await catalogue.json();
if (!catalogue.ok || !Array.isArray(data.services) || !data.services.length) throw new Error('Staging database/catalogue check failed.');
receipt.deployed = true;
receipt.smokePassedAt = new Date().toISOString();
receipt.productionAccepted = false;
writeFileSync(path, JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt));
