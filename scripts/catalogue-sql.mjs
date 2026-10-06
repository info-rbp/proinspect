import {SERVICE_SEEDS} from '../packages/service-catalogue/index.ts';
import {mkdirSync,writeFileSync} from 'node:fs';
const quote=value=>value===null?'NULL':typeof value==='number'?String(value):`'${String(value).replaceAll("'","''")}'`;
export function catalogueSql(){return SERVICE_SEEDS.map(s=>`INSERT INTO services(id,name,family,sectors_json,summary,duration_minutes,buffer_before,buffer_after,notice_hours,horizon_days,price_ex_gst_cents,booking_mode,active) VALUES(${[s.id,s.name,s.family,JSON.stringify(s.sectors),s.summary,s.duration_minutes,s.buffer_before,s.buffer_after,s.notice_hours,s.horizon_days,null,'request',1].map(quote).join(',')}) ON CONFLICT(id) DO NOTHING;`).join('\n');}
if(process.argv[1]?.endsWith('catalogue-sql.mjs')){mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/catalogue.sql',catalogueSql());console.log('Wrote catalogue SQL. Existing service configuration will not be overwritten.');}
