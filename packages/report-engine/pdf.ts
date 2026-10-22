/**
 * Bounded Cloudflare-compatible PDF 1.4 renderer.
 * Text and approved JPEG evidence are included in the issued artifact.
 * No network fonts, cloud credentials, or browser rendering are required.
 * This is an initial deterministic renderer; visual/pagination acceptance remains a release gate.
 */
export interface ReportPdfInput {
 title:string;context:string;version:string;
 summary:string;areas:Array<{name:string;components:Array<{name:string;condition:string;cleanliness:string;commentary:string;photoIds:string[]}>;overviewPhotoIds:string[]}>;
 photos:ReadonlyMap<string,{bytes:Uint8Array;caption:string}>;
}
const enc=new TextEncoder();
const bytes=(s:string)=>enc.encode(s);
const clean=(s:string)=>s.replace(/[^\x20-\x7e]/g,'?').replace(/[\\()]/g,'\\$&').slice(0,700);
function concat(parts:Uint8Array[]):Uint8Array {
 const size=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(size);let offset=0;
 for(const p of parts){out.set(p,offset);offset+=p.length;}return out;
}
function jpgSize(b:Uint8Array):{w:number;h:number;gray:boolean}{
 if(b[0]!==255||b[1]!==216||b[2]!==255)throw new Error('Not a JPEG image.');
 let i=2;
 while(i<b.length-12){
  if(b[i]!==255){i++;continue;}
  const tag=b[i+1];if(tag===0xD9||tag===0xDA)break;
  if(tag===0x01||(tag>=0xD0&&tag<=0xD7)){i+=2;continue;}
  const len=(b[i+2]<<8)|b[i+3];if(len<2||i+len+2>b.length)break;
  if([0xC0,0xC1,0xC2,0xC3].includes(tag)){
   const h=(b[i+5]<<8)|b[i+6],w=(b[i+7]<<8)|b[i+8],components=b[i+9];
   if(w<=0||h<=0||w>16000||h>16000||![1,3].includes(components))break;
   return {w,h,gray:components===1};
  }
  i+=len+2;
 }
 throw new Error('JPEG dimensions or colour space unsupported.');
}
export async function renderReportPdf(input:ReportPdfInput):Promise<Uint8Array>{
 const objects:Uint8Array[]=[];
 const reserve=()=>{objects.push(new Uint8Array());return objects.length;};
 const set=(id:number,data:Uint8Array|string)=>{objects[id-1]=typeof data==='string'?bytes(data):data;};
 const cat=reserve(),pagesRef=reserve(),font=reserve();set(font,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
 const pageIds:number[]=[];
 const page=(body:string,img?:{id:number,w:number,h:number})=>{
   const stream=bytes(body),content=reserve(),id=reserve();
   set(content,concat([bytes('<< /Length '+stream.length+' >>\nstream\n'),stream,bytes('\nendstream')]));
   set(id,`<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> ${img?`/XObject << /Img ${img.id} 0 R >>`:''} >> /Contents ${content} 0 R >>`);
   pageIds.push(id);
 };
 const textBlocks:string[]=[];
 const write=(text:string)=>{for(const raw of text.split('\n'))for(let i=0;i<raw.length||i===0;i+=94)textBlocks.push(raw.slice(i,i+94));};
 write(input.title);write(input.context);write('Immutable report version: '+input.version);write('Summary: '+input.summary);
 for(const area of input.areas){
  write('');write('AREA: '+area.name);
  for(const c of area.components){
    write(c.name+' | Condition: '+c.condition+' | Cleanliness: '+c.cleanliness);
    if(c.commentary)write('Observation: '+c.commentary);
    if(c.photoIds.length)write('Evidence: '+c.photoIds.join(', '));
  }
 }
 if(textBlocks.length>3000)throw new Error('Report is too long to render safely.');
 for(let i=0;i<textBlocks.length;i+=48){
  const lines=textBlocks.slice(i,i+48),commands=['0.11 0.15 0.2 rg'];
  for(let j=0;j<lines.length;j++)commands.push(`BT /F1 9 Tf 42 ${752-j*14} Td (${clean(lines[j])}) Tj ET`);
  commands.push(`BT /F1 8 Tf 42 42 Td (ProInspect - page ${pageIds.length+1}) Tj ET`);
  page(commands.join('\n')+'\n');
 }
 const used=new Set<string>();
 for(const area of input.areas){
  for(const photoId of [...area.overviewPhotoIds,...area.components.flatMap(c=>c.photoIds)]){
    if(used.has(photoId))continue;used.add(photoId);
    const photo=input.photos.get(photoId);
    if(!photo)throw new Error('Approved evidence missing: '+photoId);
    if(used.size>35)throw new Error('Too many evidence images for a single render.');
    const dim=jpgSize(photo.bytes);
    const imageId=reserve(),data=photo.bytes;
    set(imageId,concat([bytes(`<< /Type /XObject /Subtype /Image /Width ${dim.w} /Height ${dim.h} /ColorSpace /${dim.gray?'DeviceGray':'DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode /Length ${data.length} >>\nstream\n`),data,bytes('\nendstream')]));
    const scale=Math.min(520/dim.w,620/dim.h),w=Number((dim.w*scale).toFixed(2)),h=Number((dim.h*scale).toFixed(2));
    const x=(612-w)/2,y=Math.max(66,(792-h)/2);
    page(`BT /F1 11 Tf 40 749 Td (${clean(photo.caption)}) Tj ET\nq ${w} 0 0 ${h} ${x} ${y} cm /Img Do Q\n`,{id:imageId,w:dim.w,h:dim.h});
  }
 }
 if(!pageIds.length)page('BT /F1 12 Tf 50 720 Td (Empty Report) Tj ET\n');
 set(pagesRef,`<< /Type /Pages /Kids [${pageIds.map(i=>i+' 0 R').join(' ')}] /Count ${pageIds.length} >>`);
 set(cat,`<< /Type /Catalog /Pages ${pagesRef} 0 R >>`);
 const chunks:Uint8Array[]=[bytes('%PDF-1.4\n%\x80\x80\x80\x80\n')], offsets=[0];let offset=chunks[0].length;
 for(let i=0;i<objects.length;i++){
   offsets.push(offset);
   const chunk=concat([bytes(`${i+1} 0 obj\n`),objects[i],bytes('\nendobj\n')]);
   chunks.push(chunk);offset+=chunk.length;
 }
 const xref=offset;
 chunks.push(bytes(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(x=>String(x).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Root ${cat} 0 R /Size ${objects.length+1} >>\nstartxref\n${xref}\n%%EOF\n`));
 return concat(chunks);
}
