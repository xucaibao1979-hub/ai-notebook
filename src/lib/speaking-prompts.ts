export type SpeakingCategory = 'daily' | 'study';
export type SpeakingPrompt = { title: string; english: string; chinese: string; minGrade: number };

export const speakingPrompts: Record<SpeakingCategory, SpeakingPrompt[]> = {
    daily: [
        { title: '见面问候', english: 'Good morning! How are you today?', chinese: '早上好！你今天怎么样？', minGrade: 1 },
        { title: '介绍自己', english: 'My name is Lin. I like drawing and reading.', chinese: '我叫林。我喜欢画画和阅读。', minGrade: 1 },
        { title: '说再见', english: 'See you tomorrow. Have a nice day!', chinese: '明天见，祝你今天愉快！', minGrade: 1 },
        { title: '道谢', english: 'Thank you for helping me. You are very kind.', chinese: '谢谢你帮助我，你真友善。', minGrade: 2 },
        { title: '询问时间', english: 'What time is it? It is half past seven.', chinese: '现在几点？七点半。', minGrade: 2 },
        { title: '谈论天气', english: 'It is sunny today. Let us go for a walk.', chinese: '今天天气晴朗，我们去散步吧。', minGrade: 2 },
        { title: '点餐', english: 'May I have a bowl of noodles, please?', chinese: '请问可以给我一碗面条吗？', minGrade: 3 },
        { title: '问路', english: 'Excuse me, how can I get to the library?', chinese: '打扰一下，去图书馆怎么走？', minGrade: 3 },
        { title: '购物', english: 'How much is this notebook? I would like two.', chinese: '这个笔记本多少钱？我想买两本。', minGrade: 3 },
        { title: '周末计划', english: 'This weekend, I am going to visit my grandparents.', chinese: '这个周末，我打算去看望祖父母。', minGrade: 4 },
        { title: '表达观点', english: 'I think riding a bike is good for our health.', chinese: '我认为骑车有益于健康。', minGrade: 4 },
        { title: '过去经历', english: 'Yesterday, I visited a museum and learned a lot.', chinese: '昨天我参观了博物馆，学到了很多。', minGrade: 5 },
        { title: '邀请朋友', english: 'Would you like to join our reading club on Friday?', chinese: '你愿意周五参加我们的读书会吗？', minGrade: 5 },
        { title: '健康建议', english: 'You should drink enough water and get some rest.', chinese: '你应该喝足够的水并休息一下。', minGrade: 5 },
        { title: '未来目标', english: 'I hope to become a scientist and solve real problems.', chinese: '我希望成为科学家，解决实际问题。', minGrade: 6 },
        { title: '环保讨论', english: 'If we use less plastic, we can protect the environment.', chinese: '如果少用塑料，我们就能保护环境。', minGrade: 6 },
        { title: '旅行计划', english: 'We are planning a trip, so we need to check the weather first.', chinese: '我们在计划旅行，所以需要先查看天气。', minGrade: 6 },
        { title: '学习习惯', english: 'I used to study late, but now I make a plan every evening.', chinese: '我以前学习到很晚，现在每晚都制订计划。', minGrade: 7 },
    ],
    study: [
        { title: '借用文具', english: 'May I borrow your pencil, please?', chinese: '我能借用你的铅笔吗？', minGrade: 1 },
        { title: '提问', english: 'I have a question. Can you help me?', chinese: '我有个问题，你能帮我吗？', minGrade: 1 },
        { title: '朗读课文', english: 'Please read the first sentence aloud.', chinese: '请大声朗读第一句话。', minGrade: 2 },
        { title: '课堂发言', english: 'I think the answer is twelve.', chinese: '我认为答案是十二。', minGrade: 2 },
        { title: '讨论小组', english: 'Let us work together and share our ideas.', chinese: '让我们一起合作，分享想法。', minGrade: 3 },
        { title: '核对作业', english: 'Could you check my homework after class?', chinese: '课后你可以帮我检查作业吗？', minGrade: 3 },
        { title: '解释理由', english: 'I chose this answer because the text gives us a clue.', chinese: '我选择这个答案，因为课文给了线索。', minGrade: 4 },
        { title: '学习计划', english: 'I will review these words before the test.', chinese: '考试前我会复习这些单词。', minGrade: 4 },
        { title: '查找资料', english: 'We can look up more information in the library.', chinese: '我们可以在图书馆查找更多资料。', minGrade: 5 },
        { title: '自我纠错', english: 'I made a mistake, so I will try another method.', chinese: '我犯了错，所以会试另一种方法。', minGrade: 5 },
        { title: '表达不同意见', english: 'I see your point, but I have a different idea.', chinese: '我理解你的观点，但我有不同的想法。', minGrade: 5 },
        { title: '总结收获', english: 'Today I learned how to compare two solutions.', chinese: '今天我学会了比较两种解法。', minGrade: 6 },
        { title: '寻求反馈', english: 'Could you tell me how to improve my writing?', chinese: '你能告诉我怎样改进写作吗？', minGrade: 6 },
        { title: '小组展示', english: 'Our group will explain the results of our experiment.', chinese: '我们小组将解释实验结果。', minGrade: 6 },
        { title: '讨论证据', english: 'The evidence supports our idea, but we need more examples.', chinese: '证据支持我们的观点，但我们需要更多例子。', minGrade: 7 },
        { title: '时间管理', english: 'I divide a difficult task into smaller steps to stay focused.', chinese: '我把困难任务分成小步骤来保持专注。', minGrade: 7 },
    ],
};

export function availableSpeakingPrompts(category: SpeakingCategory, grade: number): SpeakingPrompt[] {
    return speakingPrompts[category].filter(item => item.minGrade <= grade && item.minGrade >= Math.max(1, grade - 3));
}

export function randomSpeakingPrompt(category: SpeakingCategory, grade: number, currentTitle = '', rng: () => number = Math.random): SpeakingPrompt {
    const eligible = availableSpeakingPrompts(category, grade);
    const pool = eligible.filter(item => item.title !== currentTitle);
    const choices = pool.length ? pool : eligible;
    if (!choices.length) throw new Error('当前年级暂无练习材料');
    return choices[Math.floor(rng() * choices.length)];
}
