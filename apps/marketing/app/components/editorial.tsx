import { Link } from 'react-router';
import { BrandImage, type BrandImageKey } from './brand-image';

export function EditorialHero({
  eyebrow,
  title,
  intro,
  image,
  primary,
  secondary,
  home = false,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  image: BrandImageKey;
  primary?: { label: string; to: string };
  secondary?: { label: string; to: string };
  home?: boolean;
}) {
  return (
    <header className={'pi-editorial-hero' + (home ? ' pi-editorial-hero-home' : '')}>
      <div className="site-container">
        {!home && (
          <nav className="pi-breadcrumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{eyebrow}</span>
          </nav>
        )}
        <div className="pi-editorial-hero-grid">
          <div className="pi-editorial-copy">
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title.includes('\n') ? title.split('\n').map((line, i) => <span key={line}>{i > 0 && <br />}{line}</span>) : title}</h1>
            <p className="pi-editorial-intro">{intro}</p>
            {(primary || secondary) && (
              <div className="actions">
                {primary && (
                  <Link className="button" to={primary.to}>
                    {primary.label}
                    <span aria-hidden="true">→</span>
                  </Link>
                )}
                {secondary && (
                  <Link className="pi-inline-link" to={secondary.to}>
                    {secondary.label}
                    <span aria-hidden="true">↗</span>
                  </Link>
                )}
              </div>
            )}
          </div>
          <div className="pi-editorial-hero-image">
            <BrandImage name={image} priority />
          </div>
        </div>
      </div>
    </header>
  );
}

export function EditorialSteps(){
 const steps: Array<{title:string;copy:string;image:'residential'|'leasing'|'maintenance'}>=[
  {title:'Tell us what you need',copy:'Choose an inspection, maintenance visit or other property task, or tell us the outcome you have in mind.',image:'residential'},
  {title:'Agree the details',copy:'Confirm the authorised contact, service scope, lawful access, price and an available appointment where offered.',image:'maintenance'},
  {title:'Keep a useful record',copy:'Follow the instructed work and review issued documents in your authorised property workspace.',image:'leasing'},
 ];
 return <section className="mkt-section pi-editorial-section pi-neutral"><div className="site-container">
  <div className="pi-section-heading"><p className="eyebrow">A straightforward process</p><h2>Design With You In Mind.</h2></div>
  <ol className="pi-process-list pi-process-illustrated">{steps.map((item,i)=><li key={item.title}>
   <BrandImage name={item.image}/><span className="pi-step-number">0{i+1}</span><h3>{item.title}</h3><p>{item.copy}</p></li>)}</ol>
 </div></section>;
}
