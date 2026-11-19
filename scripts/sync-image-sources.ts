import 'dotenv/config';
import {promises as fs} from 'fs';
import path from 'path';
import {createHash} from 'crypto';
import {PrismaClient} from '@prisma/client';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {parseImagePaper,IMAGE_HOSTS}=require('./image-paper-parser.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {JSDOM}=require('jsdom');
export const IMAGE_SOURCE_SEEDS=[
    {source:'中国教育在线',year:2025,examType:'gaokao',subject:'数学',region:'全国一',title:'2025年高考全国一卷数学 · 完整原卷',url:'https://gaokao.eol.cn/shiti/sx/202506/t20250607_2673303.shtml',answer:'https://gaokao.eol.cn/shiti/sx/202506/t20250608_2673374.shtml'},
    {source:'中国教育在线',year:2025,examType:'gaokao',subject:'数学',region:'全国二',title:'2025年高考全国二卷数学 · 完整原卷',url:'https://gaokao.eol.cn/shiti/sx/202506/t20250608_2673332.shtml',answer:'https://gaokao.eol.cn/shiti/sx/202506/t20250609_2673482.shtml'},
    {source:'高考100',year:2025,examType:'gaokao',subject:'数学',region:'全国一',title:'2025年新高考一卷数学 · 完整原卷',url:'https://www.gk100.com/read_35146695.htm',answer:''},
    {source:'中考网',year:2025,examType:'zhongkao',subject:'数学',region:'贵州省',title:'2025年贵州省中考数学 · 完整原卷',url:'https://m.zhongkao.com/e/20250717/6878bd07b890d.shtml',answer:'https://m.zhongkao.com/e/20250717/6878bf2715eb3.shtml'},
    {source:'中国教育在线',year:2025,examType:'gaokao',subject:'数学',region:'北京',title:'2025年北京卷高考数学 · 完整原卷',url:'https://gaokao.eol.cn/shiti/sx/202506/t20250612_2674359.shtml',answer:''},
    {source:'中国教育在线',year:2025,examType:'gaokao',subject:'数学',region:'天津',title:'2025年天津卷高考数学 · 完整原卷',url:'https://gaokao.eol.cn/shiti/sx/202506/t20250608_2673339.shtml',answer:'https://gaokao.eol.cn/shiti/sx/202506/t20250610_2673772.shtml'},
    {source:'中国教育在线',year:2025,examType:'gaokao',subject:'数学',region:'上海',title:'2025年上海卷高考数学 · 完整原卷',url:'https://gaokao.eol.cn/shiti/sx/202506/t20250608_2673338.shtml',answer:''},
    {source:'中国教育在线',year:2025,examType:'gaokao',subject:'英语',region:'全国一',title:'2025年高考全国一卷英语 · 完整原卷',url:'https://gaokao.eol.cn/shiti/yy/202506/t20250612_2674288.shtml',answer:'https://gaokao.eol.cn/shiti/yy/202506/t20250612_2674296.shtml'},
    {source:'中国教育在线',year:2025,examType:'gaokao',subject:'英语',region:'全国二',title:'2025年高考全国二卷英语 · 完整原卷',url:'https://gaokao.eol.cn/shiti/yy/202506/t20250612_2674278.shtml',answer:'https://gaokao.eol.cn/shiti/yy/202506/t20250612_2674282.shtml'},
    {source:'中国教育在线',year:2025,examType:'gaokao',subject:'物理',region:'辽宁',title:'2025年辽宁卷高考物理 · 完整原卷',url:'https://gaokao.eol.cn/shiti/wl/202506/t20250612_2674294.shtml',answer:'https://gaokao.eol.cn/shiti/wl/202506/t20250612_2674313.shtml'},
    {source:'中国教育在线',year:2025,examType:'gaokao',subject:'化学',region:'上海',title:'2025年上海卷高考化学 · 完整原卷',url:'https://gaokao.eol.cn/shiti/hx/202506/t20250612_2674285.shtml',answer:''},
];
type ImageSeed=(typeof IMAGE_SOURCE_SEEDS)[number];
const DISCOVERY_INDEXES=[
    {url:'https://gaokao.eol.cn/shiti/index_1.shtml',source:'中国教育在线'},
    {url:'https://www.gk100.com/zhenti/list_4002.htm',source:'高考100'},
] as const;
const EOL_SUBJECTS:Record<string,string>={sx:'数学',yw:'语文',yy:'英语',wl:'物理',hx:'化学',sw:'生物',ls:'历史',dl:'地理',zz:'政治'};

export function parseDiscoveredSeeds(html:string,indexUrl:string):ImageSeed[]{
    const index=DISCOVERY_INDEXES.find(item=>item.url===indexUrl);
    if(!index)return [];
    const document=new JSDOM(html,{url:indexUrl}).window.document;
    const seeds:ImageSeed[]=[];
    const keys=new Set<string>();
    for(const anchor of document.querySelectorAll('a[href]')){
        const title=(anchor.textContent||'').replace(/\s+/g,' ').trim();
        const year=Number(title.match(/20(?:25|26)/)?.[0]);
        if(!year||!/高考/.test(title)||!/试题|真题|试卷/.test(title)||/模拟|汇总|收集中|试卷结构|试卷分析/.test(title))continue;
        let url:string;
        try{url=new URL(anchor.getAttribute('href')||'',indexUrl).href;}catch{continue;}
        let subject='数学';
        if(index.source==='中国教育在线'){
            const match=/^https:\/\/gaokao\.eol\.cn\/shiti\/([a-z]{2})\/20\d{4}\/t\d+_\d+\.shtml$/.exec(url);
            if(!match||!EOL_SUBJECTS[match[1]])continue;
            subject=EOL_SUBJECTS[match[1]];
        }else if(!/^https:\/\/www\.gk100\.com\/read_\d+\.htm$/.test(url)||!/数学/.test(title))continue;
        const regionMatch=title.match(/全国(?:新高考)?[ⅠⅡI一二12]|(?:新高考)?全国[ⅠⅡI一二12]|北京|天津|上海|辽宁|吉林|黑龙江|云南|四川|贵州|广东|浙江|山东|江苏|河南|河北|重庆|湖南|湖北|福建|江西|安徽|广西|陕西|山西|海南|甘肃|内蒙古|新疆|宁夏|青海|西藏/);
        if(!regionMatch)continue;
        const region=regionMatch[0].replace(/(?:新高考)?全国|全国(?:新高考)?/,'全国').replace(/[ⅠI1]/,'一').replace(/[Ⅱ2]/,'二');
        const key=`${index.source}:${year}:${subject}:${region}`;
        if(keys.has(key))continue;
        keys.add(key);
        seeds.push({source:index.source,year,examType:'gaokao',subject,region,title:title+' · 完整原卷',url,answer:''});
    }
    document.defaultView?.close();
    return seeds.slice(0,40);
}

export async function discoverImageSources(){
    const seeds=[...IMAGE_SOURCE_SEEDS];
    const seen=new Set(seeds.map(seed=>seed.url));
    const errors:{url:string;message:string}[]=[];
    for(const index of DISCOVERY_INDEXES){
        try{
            const response=await fetch(index.url,{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'WrongNotebookPersonalStudy/1.0'}});
            if(!response.ok)throw new Error(`HTTP ${response.status}`);
            const html=await response.text();
            if(html.length>3_000_000)throw new Error('目录页超过大小限制');
            for(const seed of parseDiscoveredSeeds(html,index.url))if(!seen.has(seed.url)){seen.add(seed.url);seeds.push(seed);}
        }catch(error){errors.push({url:index.url,message:error instanceof Error?error.message:'目录读取失败'});}
    }
    return {seeds,errors,indexCount:DISCOVERY_INDEXES.length,newCandidates:seeds.length-IMAGE_SOURCE_SEEDS.length};
}
type Result={url:string;state:'imported'|'skipped'|'failed';message?:string;pages?:number;answers?:number};
export async function cacheAvailableAnswers(urls:string[], cache:(url:string)=>Promise<string>){
    const saved:string[]=[];let missing=0;
    for(const url of [...new Set(urls)]){
        try { saved.push(await cache(url)); }
        catch(error) { if(error instanceof Error && /HTTP 404\b/.test(error.message)) missing++; else throw error; }
    }
    return {saved,missing};
}
let lastRequest=0;
async function request(url:string){const host=new URL(url).hostname;if(!IMAGE_HOSTS.has(host)&&host!=='www.gk100.com'&&host!=='m.zhongkao.com')throw new Error('来源域名未允许');const delay=Math.max(0,lastRequest+3000-Date.now());if(delay)await new Promise(r=>setTimeout(r,delay));lastRequest=Date.now();const response=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'WrongNotebookPersonalStudy/1.0'}});if(!response.ok)throw new Error(`HTTP ${response.status}`);const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>15_000_000)throw new Error('来源文件超过大小限制');return {bytes,type:response.headers.get('content-type')||''};}
async function collect(url:string,kind:'paper'|'answer'){
    const first=await request(url);const decode=(bytes:Buffer)=>new TextDecoder(url.includes('zhongkao.com')?'gb18030':'utf-8').decode(bytes);
    const parsed=parseImagePaper(decode(first.bytes),url,kind) as {paper:string[];answers:string[];pages:string[]};
    const paper=[...parsed.paper],answers=[...parsed.answers];
    for(const page of parsed.pages.slice(1)){const response=await request(page);const next=parseImagePaper(decode(response.bytes),page,kind);if(!next.paper.length&&!next.answers.length)throw new Error('分页没有试卷图片：'+page);paper.push(...next.paper);answers.push(...next.answers);}
    return {paper:[...new Set(paper)],answers:[...new Set(answers)]};
}
async function cacheImage(url:string){const key=createHash('sha256').update(url).digest('hex');const folder=path.resolve('public/knowledge-assets');await fs.mkdir(folder,{recursive:true});const existing=(await fs.readdir(folder)).find(f=>f.startsWith(key+'.'));if(existing)return '/knowledge-assets/'+existing;const response=await request(url);const jpg=response.bytes[0]===0xff&&response.bytes[1]===0xd8;const png=response.bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));const webp=response.bytes.subarray(0,4).toString()==='RIFF'&&response.bytes.subarray(8,12).toString()==='WEBP';if(!jpg&&!png&&!webp)throw new Error('来源未返回可用题图');const filename=key+(jpg?'.jpg':png?'.png':'.webp');await fs.writeFile(path.join(folder,filename),response.bytes);return '/knowledge-assets/'+filename;}
export async function syncImageSources(prisma:PrismaClient,options:{refresh?:boolean;skipUrls?:Set<string>;seeds?:ImageSeed[];shouldStop?:()=>boolean;onResult?:(result:Result)=>void|Promise<void>}={}){
    const results:Result[]=[];
    for(const seed of options.seeds||IMAGE_SOURCE_SEEDS){if(options.shouldStop?.())break;if(options.skipUrls?.has(seed.url))continue;try{
        const previous=await prisma.knowledgePaper.findUnique({where:{sourceUrl:seed.url}});
        if(previous&&!options.refresh){const result:Result={url:seed.url,state:'skipped'};results.push(result);await options.onResult?.(result);continue;}
        const content=await collect(seed.url,'paper');if(seed.answer){const answer=await collect(seed.answer,'answer');content.answers.push(...answer.answers);}
        if(!content.paper.length)throw new Error('没有取得题目原卷，不导入仅答案的页面');
        const images=[];for(const url of content.paper)images.push(await cacheImage(url));
        const {saved:answers,missing:missingAnswers}=await cacheAvailableAnswers(content.answers,cacheImage);
        const html=(urls:string[],kind:string)=>urls.map((src,index)=>`<p>${kind}第 ${index+1} 页</p><img src="${src}" alt="${kind}第 ${index+1} 页" loading="lazy" />`).join('');
        const question={number:'整卷',wholePaper:true,questionHtml:html(images,'原卷'),answerHtml:html(answers,'答案'),grade:null,gradeBasis:'整卷图片，知识年级待逐题确认',knowledgePoints:[]};
        const data={sourceName:seed.source,sourceUrl:seed.url,title:seed.title,year:seed.year,examType:seed.examType,subject:seed.subject,region:seed.region,examGrade:seed.examType==='zhongkao'?9:12,questions:JSON.stringify([question]),questionCount:0,answerCount:0,knowledgeGrades:'[]',status:'image_original',qualityNote:`已取得 ${images.length} 页题目、${answers.length} 页答案，保留整卷图片和公式题图。${missingAnswers ? `${missingAnswers} 页答案图片在来源站点返回 404，答案不完整；请对照原站核查。` : ''}尚未逐题拆分或与考试机构原卷认证。来源：${seed.source}。`,attachments:JSON.stringify([{label:seed.source+'题目原文',url:seed.url,kind:'paper'},...(seed.answer?[{label:seed.source+'答案原文',url:seed.answer,kind:'answer'}]:[])]),fetchedAt:new Date()};
        if(previous){const reviewed=JSON.parse(previous.questions).some((q:{locallyReviewed?:boolean})=>q.locallyReviewed);if(reviewed)throw new Error('已有人工校对内容，保留原记录，未覆盖');}
        await prisma.knowledgePaper.upsert({where:{sourceUrl:seed.url},create:data,update:data});
        const result:Result={url:seed.url,state:'imported',pages:images.length,answers:answers.length};results.push(result);await options.onResult?.(result);
    }catch(e){const result:Result={url:seed.url,state:'failed',message:e instanceof Error?e.message:'未知错误'};results.push(result);await options.onResult?.(result);}}
    await fs.mkdir(path.resolve('data/knowledge-library/multi-source'),{recursive:true});await fs.writeFile(path.resolve('data/knowledge-library/multi-source/latest-import.json'),JSON.stringify({at:new Date().toISOString(),results},null,2));return results;
}
if(require.main===module){const prisma=new PrismaClient();syncImageSources(prisma,{refresh:process.argv.includes('--refresh'),onResult:r=>{console.log(JSON.stringify(r));}}).finally(()=>prisma.$disconnect());}
