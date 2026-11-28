// Temporary deployment connectivity check. Never binds to live application resources.
export default {
  fetch() {
    return new Response('ProInspect Rebuild\nGitHub branch: proinspect-rebuild\nDeployment bootstrap only. Application and database are not yet configured.\n', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' }
    });
  },
};
