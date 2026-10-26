const {JSDOM}=require('jsdom');
const IMAGE_HOSTS=new Set(['img.eol.cn','gaokao.eol.cn','www.eol.cn','p1.gk100.com','files.eduuu.com']);
function parseImagePaper(html,url,kind='paper'){
    const document=new JSDOM(html,{url}).window.document;
    const host=new URL(url).hostname;
    const root=host.endsWith('eol.cn')?document.querySelector('.TRS_Editor'):host.endsWith('gk100.com')?document.querySelector('article'):document.querySelector('.self_content');
    if(!root)throw new Error('来源没有可识别的公开试卷正文');
    const paper=[],answers=[];
    let section=kind;
    for(const node of root.children){
        const text=node.textContent.trim();
        if(/gk100\.com$/.test(host)){
            if(/^二[、．.].*考后|^相关推荐|^编辑推荐/.test(text))break;
            if(/^[12][、．.].*数学.*(?:试卷|试题)/.test(text))section='paper';
            if(/^2[、．.].*答案/.test(text))section='answer';
        }else if(/zhongkao\.com$/.test(host)&&/扫码|相关推荐|编辑推荐|点击.*领取/.test(text))continue;
        for(const img of [...node.querySelectorAll('img'),...(node.tagName==='IMG'?[node]:[])]){
            if(img.closest('a')&&host.endsWith('zhongkao.com'))continue;
            try{
                const linked=img.closest('a')?.getAttribute('href');const src=new URL(linked&&/\.(png|jpe?g|webp)(?:\?|$)/i.test(linked)?linked:img.getAttribute('data-src')||img.getAttribute('src')||'',url);
                if(!IMAGE_HOSTS.has(src.hostname)||!['http:','https:'].includes(src.protocol))continue;
                if(/zhongkao\.com$/.test(host)){
                    const date=url.match(/\/e\/(\d{4})(\d{2})(\d{2})\//);
                    if(!date||!src.pathname.includes(`/img/${date[1]}/${date[2]}/${date[3]}/`))continue;
                }
                (section==='answer'?answers:paper).push(src.href);
            }catch{}
        }
    }
    const count=html.match(/_PAGE_COUNT\s*=\s*["'](\d+)/)?.[1];
    const pages=new Set([url]);
    if(count){const total=Number(count);if(total>50)throw new Error('来源分页过多，需要人工确认');const pageName=html.match(/_PAGE_NAME\s*=\s*["']([^"']+)/)?.[1];if(!pageName||!/^\w+$/.test(pageName))throw new Error('来源分页名称无效');for(let index=1;index<total;index++)pages.add(new URL(pageName+'_'+index+'.shtml',url).href);}
    else{
        const match=url.match(/^(.*\/)([\w]+)(?:_\d+)?\.shtml$/);
        if(match){let max=1;for(const a of document.querySelectorAll('a[href]')){const href=a.href;const prefix=match[1]+match[2]+'_';if(href.startsWith(prefix)){const n=Number(href.slice(prefix.length).match(/^\d+/)?.[0]);if(n>max&&n<=50)max=n;}}for(let index=2;index<=max;index++)pages.add(match[1]+match[2]+'_'+index+'.shtml');}
    }
    document.defaultView.close();
    return {paper:[...new Set(paper)],answers:[...new Set(answers)],pages:[...pages]};
}
module.exports={parseImagePaper,IMAGE_HOSTS};
