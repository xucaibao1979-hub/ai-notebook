require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { splitWholePaper, repairInlineQuestion } = require('./library-parser.cjs');
const fs = require('fs/promises');
const path = require('path');
const prisma = new PrismaClient();
(async()=>{
 const papers = await prisma.knowledgePaper.findMany();
 const dir=path.join(process.cwd(),'data/knowledge-library/repairs',new Date().toISOString().replace(/[:.]/g,'-'));
 await fs.mkdir(dir,{recursive:true});
 let split=0, falseFlags=0,changed=0,added=0;
 for(const paper of papers){
  const old=JSON.parse(paper.questions);let questions=old;
  if(old.length===1 && old[0].wholePaper && !old[0].answerHtml && !old[0].locallyReviewed){
   const parts=splitWholePaper(old[0].questionHtml,paper.sourceUrl);
   if(parts.length){ questions=parts.map(q=>({...q,grade:null,gradeBasis:'来源未标注知识年级',knowledgePoints:[]}));split++;added+=parts.length; }
  }
  questions=questions.map(q=>{
   if(q.locallyReviewed)return q;
   const leak=/(?:参考答案|【答案】|故选[:：]|故答案为)|(?:=|为|是|分别是)\s*([^\s，。．]{2,})\s+\1/u.test(q.questionHtml.replace(/<[^>]+>/g,' '));
   if(q.answerLeakRisk && !leak)falseFlags++;
   return repairInlineQuestion({...q,answerLeakRisk:leak});
  });
  const json=JSON.stringify(questions);
  if(json===paper.questions)continue;
  await fs.writeFile(path.join(dir,paper.id+'.json'),JSON.stringify(paper));
  const count=questions.filter(q=>!q.wholePaper).length;
  await prisma.knowledgePaper.updateMany({where:{id:paper.id,questions:paper.questions},data:{questions:json,questionCount:count,answerCount:questions.filter(q=>q.answerHtml).length,status:questions.some(q=>q.wholePaper)?'whole_paper':'unverified'}});
  changed++;
 }
 const report={changed,split,added,falseFlags,backup:dir};
 await fs.writeFile(path.join(dir,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>prisma.$disconnect());
