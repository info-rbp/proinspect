/**
 * Google Apps Script receiver for ProInspect Rental Application Handoffs.
 * Deploy under a dedicated Workspace sender AFTER legal/privacy approval.
 * Script Properties: PROINSPECT_HANDOFF_SECRET (>=32 chars),
 * PROINSPECT_ALLOWED_RECIPIENTS (comma separated, exact emails).
 * Runtime API has no reliable custom request headers: signed envelope is in POST body.
 * Sensitive application answers are sent only to verified recipients. Never log payloads.
 */
function doPost(e) {
  try {
    const raw=String(e?.postData?.contents||'');
    if(raw.length>380000)throw Error('SIZE_LIMIT');
    const envelope=JSON.parse(raw);
    const stamp=String(envelope.timestamp||'');
    const data=String(envelope.data||'');
    const signature=String(envelope.signature||'');
    const secret=PropertiesService.getScriptProperties().getProperty('PROINSPECT_HANDOFF_SECRET')||'';
    if(secret.length<32||!/^[0-9]{10}$/.test(stamp)||Math.abs(Date.now()-Number(stamp)*1000)>300000)throw Error('AUTH_FAILED');
    const bytes=Utilities.computeHmacSha256Signature(stamp+'.'+data,secret);
    const expected='sha256='+bytes.map(b=>('0'+(b<0?b+256:b).toString(16)).slice(-2)).join('');
    if(!constantTimeEqual(signature,expected))throw Error('AUTH_FAILED');
    const payload=JSON.parse(data);
    if(payload.contractVersion!=='proinspect-rental-email-v1'||!/^rental-email-v1:/.test(payload.idempotencyKey||''))throw Error('VERSION');
    const recipient=String(payload.recipient||'').trim().toLowerCase();
    const approved=(PropertiesService.getScriptProperties().getProperty('PROINSPECT_ALLOWED_RECIPIENTS')||'')
      .split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
    if(!approved.includes(recipient)||!recipient.includes('@'))throw Error('RECIPIENT_NOT_ALLOWED');
    const lock=LockService.getScriptLock();
    if(!lock.tryLock(20000))throw Error('BUSY');
    try{
      const props=PropertiesService.getScriptProperties();
      const key='handoff:'+Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,payload.idempotencyKey))
        .slice(0,44);
      const existing=props.getProperty(key);
      if(existing){
        if(existing.startsWith('accepted:'))return reply(acceptedReceipt(secret,payload.idempotencyKey,existing.slice(9)));
        // Unknown outcome after a worker interruption: DO NOT retry blindly.
        throw Error('SEND_OUTCOME_UNKNOWN');
      }
      const ref='pi-'+Utilities.getUuid();
      props.setProperty(key,'sending:'+ref);
      const msg=renderEmail(payload);
      MailApp.sendEmail({to:recipient,subject:'ProInspect residential rental application — '+String(payload.reference||''),
        htmlBody:msg.html,body:msg.text,name:'ProInspect'});
      props.setProperty(key,'accepted:'+ref);
      return reply(acceptedReceipt(secret,payload.idempotencyKey,ref));
    } finally {lock.releaseLock();}
  }catch(error){
    // Apps Script web apps normally reply HTTP 200 even for application errors.
    // The Worker rejects anything without a signed, matching acceptance receipt.
    return reply({accepted:false,code:error instanceof Error?error.message:'HANDOFF_FAILED'});
  }
}
function acceptedReceipt(secret,key,reference){
 const sig=Utilities.computeHmacSha256Signature(key+'.'+reference+'.accepted',secret);
 const hex=sig.map(b=>('0'+(b<0?b+256:b).toString(16)).slice(-2)).join('');
 return {accepted:true,idempotencyKey:key,messageReference:reference,signature:'sha256='+hex};
}
function constantTimeEqual(a,b){
  if(a.length!==b.length)return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function renderEmail(p){
 const title='ProInspect Residential Rental Application';
 const people=(p.applicants||[]).map((person,i)=>{
   const a=person.answers||{};
   let html='<h3>Applicant '+(i+1)+'</h3>';
   let text='\nApplicant '+(i+1)+'\n';
   for(const category of ['identity','rental','employment','references']){
     html+='<h4>'+esc(category)+'</h4><dl>';
     text+=category+'\n';
     for(const [k,v] of Object.entries(a[category]||{})){
       // Confidential credential values must never be entered into application fields.
       if(/password|token|bank.account|id.number|passport.number/i.test(k))continue;
       html+='<dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd>';
       text+=k+': '+String(v)+'\n';
     }
     html+='</dl>';
   }
   return {html,text};
 });
 const header='<h2>'+esc(title)+'</h2><p>Reference: '+esc(p.reference)+'</p><p>Property: '+esc(p.property)+'</p>';
 const docs='<p>Supporting documents are available only within the restricted ProInspect Staff application workflow. They are not attached to this email.</p>';
 const footer='<p>ProInspect administers applications on behalf of the nominated landlord/agency. The responsible representative alone makes leasing decisions. This email is not a tenancy offer.</p>';
 return {html:header+people.map(x=>x.html).join('')+docs+footer,
 text:title+'\nReference: '+p.reference+'\nProperty: '+p.property+'\n'+people.map(x=>x.text).join('\n')+
 '\nSupporting documents remain restricted to the approved ProInspect workflow.\n'};
}
function reply(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
