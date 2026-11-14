import type { Principal, Workspace, Property, Service } from '../domain/index';
import type { ClientArea } from '../domain/client-navigation';
export interface SessionContract { user: Principal; workspaces: Workspace[] }
export interface ClientServiceInterestsContract { ready: boolean; areas: ClientArea[] }
export interface ClientWorkspaceContract {
 user: Principal;
 workspace: Workspace;
 properties: Property[];
 services: Service[];
 serviceInterests?: ClientServiceInterestsContract;
}
export interface PlatformApiContract {
 getSession(): Promise<SessionContract>;
 getClientWorkspace(kind: string, scopeId: string): Promise<ClientWorkspaceContract>;
 getClientServiceInterests(clientId: string): Promise<ClientServiceInterestsContract>;
}
