import {describe,it,expect} from 'vitest';
import {createRequire} from 'module';
const require=createRequire(import.meta.url);
const {splitWholePaper,parsePaperHtml,repairInlineQuestion}=require('../../../scripts/library-parser.cjs');
describe('safe paper repair',()=>{
 it('splits consecutive explicit questions preserving tables',()=>{
 const q=splitWholePaper('<p>1.题一</p><p>2.题二</p><table><tr><td>条件</td></tr></table><p>3.题三</p>','https://kaosj.com');
 expect(q).toHaveLength(3);expect(q[1].questionHtml).toContain('<table>');
 });
 it('retains ambiguous or shared-reading context as a whole paper',()=>{
 expect(splitWholePaper('<p>1.题</p><p>3.题</p><p>4.题</p>','https://kaosj.com')).toEqual([]);
 expect(splitWholePaper('<p>阅读下面文章</p><p>1.题</p><p>2.题</p><p>3.题</p>','https://kaosj.com')).toEqual([]);
 });
 it('does not treat repeated mathematical values as answer leakage',()=>{
 const p=parsePaperHtml('<h1>试卷</h1><div class="paper-content"><div class="question-block"><p class="question-stem">1.计算 123 123。</p></div></div>','https://kaosj.com');
 expect(p.questions[0].answerLeakRisk).toBe(false);
 });
});

it('repairs duplicated fill-in answers only when the independent answer confirms the value',()=>{
 const q={questionHtml:'<p>7.计算：x=32 32．</p>',answerHtml:'<p>答案为32</p>',answerLeakRisk:true};
 expect(repairInlineQuestion(q)).toMatchObject({questionHtml:'<p>7.计算：x=______ ．</p>',originalQuestionHtml:q.questionHtml,answerLeakRisk:false});
 expect(repairInlineQuestion({...q,answerHtml:''})).toEqual({...q,answerHtml:''});
});
it('keeps a whole-paper answer intact rather than losing it during splitting',()=>{
 const p=parsePaperHtml('<h1>试卷</h1><div class="paper-content"><p>1.题目一很长</p><p>2.题目二很长</p><p>3.题目三很长</p><p>'+ '正文'.repeat(50) +'</p><div class="paper-analysis"><div class="paper-analysis-content">整卷答案</div></div></div>','https://kaosj.com');
 expect(p.questions).toHaveLength(1);expect(p.questions[0].answerHtml).toContain('整卷答案');
});
