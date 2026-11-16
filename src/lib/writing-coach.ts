export type WritingPlan = { opening: string; body: string[]; ending: string; checklist: string[] };

export function buildWritingPlan(topic: string, genre: 'narrative' | 'expository' | 'argument', unit = ''): WritingPlan {
    const subject = topic.trim();
    if (!subject || subject.length > 100) throw new Error('题目须为 1 至 100 字');
    const context = unit.trim() ? `结合“${unit.trim().slice(0, 50)}”单元的学习主题，` : '';
    if (genre === 'narrative') return {
        opening: `${context}用一个具体场景引出“${subject}”，交代人物、时间或地点。`,
        body: ['写清事情的起因与目标。', '选择最重要的一两个细节，写出动作、对话和自己的感受。', '写出变化或转折，说明这件事带来了什么认识。'],
        ending: '回扣题目，写出现在的想法，避免空泛口号。',
        checklist: ['是否有真实具体的事例', '时间顺序是否清楚', '是否写出了自己的感受', '错别字与标点是否检查'],
    };
    if (genre === 'expository') return {
        opening: `${context}说明“${subject}”是什么，以及为什么值得介绍。`,
        body: ['选择两三个有代表性的特点，分段说明。', '用准确的数字、例子或比较解释每个特点；不确定的数据不要编造。', '按从整体到局部或从重要到次要的顺序组织材料。'],
        ending: '总结最重要的特点，并呼应开头。',
        checklist: ['说明对象是否明确', '每段是否只讲一个重点', '资料是否准确可信', '是否避免夸张或重复'],
    };
    return {
        opening: `${context}围绕“${subject}”提出一个清晰、可讨论的观点。`,
        body: ['写出支持观点的第一条理由和真实例子。', '写出不同角度的第二条理由，并说明例子如何支持观点。', '考虑一种可能的不同意见，并给出有礼貌的回应。'],
        ending: '重申观点，并给出具体可行的建议。',
        checklist: ['观点是否明确', '论据是否真实', '理由和例子是否相关', '是否避免绝对化表达'],
    };
}

export function writingStats(text: string) {
    const length = [...text.replace(/\s/g, '')].length;
    const paragraphs = text.trim() ? text.trim().split(/\n\s*\n|\n/).filter(row => row.trim()).length : 0;
    return { length, paragraphs };
}
