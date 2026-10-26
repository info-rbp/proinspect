/**
 * Bounded, deterministic A4 report renderer for the Cloudflare runtime.
 * Uses PDF core fonts with explicit WinAnsi encoding, not lossy ASCII replacement.
 * Unsupported scripts fail before storage/issuance instead of corrupting evidence.
 */
export interface ReportPdfComponent {
 name:string;condition:string;cleanliness:string;commentary:string;photoIds:string[];
 workingStatus?:string;testStatus?:string;testMethod?:string;comparisonStatus?:string;
 comparisonReviewStatus?:string;maintenanceRequired?:boolean;defects?:string[];
}
export interface ReportPdfInput {
 title:string;context:string;version:string;summary:string;
 areas:Array<{name:string;components:ReportPdfComponent[];overviewPhotoIds:string[]}>;
 photos:ReadonlyMap<string,{bytes:Uint8Array;caption:string}>;
}
export class ReportPdfError extends Error {
 readonly code:string;
 constructor(code:string,message:string){super(message);this.code=code;this.name='ReportPdfError';}
}
const enc=new TextEncoder();
const bytes=(s:string)=>enc.encode(s);
// Standard Helvetica advance widths, in thousandths of an em; no font files are embedded.
const widths=[761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,761,278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,761,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500];
const special:Record<number,number>={0x20ac:128,0x201a:130,0x192:131,0x201e:132,0x2026:133,
 0x2020:134,0x2021:135,0x2c6:136,0x2030:137,0x160:138,0x2039:139,0x152:140,0x17d:142,
 0x2018:145,0x2019:146,0x201c:147,0x201d:148,0x2022:149,0x2013:150,0x2014:151,
 0x2dc:152,0x2122:153,0x161:154,0x203a:155,0x153:156,0x17e:158,0x178:159};
