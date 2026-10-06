import {handleApi} from '../../apps/platform/worker/api';
import type {Env} from '../../packages/database/types';
export {BookingScheduler} from '../../apps/platform/worker/scheduler';
export default {fetch(request:Request,env:Env,ctx:ExecutionContext){return handleApi(request,env,ctx);}};
