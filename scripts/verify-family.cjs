const assert=require('node:assert/strict');
const {prisma}=require('../src/lib/prisma.ts');
const {ownedLearner}=require('../src/lib/family.ts');
const {createBackup,restoreBackup}=require('../src/lib/complete-backup.ts');
if(!process.env.DATABASE_URL?.includes('upgrade-verification'))throw new Error('Refusing non-disposable database');
(async()=>{
 const suffix=Date.now();const parent=await prisma.user.create({data:{email:`family-${suffix}@localhost`,password:'test-only'}});const outsider=await prisma.user.create({data:{email:`other-${suffix}@localhost`,password:'test-only'}});
 const first=await prisma.user.create({data:{parentUserId:parent.id,email:`learner-first-${suffix}@localhost`,password:'test-only',currentGrade:5,name:'孩子甲'}});const second=await prisma.user.create({data:{parentUserId:parent.id,email:`learner-second-${suffix}@localhost`,password:'test-only',currentGrade:2,name:'孩子乙'}});
 assert.equal((await ownedLearner(parent.id,first.id)).id,first.id);assert.equal(await ownedLearner(outsider.id,first.id),null);assert.equal(await ownedLearner(first.id,second.id),null);
 await prisma.errorItem.create({data:{userId:first.id,originalImageUrl:'',questionText:'第一身份错题',answerText:'答案',analysis:'解析',favorited:true}});
 const exercise={questionText:'第一身份练习',answerText:'答案',analysis:'解析',subject:'数学',knowledgePoints:[],difficulty:'easy',provenance:{name:'test'}};
 await prisma.learningSet.create({data:{userId:first.id,selectionKey:'fixture',source:'ai',title:'甲练习',questions:JSON.stringify([exercise])}});
 await prisma.homeworkReview.create({data:{userId:first.id,image:'data:image/jpeg;base64,AA==',questions:JSON.stringify([{number:'1',subject:'数学',questionText:'1+1=?',studentAnswer:'3',answerText:'2',analysis:'相加',judgement:'wrong',knowledgePoints:[]}])}});
 assert.equal(await prisma.errorItem.count({where:{userId:second.id}}),0);assert.equal(await prisma.learningSet.count({where:{userId:second.id}}),0);assert.equal(await prisma.homeworkReview.count({where:{userId:second.id}}),0);
 const backup=await createBackup(first.id);await restoreBackup(backup,first.id);await restoreBackup(backup,first.id);
 assert.equal(await prisma.errorItem.count({where:{userId:first.id}}),1);assert.equal(await prisma.homeworkReview.count({where:{userId:first.id}}),1);
 assert.equal(await prisma.errorItem.count({where:{userId:second.id}}),0);
 console.log('PASS: household ownership, cross-household rejection, isolated errors/exercises/photos, idempotent photo backup');
})().finally(()=>prisma.$disconnect());
