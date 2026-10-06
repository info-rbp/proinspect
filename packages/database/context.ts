import {createContext,type RouterContextProvider} from 'react-router';
import type {Env} from './types';
export const runtimeContext=createContext<{env:unknown;ctx:ExecutionContext;nonce:string}>();
export function platformEnv(context:Readonly<RouterContextProvider>):Env{return context.get(runtimeContext).env as Env;}
