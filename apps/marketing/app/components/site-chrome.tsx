import {useEffect,useRef} from 'react';
import {Link,useLocation} from 'react-router';
import {PUBLIC_NAVIGATION} from '../../../../packages/marketing/public-navigation';
export function MarketingHeader({appOrigin=''}:{appOrigin?:string}){
 const {pathname}=useLocation();const mobileMenu=useRef<HTMLDetailsElement>(null);
 const clientHref=appOrigin.replace(/\/$/,'')+'/client';
 useEffect(()=>{if(mobileMenu.current)mobileMenu.current.open=false},[pathname]);
 useEffect(()=>{
  const outside=(event:PointerEvent)=>{const menu=mobileMenu.current;if(menu?.open&&!menu.contains(event.target as Node))menu.open=false};
  const escape=(event:KeyboardEvent)=>{const menu=mobileMenu.current;if(event.key==='Escape'&&menu?.open){menu.open=false;menu.querySelector('summary')?.focus()}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)};
 },[]);
 return <div className="mkt-header-wrap"><div className="site-container"><header className="site-header mkt-site-header">
  <div className="mkt-header-identity">
   <Link className="brand mkt-brand" to="/" aria-label="ProInspect home" aria-current={pathname==='/'?'page':undefined}>ProInspect<span>PROPERTY SERVICES</span></Link>
   <div className="mkt-header-actions"><Link className="button mkt-header-book" to={clientHref}>Sign Up / Sign In</Link></div>
  </div>
  <div className="mkt-header-navigation">
   <nav className="site-links mkt-site-links" aria-label="Primary navigation">{PUBLIC_NAVIGATION.filter(item=>item.href!=='/client').map(item=>
    <Link key={item.href} to={item.href} aria-current={pathname===item.href?'page':undefined}>{item.label}</Link>)}</nav>
   <details className="marketing-menu" ref={mobileMenu}><summary aria-label="Open site menu"><span aria-hidden="true">☰</span><span>Menu</span></summary>
    <nav aria-label="Mobile site navigation">{PUBLIC_NAVIGATION.map(item=><Link key={item.href} to={item.href === "/client" ? clientHref : item.href} aria-current={pathname===item.href?'page':undefined}>{item.label}</Link>)}</nav>
   </details>
  </div>
 </header></div></div>
}
export function MarketingFooter(_props:{appOrigin?:string}={}){
 return <footer className="site-footer mkt-site-footer"><div className="site-container">
  <div className="mkt-footer-top pi-footer-compact">
   <div className="mkt-footer-intro"><Link className="brand inverse" to="/">ProInspect<span>PROPERTY SERVICES</span></Link>
    <p>Providing Innovative Property Inspection and Outsourcing Solutions to Private Landlords and Property Managers across Western Australia.</p>
   </div>
   <nav className="pi-footer-actions" aria-label="Footer navigation">
    <Link to="/help-centre">Help Centre</Link>
    <Link to="/about">About Us</Link>
    <Link to="/contact">Contact Us</Link>
   </nav>
  </div>
  <div className="mkt-footer-bottom pi-footer-legal">
   <span>© {new Date().getFullYear()} ProInspect Property Services Pty Ltd · ABN 52 703 550 609 · ACN 703 550 609</span>
  </div>
 </div></footer>;
}
