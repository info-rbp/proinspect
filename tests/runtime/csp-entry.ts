import { nonceHtmlScripts } from '../../packages/security/script-nonce';

export default {
  async fetch() {
    const nonce = 'test-nonce-347';
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('<!doctype html><script>window.one=1</script><script nonce="old"'));
        controller.enqueue(encoder.encode(' type="module">window.two=2</script><p>Safe</p><script src="/entry.js"></script>'));
        controller.close();
      },
    });
    const response = new Response(body, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': "script-src 'self' 'nonce-test-nonce-347' https://challenges.cloudflare.com",
      },
    });
    return nonceHtmlScripts(response, nonce);
  },
};
