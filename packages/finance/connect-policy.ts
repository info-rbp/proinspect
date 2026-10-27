import {isSandboxApiKey,STRIPE_SANDBOX_ACCOUNT} from './stripe-sandbox-policy.ts';
/** Sandbox-only landlord onboarding; never a payment-authorisation decision. */
export type ConnectEnvironment={APP_ENV:string;RENT_CONNECT_SANDBOX_ENABLED?:string;STRIPE_SECRET_KEY?:string;STRIPE_ACCOUNT_ID?:string};
export function sandboxConnectEnabled(e:ConnectEnvironment){
 return e.APP_ENV==='staging'&&e.RENT_CONNECT_SANDBOX_ENABLED==='true'&&e.STRIPE_ACCOUNT_ID===STRIPE_SANDBOX_ACCOUNT&&isSandboxApiKey(e.STRIPE_SECRET_KEY);
}
export function eligibleSelfManagedRoute(mode:string|null, route:string|null,kind:string,role:string){
 return mode==='self_managed'&&route==='landlord_connect_candidate'&&kind==='landlord'&&['owner','admin'].includes(role);
}
export function directChargePermission(_e:ConnectEnvironment){return false as const;}
export function connectAccountStatus(chargesEnabled:boolean,payoutsEnabled:boolean,detailsSubmitted:boolean){
 if(!detailsSubmitted)return 'onboarding_required';
 if(!chargesEnabled||!payoutsEnabled)return 'provider_requirements_pending';
 return 'provider_ready_not_approved_for_rent';
}
