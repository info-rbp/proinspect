import {useOutletContext} from 'react-router';
import type {Principal,Workspace,Property,Service} from '../../../../packages/domain/index';
export interface RecordRow {id:string;[key:string]:any}
export interface WorkspaceData {user:Principal;workspace:Workspace;properties:Property[];bookings:RecordRow[];workOrders:RecordRow[];requests:RecordRow[];documents:RecordRow[];tenancies:RecordRow[];inspections:RecordRow[];notifications:RecordRow[];staff:RecordRow[];services:Service[]}
export function useWorkspace(){return useOutletContext<WorkspaceData>();}
export function workspaceApi(kind:string,scopeId:string){return `/api/w/${encodeURIComponent(kind)}/${encodeURIComponent(scopeId)}`;}
