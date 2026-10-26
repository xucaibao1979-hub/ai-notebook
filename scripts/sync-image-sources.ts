import 'dotenv/config';
import {promises as fs} from 'fs';
import path from 'path';
import {createHash} from 'crypto';
import {PrismaClient} from '@prisma/client';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {parseImagePaper,IMAGE_HOSTS}=require('./image-paper-parser.cjs');
export const IMAGE_SOURCE_SEEDS=[
    {source:'中国教育在线',year:2025,examType:'gaokao',subject:'数学',region:'全国一',title:'2025年高考全国一卷数学 · 完整原卷',url:'https://gaokao.eol.cn/shiti/sx/202506/t20250607_2673303.shtml',answer:'https://gaokao.eol.cn/shiti/sx/202506/t20250608_2673374.shtml'},
    {source:'中国教育在线',year:2025,examType:'gaokao',subject:'数学',region:'全国二',title:'2025年高考全国二卷数学 · 完整原卷',url:'https://gaokao.eol.cn/shiti/sx/202506/t20250608_2673332.shtml',answer:'https://gaokao.eol.cn/shiti/sx/202506/t20250609_2673482.shtml'},
    {source:'高考100',year:2025,examType:'gaokao',subject:'数学',region:'全国一',title:'2025年新高考一卷数学 · 完整原卷',url:'https://www.gk100.com/read_35146695.htm',answer:''},
    {source:'中考网',year:2025,examType:'zhongkao',subject:'数学',region:'贵州省',title:'2025年贵州省中考数学 · 完整原卷',url:'https://m.zhongkao.com/e/20250717/6878bd07b890d.shtml',answer:'https://m.zhongkao.com/e/20250717/6878bf2715eb3.shtml'},
];
type Result={url:string;state:'imported'|'skipped'|'failed';message?:string;pages?:number;answers?:number};
let lastRequest=0;
async function request(url:string){const host=new URL(url).hostname;if(!IMAGE_HOSTS.has(host)&&host!=='www.gk100.com'&&host!=='m.zhongkao.com')throw new Error('来源域名未允许');const delay=Math.max(0,lastRequest+350-Date.now());if(delay)await new Promise(r=>setTimeout(r,delay));lastRequest=Date.now();const response=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'WrongNotebookPersonalStudy/1.0'}});if(!response.ok)throw new Error(`HTTP ${response.status}`);const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>15_000_000)throw new Error('来源文件超过大小限制');return {bytes,type:response.headers.get('content-type')||''};}
async function collect(url:string,kind:'paper'|'answer'){
    const first=await request(url);const decode=(bytes:Buffer)=>new TextDecoder(url.includes('zhongkao.com')?'gb18030':'utf-8').decode(bytes);
    const parsed=parseImagePaper(decode(first.bytes),url,kind) as {paper:string[];answers:string[];pages:string[]};
    const paper=[...parsed.paper],answers=[...parsed.answers];
    for(const page of parsed.pages.slice(1)){const response=await request(page);const next=parseImagePaper(decode(response.bytes),page,kind);if(!next.paper.length&&!next.answers.length)throw new Error('分页没有试卷图片：'+page);paper.push(...next.paper);answers.push(...next.answers);}
    return {paper:[...new Set(paper)],answers:[...new Set(answers)]};
}
async function cacheImage(url:string){const key=createHash('sha256').update(url).digest('hex');const folder=path.resolve('public/knowledge-assets');await fs.mkdir(folder,{recursive:true});const existing=(await fs.readdir(folder)).find(f=>f.startsWith(key+'.'));if(existing)return '/knowledge-assets/'+existing;const response=await request(url);const jpg=response.bytes[0]===0xff&&response.bytes[1]===0xd8;const png=response.bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));const webp=response.bytes.subarray(0,4).toString()==='RIFF'&&response.bytes.subarray(8,12).toString()==='WEBP';if(!jpg&&!png&&!webp)throw new Error('来源未返回可用题图');const filename=key+(jpg?'.jpg':png?'.png':'.webp');await fs.writeFile(path.join(folder,filename),response.bytes);return '/knowledge-assets/'+filename;}
export async function syncImageSources(prisma:PrismaClient,options:{refresh?:boolean;onResult?:(result:Result)=>void|Promise<void>}={}){
    const results:Result[]=[];
    for(const seed of IMAGE_SOURCE_SEEDS){try{
        const previous=await prisma.knowledgePaper.findUnique({where:{sourceUrl:seed.url}});
        if(previous&&!options.refresh){const result:Result={url:seed.url,state:'skipped'};results.push(result);await options.onResult?.(result);continue;}
        const content=await collect(seed.url,'paper');if(seed.answer){const answer=await collect(seed.answer,'answer');content.answers.push(...answer.answers);}
        if(!content.paper.length)throw new Error('没有取得题目原卷，不导入仅答案的页面');
        const images=[];for(const url of content.paper)images.push(await cacheImage(url));
        const answers=[];for(const url of [...new Set(content.answers)])answers.push(await cacheImage(url));
        const html=(urls:string[],kind:string)=>urls.map((src,index)=>`<p>${kind}第 ${index+1} 页</p><img src="${src}" alt="${kind}第 ${index+1} 页" loading="lazy" />`).join('');
        const question={number:'整卷',wholePaper:true,questionHtml:html(images,'原卷'),answerHtml:html(answers,'答案'),grade:null,gradeBasis:'整卷图片，知识年级待逐题确认',knowledgePoints:[]};
        const data={sourceName:seed.source,sourceUrl:seed.url,title:seed.title,year:seed.year,examType:seed.examType,subject:seed.subject,region:seed.region,examGrade:seed.examType==='zhongkao'?9:12,questions:JSON.stringify([question]),questionCount:0,answerCount:0,knowledgeGrades:'[]',status:'image_original',qualityNote:`已取得 ${images.length} 页题目、${answers.length} 页答案，保留整卷图片和公式题图，尚未逐题拆分或与考试机构原卷认证。来源：${seed.source}。`,attachments:JSON.stringify([{label:seed.source+'题目原文',url:seed.url,kind:'paper'},...(seed.answer?[{label:seed.source+'答案原文',url:seed.answer,kind:'answer'}]:[])]),fetchedAt:new Date()};
        if(previous){const reviewed=JSON.parse(previous.questions).some((q:{locallyReviewed?:boolean})=>q.locallyReviewed);if(reviewed)throw new Error('已有人工校对内容，保留原记录，未覆盖');}
        await prisma.knowledgePaper.upsert({where:{sourceUrl:seed.url},create:data,update:data});
        const result:Result={url:seed.url,state:'imported',pages:images.length,answers:answers.length};results.push(result);await options.onResult?.(result);
    }catch(e){const result:Result={url:seed.url,state:'failed',message:e instanceof Error?e.message:'未知错误'};results.push(result);await options.onResult?.(result);}}
    await fs.mkdir(path.resolve('data/knowledge-library/multi-source'),{recursive:true});await fs.writeFile(path.resolve('data/knowledge-library/multi-source/latest-import.json'),JSON.stringify({at:new Date().toISOString(),results},null,2));return results;
}
if(require.main===module){const prisma=new PrismaClient();syncImageSources(prisma,{refresh:process.argv.includes('--refresh'),onResult:r=>{console.log(JSON.stringify(r));}}).finally(()=>prisma.$disconnect());}
