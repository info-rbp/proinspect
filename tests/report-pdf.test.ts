import test from 'node:test';
import assert from 'node:assert/strict';
import {renderReportPdf,pdfLiteral,wrapReportText,ReportPdfError,type ReportPdfInput} from '../packages/report-engine/pdf.ts';
const example=():ReportPdfInput=>({title:'Inspection',context:'Synthetic test only',version:'v_test',summary:'Reviewed summary',areas:[{name:'Entry',overviewPhotoIds:[],components:[{name:'Latch',condition:'fair',cleanliness:'clean',commentary:'Visible damage',workingStatus:'working',testStatus:'tested',testMethod:'Visual check',comparisonStatus:'deteriorated',comparisonReviewStatus:'confirmed',maintenanceRequired:true,defects:['Loose fastener'],photoIds:[]}]}],photos:new Map()});
test('PDF encodes Latin names, punctuation and literal delimiters without loss',()=>{
 assert.equal(pdfLiteral('Caf\u00e9 Jos\u00e9\u2019s \u2014 (door) \\'), 'Caf\\351 Jos\\351\\222s \\227 \\(door\\) \\\\');
 assert.equal(pdfLiteral('Cafe\u0301'),pdfLiteral('Caf\u00e9'));
});
test('unsupported writing systems fail explicitly instead of silently replacing content',async()=>{
 const input=example();input.summary='\u5ba2\u6237';
 await assert.rejects(renderReportPdf(input),(e:unknown)=>e instanceof ReportPdfError&&e.code==='PDF_TEXT_UNSUPPORTED');
});
test('render preserves all reviewed assessment fields and A4 page metadata',async()=>{
 const out=new TextDecoder().decode(await renderReportPdf(example()));
 for(const phrase of ['Working status: working','Test status: tested','Method: Visual check','Comparison: deteriorated','Review: confirmed','Maintenance required: Yes','Defect: Loose fastener','Visible damage'])assert.ok(out.includes(phrase),phrase);
 assert.ok(out.includes('/MediaBox [0 0 595.28 841.89]'));assert.ok(out.includes('/Encoding /WinAnsiEncoding'));assert.ok(out.includes('Page 1 of 1'));
});
test('metric wrapping preserves words, long tokens and paragraph breaks',()=>{
 const source='Wide W words with meaningful observations '.repeat(40);
 const wrapped=wrapReportText(source,250,10);
 assert.equal(wrapped.join(' '),source.trim());
 const token='W'.repeat(300);assert.equal(wrapReportText(token,250).join(''),token);
 assert.deepEqual(wrapReportText('Line one\n\nLine two',250),['Line one','','Line two']);
});
test('large reports paginate without losing tail text and with valid xref offsets',async()=>{
 const input=example();input.areas=Array.from({length:18},(_,i)=>({...input.areas[0],name:'Room '+i,components:[{...input.areas[0].components[0],commentary:'Extensive condition observation. '.repeat(30)+'END-ROOM-'+i}]}));
 const buf=await renderReportPdf(input),out=new TextDecoder().decode(buf);
 assert.ok(out.includes('END-ROOM-17'));assert.ok((out.match(/\/Type \/Page\s/g)||[]).length>2);
 const xref=Number(out.match(/startxref\n(\d+)/)?.[1]);assert.equal(new TextDecoder().decode(buf.slice(xref,xref+4)),'xref');
});
test('missing photographic evidence never produces an apparently complete PDF',async()=>{
 const input=example();input.areas[0].overviewPhotoIds=['photo_missing'];
 await assert.rejects(renderReportPdf(input),(e:unknown)=>e instanceof ReportPdfError&&e.code==='PDF_EVIDENCE_MISSING');
});
