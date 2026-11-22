import {Link,redirect,type LoaderFunctionArgs} from 'react-router';
import {principal} from '../../../../packages/auth/server';
import {platformEnv} from '../../../../packages/database/context';
export const meta=()=>[{title:'Sign Up or Sign In | ProInspect'},{name:'robots',content:'noindex,nofollow'}];
export async function loader({request,context}:LoaderFunctionArgs){const user=await principal(request,platformEnv(context));if(user)throw redirect('/start');return null;}
const paths=[
 {title:'Residential Landlords',description:'Create a free account, add a property you are authorised to manage and explore individual inspections or ongoing property support.',signup:true},
 {title:'Residential Property Managers',description:'Sign in or create an account to explore agency services and the appropriate authorisation process for your portfolio.',signup:true},
 {title:'Tenants and Co-Living Residents',description:'Use your verified identity to access properties and tenancy records to which you have been invited. Registering alone does not grant tenancy access.',signup:false},
 {title:'Existing Commercial and Strata Clients',description:'Continue to access your previously authorised historic workspaces. New Commercial and Strata service acquisition is not offered.',signup:false}
];
export default function ClientEntry(){return <main id="main" className="auth-page pi-entry-page">
 <div className="pi-entry-wrap">
  <div className="pi-entry-intro"><p className="eyebrow">ProInspect Client Portal</p><h1>One secure account. The right workspace for you.</h1>
   <p>Sign up or sign in with your email. Your property, organisation and verified role determine the services and records available to you.</p>
   <p>Account registration is free and does not activate a paid subscription or authorise a recurring payment.</p></div>
  <div className="pi-entry-options">{paths.map(item=><article key={item.title} className="panel pi-entry-card">
   <h2>{item.title}</h2><p>{item.description}</p>
   <div className="pi-entry-card-actions">{item.signup&&<Link className="button" to="/signup">Create a free account</Link>}
    <Link className={item.signup?'button secondary':'button'} to="/signin">Sign in with email</Link></div>
  </article>)}</div>
  <div className="pi-entry-footer"><Link to="/">Return to website</Link><Link to="/help-centre">Help Centre</Link></div>
 </div>
</main>}