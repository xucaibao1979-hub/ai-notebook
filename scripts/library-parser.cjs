const { JSDOM } = require('jsdom');
const katex = require('katex');

const allowedTags = new Set('p div span br strong b em i u sub sup ul ol li table thead tbody tr td th img math mrow mi mn mo msup msub mfrac msqrt mroot mtext mtable mtr mtd semantics annotation mstyle munderover mover munder mfenced mspace'.split(' '));
function sanitizeHtml(html, baseUrl) {
    const document = new JSDOM(`<div id="root">${html}</div>`).window.document;
    const root = document.getElementById('root');
    const walker = document.createTreeWalker(root, document.defaultView.NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    for (const node of textNodes) {
        if (node.parentElement?.closest('math,script,style')) continue;
        const text = node.textContent;
        const pattern = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
        let match, last = 0;
        const fragment = document.createDocumentFragment();
        while ((match = pattern.exec(text))) {
            if (match.index > 0 && text[match.index - 1] === '\\') continue;
            fragment.append(document.createTextNode(text.slice(last, match.index)));
            const rendered = document.createElement('span');
            rendered.innerHTML = katex.renderToString(match[1] || match[2], { displayMode: !!match[1], throwOnError: false, strict: false, trust: false, output: 'mathml' });
            fragment.append(rendered); last = pattern.lastIndex;
        }
        if (last) { fragment.append(document.createTextNode(text.slice(last))); node.replaceWith(fragment); }
    }
    for (const element of [...root.querySelectorAll('*')]) {
        const tag = element.tagName.toLowerCase();
        if (!allowedTags.has(tag)) { element.remove(); continue; }
        for (const attribute of [...element.attributes]) {
            if (!['src', 'alt', 'start', 'rowspan', 'colspan', 'encoding', 'xmlns', 'display', 'mathvariant'].includes(attribute.name)) element.removeAttribute(attribute.name);
        }
        if (tag === 'img') {
            try {
                const url = new URL(element.getAttribute('src') || '', baseUrl);
                const local=/^\/knowledge-assets\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(element.getAttribute('src')||'')||/^\/uploads\/restore-[a-f0-9]{64}\.(png|jpg|jpeg|webp)$/.test(element.getAttribute('src')||'');
                const allowed=url.hostname==='kaosj.com'||url.hostname.endsWith('.kaosj.com')||['img.eol.cn','gaokao.eol.cn','www.eol.cn','p1.gk100.com','files.eduuu.com'].includes(url.hostname);
                if(local){element.setAttribute('loading','lazy');continue;}
                if (!['http:', 'https:'].includes(url.protocol) || !allowed) { element.remove(); continue; }
                url.protocol = 'https:'; element.setAttribute('src', url.href);
                element.setAttribute('loading', 'lazy'); element.setAttribute('referrerpolicy', 'no-referrer');
            } catch { element.remove(); }
        }
    }
    const result = root.innerHTML;
    document.defaultView.close();
    return result;
}

function parsePaperHtml(html, url) {
    const document = new JSDOM(html).window.document;
    const title = document.querySelector('h1')?.textContent.trim() || '';
    const content = document.querySelector('.paper-content');
    if (!content) throw new Error('页面没有独立试卷正文');
    const originals = [...content.querySelectorAll('.question-block')].filter(block => !block.closest('.paper-analysis'));
    const answerBlocks = [...content.querySelectorAll('.paper-analysis .question-block')];
    const answers = new Map();
    const signature = block => (block.querySelector('.question-stem')?.textContent || block.textContent).replace(/\s+/g, '').slice(0, 160);
    for (const block of answerBlocks) {
        const number = block.querySelector('.question-stem')?.textContent.match(/^\s*(\d+)[.．、]/)?.[1];
        if (!number) continue;
        let answer = '', sibling = block.nextElementSibling;
        while (sibling && !sibling.classList.contains('question-block')) {
            if (/^【答案】|^【分析】|^【解答】|^【详解】/.test(sibling.textContent.trim()) || answer) answer += sibling.outerHTML;
            sibling = sibling.nextElementSibling;
        }
        if (answer) answers.set(signature(block), sanitizeHtml(answer, url));
    }
    const questions = originals.map((block, index) => {
        const text = block.textContent.trim();
        const sourceNumber = block.querySelector('.question-stem')?.textContent.match(/^\s*(\d+)[.．、]/)?.[1] || String(index + 1);
        return { number: String(index + 1), sourceNumber, questionHtml: sanitizeHtml(block.innerHTML, url), questionText: text, answerHtml: answers.get(signature(block)) || '', answerLeakRisk: /(?:参考答案|【答案】|故选[:：]|故答案为)/.test(text) || /(?:=|为|是|分别是)\s*([^\s，。．]{2,})\s+\1/u.test(text) };
    });
    const attachments = [...document.querySelectorAll('a[href]')].filter(link => /\.(docx|pdf)(\?|$)/i.test(link.getAttribute('href') || '')).map(link => ({
        label: link.textContent.trim() || '来源附件', url: new URL(link.getAttribute('href'), url).href,
        kind: /解析|答案/.test(link.textContent + link.getAttribute('href')) ? 'answer' : 'paper',
    }));
    if (!questions.length) {
        const original = content.cloneNode(true);
        for (const analysis of original.querySelectorAll('.paper-analysis')) analysis.remove();
        const answer = content.querySelector('.paper-analysis-content');
        const split = splitWholePaper(original.innerHTML, url);
        if (split.length && !answer) { questions.push(...split); } else {
        if (original.textContent.trim().length < 80) throw new Error('来源只提供附件或正文不完整，未作为完整试卷导入');
        questions.push({ number: '整卷', questionHtml: sanitizeHtml(original.innerHTML, url), questionText: original.textContent.trim(), answerHtml: answer ? sanitizeHtml(answer.innerHTML, url) : '', answerLeakRisk: /【答案】|参考答案|故选[:：]/.test(original.textContent), wholePaper: true });
        }
    }
    document.defaultView.close();
    return { title, questions: questions.map(repairInlineQuestion), attachments: [...new Map(attachments.map(link => [link.url, link])).values()] };
}

function splitWholePaper(html, url) {
    const document = new JSDOM('<div id="root">' + html + '</div>').window.document;
    const root = document.getElementById('root');
    const nodes = [];
    for (const node of [...root.children]) {
        if (node.tagName === 'OL') {
            const start = Number(node.getAttribute('start') || 1);
            [...node.children].forEach((li, i) => nodes.push({ html:li.innerHTML, text:li.textContent.trim(), number:start+i }));
        } else nodes.push({html:node.outerHTML, text:node.textContent.trim(), number:Number(node.textContent.trim().match(/^(\d{1,2})[.．、](?!\d)/)?.[1]) || null});
    }
    const groups = []; let current = null; let invalid = false;
    for (const node of nodes) {
        const n=node.number;
        if (n && (!current ? n === 1 : n === current.number + 1)) {
            current={number:n, html:node.html};groups.push(current);
        } else if (n && current && n !== current.number) { invalid=true; break; }
        else if(current) current.html += node.html;
    }
    // Only split a complete, consecutive numbering sequence. Shared reading passages
    // and ambiguous numbering remain as whole papers to avoid dropping context.
    const combined=root.textContent;
    const shared=/阅读下面|阅读以下|根据下列材料|阅读材料|回答[\s\S]{0,12}题/.test(combined);
    document.defaultView.close();
    if(invalid || shared || groups.length < 3) return [];
    return groups.map(g=>{
        const doc=new JSDOM('<div>'+g.html+'</div>').window.document;
        const text=doc.body.textContent;
        const marker=text.match(/【答案】|参考答案[:：]/);
        let questionHtml=g.html, answerHtml='';
        // Separate inline answers only at a top-level answer block, never by guessing text offsets.
        const holder=doc.body.firstElementChild;
        const answerNodes=[...holder.children];
        const boundary=answerNodes.findIndex(n=>/^(【答案】|参考答案[:：])/.test(n.textContent.trim()));
        if(boundary>=0){questionHtml=answerNodes.slice(0,boundary).map(n=>n.outerHTML).join('');answerHtml=answerNodes.slice(boundary).map(n=>n.outerHTML).join('');}
        doc.defaultView.close();
        return {number:String(g.number),sourceNumber:String(g.number),questionHtml:sanitizeHtml(questionHtml,url),questionText:text,answerHtml:sanitizeHtml(answerHtml,url),answerLeakRisk:!!marker && !answerHtml};
    });
}
function repairInlineQuestion(question) {
    if(question.wholePaper || question.locallyReviewed) return question;
    const pattern=/((?:=|为|是|分别是)\s*)([^\s，。．<>]{2,})\s+\2(\s*[．。.]?\s*<\/p>\s*)$/u;
    const match=question.questionHtml.match(pattern);
    if(!match || !question.answerHtml || !question.answerHtml.replace(/<[^>]+>/g,'').replace(/\s/g,'').includes(match[2])) return question;
    return {...question,originalQuestionHtml:question.originalQuestionHtml || question.questionHtml,questionHtml:question.questionHtml.replace(pattern,'$1______ $3'),answerLeakRisk:false};
}
module.exports = { sanitizeHtml, parsePaperHtml, splitWholePaper, repairInlineQuestion };