function textBytes(value:string):number[]{
 return Array.from(value.normalize('NFC'),ch=>{
  const cp=ch.codePointAt(0)!;
  if(cp>=32&&cp<=126||cp>=160&&cp<=255)return cp;
  if(special[cp])return special[cp];
  throw new ReportPdfError('PDF_TEXT_UNSUPPORTED','This report contains text outside the supported PDF character set. Use a reviewed PDF upload or supported rendering workflow; the report has not been changed.');
 });
}
export function pdfLiteral(value:string):string {
 return textBytes(value).map(b=>b>=127?'\\'+b.toString(8).padStart(3,'0'):[40,41,92].includes(b)?'\\'+String.fromCharCode(b):String.fromCharCode(b)).join('');
}
export function wrapReportText(value:string,maxWidth:number,fontSize=10):string[]{
 if(!Number.isFinite(maxWidth)||maxWidth<fontSize*2)throw new ReportPdfError('PDF_LAYOUT_INVALID','PDF text width is invalid.');
 const lines:string[]=[];
 for(const raw of value.replace(/\r\n?/g,'\n').replace(/[\u2028\u2029]/g,'\n').replace(/\t/g,'    ').split('\n')){
  const chars=Array.from(raw.normalize('NFC'));textBytes(raw);
  if(!chars.length){lines.push('');continue;}
  let start=0;
  while(start<chars.length){
   let end=start,w=0,lastSpace=-1;
   while(end<chars.length){const next=widths[textBytes(chars[end])[0]]/1000*fontSize;
    if(w+next>maxWidth)break;w+=next;if(chars[end]===' ')lastSpace=end;end++;}
   if(end===start)end++;
   let stop=end<chars.length&&lastSpace>start?lastSpace:end;
   lines.push(chars.slice(start,stop).join('').trimEnd());start=stop;
   while(chars[start]===' ')start++;
  }
 }
 return lines;
}
function concat(parts:Uint8Array[]):Uint8Array {
 const size=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(size);let offset=0;
 for(const p of parts){out.set(p,offset);offset+=p.length;}return out;
}
function jpgSize(b:Uint8Array):{w:number;h:number;gray:boolean}{
 if(b[0]!==255||b[1]!==216||b[2]!==255)throw new ReportPdfError('PDF_JPEG_INVALID','Evidence is not a valid JPEG.');
 let i=2;
 while(i<b.length-12){
  if(b[i]!==255){i++;continue;}
  const tag=b[i+1];if(tag===0xD9||tag===0xDA)break;
  if(tag===0x01||(tag>=0xD0&&tag<=0xD7)){i+=2;continue;}
  const len=(b[i+2]<<8)|b[i+3];if(len<2||i+len+2>b.length)break;
  if([0xC0,0xC1,0xC2].includes(tag)&&len>=8&&b[i+4]===8){
   const h=(b[i+5]<<8)|b[i+6],w=(b[i+7]<<8)|b[i+8],components=b[i+9];
   if(w>0&&h>0&&w<=16000&&h<=16000&&[1,3].includes(components))return {w,h,gray:components===1};break;
  }
  i+=len+2;
 }
 throw new ReportPdfError('PDF_JPEG_UNSUPPORTED','JPEG dimensions or colour space are unsupported.');
}
interface Line {text:string;size:number;bold:boolean;gap:number;}
export async function renderReportPdf(input:ReportPdfInput):Promise<Uint8Array>{
 const objects:Uint8Array[]=[];
 const reserve=()=>{objects.push(new Uint8Array());return objects.length;};
 const set=(id:number,data:Uint8Array|string)=>{objects[id-1]=typeof data==='string'?bytes(data):data;};
 const cat=reserve(),pagesRef=reserve(),font=reserve(),bold=reserve();
 set(font,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
 set(bold,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
 const width=595.28,height=841.89,margin=42,available=width-margin*2;
 const specs:Array<{body:string;imageId?:number}>=[];
 const textBlocks:Line[]=[];
 const write=(text:string,size=10,isBold=false,gap=0)=>{
  // Reserve slightly more width for bold core-font metrics.
  for(const line of wrapReportText(text,available/(isBold?1.15:1),size)){
   textBlocks.push({text:line,size,bold:isBold,gap});gap=0;
   if(textBlocks.length>3000)throw new ReportPdfError('PDF_TEXT_LIMIT','Report exceeds the bounded rendering limit. No content was truncated.');
  }
 };
 write(input.title,18,true);write(input.context,10);write('Immutable version: '+input.version,8);
 write('INSPECTION SUMMARY',11,true,14);write(input.summary||'No summary recorded.');
 for(const area of input.areas){
  write('AREA: '+area.name,12,true,16);
  if(area.overviewPhotoIds.length)write('Area evidence: '+area.overviewPhotoIds.join(', '),9);
  for(const c of area.components){
   write(c.name,11,true,10);write('Condition: '+c.condition+' | Cleanliness: '+c.cleanliness,9);
   if(c.workingStatus)write('Working status: '+c.workingStatus,9);
   if(c.testStatus)write('Test status: '+c.testStatus+(c.testMethod?' | Method: '+c.testMethod:''),9);
   else if(c.testMethod)write('Test method: '+c.testMethod,9);
   if(c.comparisonStatus)write('Comparison: '+c.comparisonStatus+(c.comparisonReviewStatus?' | Review: '+c.comparisonReviewStatus:''),9);
   if(typeof c.maintenanceRequired==='boolean')write('Maintenance required: '+(c.maintenanceRequired?'Yes':'No'),9);
   if(c.commentary)write('Observation: '+c.commentary);
   for(const defect of c.defects??[])write('Defect: '+defect);
   if(c.photoIds.length)write('Evidence: '+c.photoIds.join(', '),9);
  }
 }
 let y=height-54,commands:string[]=[];
 const flush=()=>{if(commands.length)specs.push({body:commands.join('\n')});commands=[];y=height-54;};
 for(const line of textBlocks){
  const reserveNext=line.bold?30:0;
  if(y-line.gap-line.size*1.45-reserveNext<62)flush();
  y-=line.gap;
  commands.push(`BT /${line.bold?'F2':'F1'} ${line.size} Tf ${margin} ${y.toFixed(2)} Td (${pdfLiteral(line.text)}) Tj ET`);
  y-=line.size*1.45;
 }
 flush();
 const used=new Set<string>();let imageBytes=0;
 for(const area of input.areas)for(const photoId of [...area.overviewPhotoIds,...area.components.flatMap(c=>c.photoIds)]){
  if(used.has(photoId))continue;used.add(photoId);
  const photo=input.photos.get(photoId);
  if(!photo)throw new ReportPdfError('PDF_EVIDENCE_MISSING','Approved evidence is unavailable.');
  imageBytes+=photo.bytes.length;
  if(used.size>35||imageBytes>15*1024*1024)throw new ReportPdfError('PDF_IMAGE_LIMIT','Evidence exceeds the bounded rendering limit. Split or optimise the report.');
  const dim=jpgSize(photo.bytes),imageId=reserve(),data=photo.bytes;
  set(imageId,concat([bytes(`<< /Type /XObject /Subtype /Image /Width ${dim.w} /Height ${dim.h} /ColorSpace /${dim.gray?'DeviceGray':'DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode /Length ${data.length} >>\nstream\n`),data,bytes('\nendstream')]));
  const captions=wrapReportText(photo.caption,available,10);
  if(captions.length>12)throw new ReportPdfError('PDF_CAPTION_LIMIT','An evidence caption is too long for the photographic page.');
  const top=height-110-captions.length*14,scale=Math.min(available/dim.w,(top-76)/dim.h),w=dim.w*scale,h=dim.h*scale;
  const body=[`BT /F2 14 Tf ${margin} ${height-54} Td (PHOTOGRAPHIC EVIDENCE ${used.size}) Tj ET`,
   ...captions.map((c,i)=>`BT /F1 10 Tf ${margin} ${height-78-i*14} Td (${pdfLiteral(c)}) Tj ET`),
   `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${((width-w)/2).toFixed(2)} ${(76+(top-76-h)/2).toFixed(2)} cm /Img Do Q`];
  specs.push({body:body.join('\n'),imageId});
 }
 const pageIds:number[]=[];
 for(const [index,spec] of specs.entries()){
  const stream=bytes('0.11 0.15 0.2 rg\n'+spec.body+`\n0.7 G ${margin} 50 m ${width-margin} 50 l S\nBT /F1 8 Tf ${margin} 35 Td (ProInspect | Page ${index+1} of ${specs.length}) Tj ET\n`);
  const content=reserve(),id=reserve();
  set(content,concat([bytes('<< /Length '+stream.length+' >>\nstream\n'),stream,bytes('\nendstream')]));
  set(id,`<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 ${font} 0 R /F2 ${bold} 0 R >> ${spec.imageId?`/XObject << /Img ${spec.imageId} 0 R >>`:''} >> /Contents ${content} 0 R >>`);
  pageIds.push(id);
 }
 set(pagesRef,`<< /Type /Pages /Kids [${pageIds.map(i=>i+' 0 R').join(' ')}] /Count ${pageIds.length} >>`);
 set(cat,`<< /Type /Catalog /Pages ${pagesRef} 0 R >>`);
 const chunks:Uint8Array[]=[bytes('%PDF-1.4\n%ProInspect\n')],offsets=[0];let offset=chunks[0].length;
 for(let i=0;i<objects.length;i++){offsets.push(offset);const chunk=concat([bytes(`${i+1} 0 obj\n`),objects[i],bytes('\nendobj\n')]);chunks.push(chunk);offset+=chunk.length;}
 const xref=offset;
 chunks.push(bytes(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(x=>String(x).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Root ${cat} 0 R /Size ${objects.length+1} >>\nstartxref\n${xref}\n%%EOF\n`));
 return concat(chunks);
}
