import { Link } from 'react-router';
export const meta = () => [{ title: 'Payment status | ProInspect' }, { name: 'robots', content: 'noindex,nofollow' }];
export default function GuestCheckoutResult() {
  return <div className="section"><div className="site-container"><section className="panel form-width stack">
    <h1>Secure payment checkout</h1>
    <p>Return to your private booking link from the ProInspect email to check your payment status. A checkout return does not confirm that payment has settled.</p>
    <p>For questions about an outstanding payment, contact ProInspect.</p>
    <Link className="button" to="/contact">Contact ProInspect</Link>
  </section></div></div>;
}