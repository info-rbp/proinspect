export const PERTH_UTC_OFFSET_HOURS=8;

/**
 * Perth is UTC+08:00 year round (no daylight-saving adjustments).
 * The reporting day is determined by the session END in Perth, not UTC.
 */
export function perthDay(iso:string|number):string {
 const ms=typeof iso==='number'?iso:Date.parse(iso);
 if(!Number.isFinite(ms))throw new Error('INVALID_REPORT_DATE');
 return new Date(ms+8*3600000).toISOString().slice(0,10);
}
export function previousPerthDayWindow(scheduledTime:number){
 const today=perthDay(scheduledTime);
 const todayUtcMidnight=Date.parse(today+'T00:00:00.000Z');
 return {
  reportDatePerth:perthDay(todayUtcMidnight-24*3600000-8*3600000),
  startUtc:new Date(todayUtcMidnight-32*3600000).toISOString(),
  endUtc:new Date(todayUtcMidnight-8*3600000).toISOString(),
 };
}
export function isPerthNineAm(scheduledTime:number){
 if(!Number.isFinite(scheduledTime))return false;
 const local=new Date(scheduledTime+8*3600000);
 return local.getUTCHours()===9&&local.getUTCMinutes()===0;
}
export function formatPerthReportTime(value:string){
 const time=Date.parse(value);
 if(!Number.isFinite(time))throw new Error('INVALID_REPORT_TIME');
 return new Date(time).toLocaleString('en-AU',{
  timeZone:'Australia/Perth',weekday:'long',day:'numeric',month:'long',
  year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short',
 });
}
