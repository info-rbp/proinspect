import {redirect,type ActionFunctionArgs} from 'react-router';
import {signOut} from '../../../../packages/auth/server';
import {platformEnv} from '../../../../packages/database/context';
export async function action({request,context}:ActionFunctionArgs){return redirect('/signin',{headers:{'Set-Cookie':await signOut(request,platformEnv(context))}});}
export function loader(){return redirect('/workspaces');}
