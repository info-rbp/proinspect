/**
 * React's streamed hydration instructions can include inline scripts outside
 * the nonce-aware React Router <Scripts> component. Apply the same per-request
 * nonce to every script in the streamed HTML response before it reaches the
 * browser, without weakening the production Content Security Policy.
 */
export function nonceHtmlScripts(response: Response, nonce: string): Response {
  return new HTMLRewriter()
    .on('script', {
      element(element) {
        element.setAttribute('nonce', nonce);
      },
    })
    .transform(response);
}
