export type PoetryItem = { title: string; author: string; dynasty: string; text: string[]; focus: string; question: string; answer: string; minGrade: number };

// 公版古诗词摘录；学习提示和问题为本项目原创。
export const poetryItems: PoetryItem[] = [
    { title: '静夜思', author: '李白', dynasty: '唐', text: ['床前明月光，疑是地上霜。', '举头望明月，低头思故乡。'], focus: '月光与思乡之情', question: '诗人抬头看见了什么？', answer: '明月', minGrade: 1 },
    { title: '春晓', author: '孟浩然', dynasty: '唐', text: ['春眠不觉晓，处处闻啼鸟。', '夜来风雨声，花落知多少。'], focus: '春日清晨的声音与想象', question: '诗人醒来听见了什么？', answer: '鸟鸣', minGrade: 1 },
    { title: '登鹳雀楼', author: '王之涣', dynasty: '唐', text: ['白日依山尽，黄河入海流。', '欲穷千里目，更上一层楼。'], focus: '登高远望与进取', question: '想看得更远，诗中建议怎样做？', answer: '更上一层楼', minGrade: 2 },
    { title: '江雪', author: '柳宗元', dynasty: '唐', text: ['千山鸟飞绝，万径人踪灭。', '孤舟蓑笠翁，独钓寒江雪。'], focus: '雪中的孤舟与寂静', question: '雪中独自垂钓的是谁？', answer: '蓑笠翁', minGrade: 2 },
    { title: '望庐山瀑布', author: '李白', dynasty: '唐', text: ['日照香炉生紫烟，遥看瀑布挂前川。', '飞流直下三千尺，疑是银河落九天。'], focus: '夸张想象描写瀑布', question: '诗人把瀑布联想成了什么？', answer: '银河', minGrade: 3 },
    { title: '绝句', author: '杜甫', dynasty: '唐', text: ['两个黄鹂鸣翠柳，一行白鹭上青天。', '窗含西岭千秋雪，门泊东吴万里船。'], focus: '色彩、声音与远近层次', question: '诗中有哪些鸟？', answer: '黄鹂和白鹭', minGrade: 3 },
    { title: '山行', author: '杜牧', dynasty: '唐', text: ['远上寒山石径斜，白云生处有人家。', '停车坐爱枫林晚，霜叶红于二月花。'], focus: '秋日枫林的色彩', question: '诗人为什么停下车？', answer: '喜爱傍晚的枫林', minGrade: 4 },
    { title: '题西林壁', author: '苏轼', dynasty: '宋', text: ['横看成岭侧成峰，远近高低各不同。', '不识庐山真面目，只缘身在此山中。'], focus: '观察角度不同，认识也不同', question: '诗人为什么看不清庐山全貌？', answer: '因为身在庐山之中', minGrade: 4 },
    { title: '游山西村', author: '陆游', dynasty: '宋', text: ['莫笑农家腊酒浑，丰年留客足鸡豚。', '山重水复疑无路，柳暗花明又一村。'], focus: '山村景色与转机', question: '“疑无路”后出现了什么？', answer: '柳暗花明又一村', minGrade: 5 },
    { title: '竹石', author: '郑燮', dynasty: '清', text: ['咬定青山不放松，立根原在破岩中。', '千磨万击还坚劲，任尔东西南北风。'], focus: '借竹的坚韧表达志向', question: '诗中竹子扎根在哪里？', answer: '破岩中', minGrade: 5 },
    { title: '观沧海', author: '曹操', dynasty: '东汉末', text: ['东临碣石，以观沧海。', '水何澹澹，山岛竦峙。', '秋风萧瑟，洪波涌起。'], focus: '开阔视野与壮阔海景（节选）', question: '诗人远望的是什么？', answer: '沧海', minGrade: 7 },
];

export function poetryForGrade(grade: number) {
    return poetryItems.filter(item => item.minGrade <= grade && item.minGrade >= Math.max(1, grade - 2));
}
export function randomPoetry(grade: number, previousTitle = '', rng: () => number = Math.random): PoetryItem {
    const available = poetryForGrade(grade);
    const fresh = available.filter(item => item.title !== previousTitle);
    const pool = fresh.length ? fresh : available;
    if (!pool.length) throw new Error('当前年级暂无诗词材料');
    return pool[Math.floor(rng() * pool.length)];
}
