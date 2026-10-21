/**
 * ProInspect Open Home Check-In → Google Sheet
 *
 * Standalone Apps Script. Not deployed. Create the Sheet later and set
 * Script Properties before running installOpenHomeTrigger().
 *
 * Properties:
 *   PROINSPECT_API_ORIGIN          e.g. https://proinspect.systems
 *   PROINSPECT_OPEN_HOME_SHEET_ID  target Google Sheet ID (NOT a full URL)
 *   PROINSPECT_OPEN_HOME_API_SECRET same 32+ character secret as the Worker
 *   PROINSPECT_OPEN_HOME_TAB       optional, default "Open Home Check-Ins"
 *
 * This script only synchronizes authorized open home check-in records.
 * It does NOT send rental application data or perform applicant screening.
 */
const OPEN_HOME_HEADERS = [
  'Check-in ID','Arrival (Australia/Perth)','Property','Property ID','Listing ID',
  'Session ID','Session start (Australia/Perth)','Name','Phone','Email',
  'Advance registration','Leasing representative','Consent version','Sync event ID'
];

function proInspectCheckinConfig_(){
  const props=PropertiesService.getScriptProperties();
  const origin=props.getProperty('PROINSPECT_API_ORIGIN')||'';
  const spreadsheetId=props.getProperty('PROINSPECT_OPEN_HOME_SHEET_ID')||'';
  const secret=props.getProperty('PROINSPECT_OPEN_HOME_API_SECRET')||'';
  const tab=props.getProperty('PROINSPECT_OPEN_HOME_TAB')||'Open Home Check-Ins';
  if(!/^https:\/\/[a-z0-9.-]+(?::443)?$/i.test(origin)||!spreadsheetId||secret.length<32){
    throw new Error('Configure the HTTPS Worker origin, spreadsheet ID and 32+ character signing key.');
  }
  return {origin,spreadsheetId,secret,tab};
}
function checkinTab_(config){
  const spreadsheet=SpreadsheetApp.openById(config.spreadsheetId);
  const sheet=spreadsheet.getSheetByName(config.tab)||spreadsheet.insertSheet(config.tab);
  const first=sheet.getRange(1,1,1,OPEN_HOME_HEADERS.length).getValues()[0];
  if(first.every(v=>v==='')){
    sheet.getRange(1,1,1,OPEN_HOME_HEADERS.length).setValues([OPEN_HOME_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,OPEN_HOME_HEADERS.length).setFontWeight('bold').setBackground('#dcecea');
  }else if(JSON.stringify(first)!==JSON.stringify(OPEN_HOME_HEADERS)){
    throw new Error('Spreadsheet column schema mismatch. Do not overwrite an existing tab.');
  }
  return sheet;
}
function requestCheckinSync_(config,method,path,payload){
  const body=payload?JSON.stringify(payload):'';
  const timestamp=String(Math.floor(Date.now()/1000));
  const nonce=Utilities.getUuid().toLowerCase();
  const signatureBytes=Utilities.computeHmacSha256Signature(
    [timestamp,nonce,method,path,body].join('\n'),config.secret);
  const signature=signatureBytes.map(n=>('0'+((n+256)%256).toString(16)).slice(-2)).join('');
  const options={
    method:method.toLowerCase(),
    muteHttpExceptions:true,
    followRedirects:false,
    headers:{
      'X-ProInspect-Timestamp':timestamp,
      'X-ProInspect-Nonce':nonce,
      'X-ProInspect-Signature':signature,
    },
  };
  if(body){options.contentType='application/json';options.payload=body;}
  const response=UrlFetchApp.fetch(config.origin+path,options);
  const code=response.getResponseCode();
  if(code<200||code>=300){
    // Never log the server's raw body or email details.
    throw new Error('ProInspect sync request failed with HTTP '+code+'.');
  }
  return JSON.parse(response.getContentText());
}
function safeSheetCell_(value){
  const input=String(value==null?'':value);
  // Prevent formula injection, including leading whitespace before an operator.
  return /^[\s]*[=+\-@]/.test(input)?"'"+input:input;
}
/**
 * A retry is safe: if the row exists but acknowledgement failed, the existing
 * row's number is returned to the Worker rather than appended a second time.
 */
function writeCheckinRow_(sheet,item,known){
  if(known.has(item.eventId))return known.get(item.eventId);
  if(!Array.isArray(item.values)||item.values.length!==OPEN_HOME_HEADERS.length||
    item.values[OPEN_HOME_HEADERS.length-1]!==item.eventId){
    throw new Error('Unexpected ProInspect attendance payload schema.');
  }
  const next=Math.max(sheet.getLastRow()+1,2);
  const row=item.values.map(safeSheetCell_);
  // Format text first so leading plus signs in phone numbers remain strings.
  const cells=sheet.getRange(next,1,1,OPEN_HOME_HEADERS.length);
  cells.setNumberFormat('@');
  cells.setValues([row]);
  SpreadsheetApp.flush();
  known.set(item.eventId,next);
  return next;
}
function storedEventIds_(sheet){
  const known=new Map();
  const last=sheet.getLastRow();
  if(last>=2){
    const values=sheet.getRange(2,OPEN_HOME_HEADERS.length,last-1,1).getDisplayValues();
    values.forEach((v,i)=>{if(v[0])known.set(v[0],i+2);});
  }
  return known;
}
/** The only scheduled sync entrypoint. Requires a Google Workspace account
 * authorised to see all listed visitors and the approved privacy settings.
 */
function synchronizeOpenHomeCheckins(){
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))return;
  try{
    const cfg=proInspectCheckinConfig_();
    const sheet=checkinTab_(cfg);
    const known=storedEventIds_(sheet);
    const result=requestCheckinSync_(cfg,'GET','/api/integrations/open-home-sheet/pending');
    if(result.schemaVersion!=='open-home-sheet-v1'||
       JSON.stringify(result.headers)!==JSON.stringify(OPEN_HOME_HEADERS)){
      throw new Error('The Worker and Sheet schema versions do not match.');
    }
    // One page per execution; subsequent runs receive the next pending batch.
    for(const item of result.rows){
      const rowNumber=writeCheckinRow_(sheet,item,known);
      requestCheckinSync_(cfg,'POST','/api/integrations/open-home-sheet/ack',{
        eventId:item.eventId,rowNumber,
      });
    }
  }finally{lock.releaseLock();}
}
/** Run manually ONCE after creating and securing the target Google Sheet.
 * The Worker integration switch must also be explicitly enabled afterward.
 */
function installOpenHomeTrigger(){
  const cfg=proInspectCheckinConfig_();
  checkinTab_(cfg);
  const existing=ScriptApp.getProjectTriggers().filter(t=>
    t.getHandlerFunction()==='synchronizeOpenHomeCheckins');
  if(!existing.length){
    ScriptApp.newTrigger('synchronizeOpenHomeCheckins').timeBased().everyMinutes(5).create();
  }
}
/** Run manually to pause syncing without deleting any recorded attendance. */
function stopOpenHomeTrigger(){
  ScriptApp.getProjectTriggers().filter(t=>
    t.getHandlerFunction()==='synchronizeOpenHomeCheckins').forEach(t=>ScriptApp.deleteTrigger(t));
}
