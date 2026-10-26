// Synthetic worksheet only; never reads or saves a child's homework photo.
require('dotenv').config({quiet:true});
const fs=require('fs'),path=require('path'),Module=require('module');
const resolve=Module._resolveFilename;
Module._resolveFilename=function(request,parent,...rest){return resolve.call(this,request.startsWith('@/')?path.join(process.cwd(),'src',request.slice(2)):request,parent,...rest);};
const {getAIService}=require('../src/lib/ai/index.ts');
const {homeworkInstructions,homeworkResultSchema}=require('../src/lib/homework.ts');
const {prisma}=require('../src/lib/prisma.ts');
(async()=>{
 const bytes=fs.readFileSync('data/previews/homework-qa-fixture.png');
 const result=await getAIService('analyze').analyzeImage(bytes.toString('base64'),'image/png','zh',null,'其他','小学五年级',homeworkInstructions);
 const parsed=homeworkResultSchema.parse(JSON.parse(result.questionText.trim().replace(/^```(?:json)?\s*|\s*```$/g,'')));
 const success=parsed.questions.length===2&&parsed.questions[0].judgement==='wrong'&&parsed.questions[1].judgement==='correct';
 fs.writeFileSync('data/previews/homework-qa-result.json',JSON.stringify({success,count:parsed.questions.length,verdicts:parsed.questions.map(q=>({number:q.number,answer:q.answerText,judgement:q.judgement}))},null,2));
 if(!success)process.exitCode=1;
})().catch(()=>{fs.writeFileSync('data/previews/homework-qa-result.json',JSON.stringify({success:false,error:'Configured vision model did not return a valid two-question grading result'}));process.exitCode=1;}).finally(()=>prisma.$disconnect());
