import {useEffect,useRef} from 'react';
import {Link,useLocation} from 'react-router';
import {PUBLIC_NAVIGATION} from '../../../../packages/marketing/public-navigation';
export function MarketingHeader({appOrigin=''}:{appOrigin?:string}){
 const {pathname}=useLocation();const mobileMenu=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{if(mobileMenu.current)mobileMenu.current.open=false},[pathname]);
 useEffect(()=>{
  const outside=(event:PointerEvent)=>{const menu=mobileMenu.current;if(menu?.open&&!menu.contains(event.target as Node))menu.open=false};
  const escape=(event:KeyboardEvent)=>{const menu=mobileMenu.current;if(event.key==='Escape'&&menu?.open){menu.open=false;menu.querySelector('summary')?.focus()}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)};
 },[]);
 return <div className="mkt-header-wrap"><div className="site-container"><header className="site-header mkt-site-header">
  <Link className="brand mkt-brand" to="/" aria-label="ProInspect home" aria-current={pathname==='/'?'page':undefined}>ProInspect<span>PROPERTY SERVICES</span></Link>
  <nav className="site-links mkt-site-links" aria-label="Primary navigation">{PUBLIC_NAVIGATION.filter(item=>item.href!=='/client').map(item=>
   <Link key={item.href} to={item.href} aria-current={pathname===item.href?'page':undefined}>{item.label}</Link>)}</nav>
  <div className="mkt-header-actions"><Link className="button mkt-header-book" to="/client">Sign Up / Sign In</Link></div>
  <details className="marketing-menu" ref={mobileMenu}><summary aria-label="Open site menu"><span aria-hidden="true">☰</span><span>Menu</span></summary>
   <nav aria-label="Mobile site navigation">{PUBLIC_NAVIGATION.map(item=><Link key={item.href} to={item.href} aria-current={pathname===item.href?'page':undefined}>{item.label}</Link>)}</nav>
  </details>
 </header></div></div>
}
export function MarketingFooter({appOrigin=''}:{appOrigin?:string}){
 return <footer className="site-footer mkt-site-footer"><div className="site-container">
  <div className="mkt-footer-top pi-footer-compact">
   <div className="mkt-footer-intro"><Link className="brand inverse" to="/">ProInspect<span>PROPERTY SERVICES</span></Link>
    <p>Providing Innovative Property Inspection and Outsourcing Solutions to Private Landlords and Property Managers across Western Australia.</p>
   </div>
   <div className="pi-footer-actions"><Link className="mkt-footer-contact" to="/contact">Contact ProInspect <span aria-hidden="true">↗</span></Link>
    <Link to="/help-centre">Help Centre</Link><Link to="/residential/services">Residential Services</Link>
    <Link to="/client">Sign Up / Sign In</Link></div>
  </div>
  <div className="mkt-footer-bottom pi-footer-legal">
   <span>© {new Date().getFullYear()} ProInspect Property Services Pty Ltd · ABN 52 703 550 609 · ACN 703 550 609</span>
   <nav aria-label="Legal and policy links"><Link to="/privacy">Privacy</Link><Link to="/website-terms">Website Terms</Link>
    <Link to="/platform-terms">Platform Terms</Link><Link to="/terms">Service Terms</Link><Link to="/booking-policy">Bookings &amp; Refunds</Link>
    <Link to="/service-scopes">Service Scopes</Link><Link to="/subscription-terms">Plans</Link></nav>
  </div>
 </div></footer>;
}
