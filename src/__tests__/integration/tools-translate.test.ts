import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), translate: vi.fn(), service: vi.fn(), reserve: vi.fn(), update: vi.fn() }));
vi.mock('next-auth', () => ({ getServerSession: mocks.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/ai', () => ({ getAIService: mocks.service }));
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: mocks.reserve, studyTask: { update: mocks.update } } }));
import { POST } from '@/app/api/tools/translate/route';

const jpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64')}`;
const png = `data:image/png;base64,${Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).toString('base64')}`;
function post(body: unknown) {
    return POST(new Request('http://localhost/api/tools/translate', { method: 'POST', body: JSON.stringify(body) }));
}

describe('拍照翻译接口', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.session.mockResolvedValue({ user: { id: 'student-a' } });
        mocks.service.mockReturnValue({ translateImage: mocks.translate });
        mocks.translate.mockResolvedValue('{"sourceText":"你好","translatedText":"Hello"}');
        mocks.reserve.mockResolvedValue([{ id: 'reserved' }]);
        mocks.update.mockResolvedValue({});
    });
    it('登录后识图并返回原文与译文，使用现有识图模型配置', async () => {
        const response = await post({ image: jpeg, direction: 'zh-en' });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ sourceText: '你好', translatedText: 'Hello' });
        expect(mocks.service).toHaveBeenCalledWith('analyze', 'student-a');
        expect(mocks.translate).toHaveBeenCalledWith(jpeg.split(',')[1], 'image/jpeg', expect.stringContaining('中文翻译成英文'));
        expect(mocks.translate.mock.calls[0][2]).not.toMatch(/教材|习题审核/);
    });
    it('支持英文翻译成中文和 PNG', async () => {
        const response = await post({ image: png, direction: 'en-zh' });
        expect(response.status).toBe(200);
        expect(mocks.translate).toHaveBeenCalledWith(png.split(',')[1], 'image/png', expect.stringContaining('英文翻译成中文'));
    });
    it('未登录时拒绝调用模型', async () => {
        mocks.session.mockResolvedValue(null);
        expect((await post({ image: jpeg, direction: 'zh-en' })).status).toBe(401);
        expect(mocks.service).not.toHaveBeenCalled();
    });
    it.each([
        { image: jpeg, direction: 'other' },
        { image: 'data:image/jpeg;base64,AAAA', direction: 'zh-en' },
        { image: `data:image/png;base64,${jpeg.split(',')[1]}`, direction: 'zh-en' },
        { image: 'data:image/svg+xml;base64,PHN2Zz4=', direction: 'zh-en' },
        { image: `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(4 * 1024 * 1024)]).toString('base64')}`, direction: 'zh-en' },
    ])('拒绝无效请求、伪造图片和超大文件', async body => {
        expect((await post(body)).status).toBe(400);
        expect(mocks.service).not.toHaveBeenCalled();
    });
    it('拒绝无效 JSON 与过大请求体', async () => {
        expect((await POST(new Request('http://localhost/api/tools/translate', { method: 'POST', body: '{' }))).status).toBe(400);
        expect((await POST(new Request('http://localhost/api/tools/translate', { method: 'POST', body: ' '.repeat(5_600_001) }))).status).toBe(413);
    });
    it('拒绝不符合 JSON schema 的模型输出', async () => {
        mocks.translate.mockResolvedValueOnce('{"sourceText":"hi","translatedText":42}');
        const response = await post({ image: jpeg, direction: 'en-zh' });
        expect(response.status).toBe(502);
        expect((await response.json()).message).toMatch(/模型返回/);
    });
    it('共享存储拒绝重复、并发或超额请求，调用模型前即返回', async () => {
        mocks.reserve.mockResolvedValueOnce([]);
        const response = await post({ image: jpeg, direction: 'zh-en' });
        expect(response.status).toBe(429);
        expect(mocks.service).not.toHaveBeenCalled();
        expect(mocks.reserve).toHaveBeenCalledOnce();
        const sql = mocks.reserve.mock.calls[0][0].join(' ');
        expect(sql).toContain('INSERT INTO "StudyTask"');
        expect(sql).toContain('COUNT(*)');
        expect(sql).toContain('NOT EXISTS');
        expect(sql).toContain('"status" = \'pending\'');
        expect(sql).toContain('"status" = \'completed\'');
        expect(mocks.reserve.mock.calls[0].slice(1)).toContain('student-a');
        expect(mocks.reserve.mock.calls[0].slice(1)).toContain('translate-image');
        expect(sql).toContain('< 10');
    });
    it('限流存储不可用时拒绝调用模型，不退化为进程内限流', async () => {
        mocks.reserve.mockRejectedValueOnce(new Error('database unavailable sk-secret-value'));
        const response = await post({ image: jpeg, direction: 'zh-en' });
        expect(response.status).toBe(503);
        expect(JSON.stringify(await response.json())).not.toContain('sk-secret-value');
        expect(mocks.service).not.toHaveBeenCalled();
    });
    it('模型调用完成或失败均解除占位，过长输出拒绝返回', async () => {
        mocks.translate.mockResolvedValueOnce(JSON.stringify({ sourceText: 'a'.repeat(4001), translatedText: 'b' }));
        expect((await post({ image: jpeg, direction: 'zh-en' })).status).toBe(502);
        expect(mocks.update).toHaveBeenCalledWith({ where: { id: expect.any(String) }, data: { status: 'failed' } });
        await post({ image: png, direction: 'en-zh' });
        expect(mocks.update).toHaveBeenLastCalledWith({ where: { id: expect.any(String) }, data: { status: 'completed' } });
    });
    it('模型超时由上游处理，接口不使用只停止等待的 Promise.race', async () => {
        mocks.translate.mockRejectedValueOnce(new Error('AI_TIMEOUT_ERROR'));
        expect((await post({ image: jpeg, direction: 'zh-en' })).status).toBe(504);
        expect(mocks.update).toHaveBeenCalledOnce();
    });
    it('模型出错时不泄漏密钥', async () => {
        mocks.translate.mockRejectedValueOnce(new Error('sk-secret-value connection failed'));
        const response = await post({ image: jpeg, direction: 'zh-en' });
        expect(response.status).toBe(502);
        expect(JSON.stringify(await response.json())).not.toContain('sk-secret-value');
    });
});
