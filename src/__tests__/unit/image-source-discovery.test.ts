import { describe, expect, it } from 'vitest';
import { parseDiscoveredSeeds } from '../../../scripts/sync-image-sources';

describe('public paper directory discovery', () => {
    it('extracts subject, year and region from an EOL index without admitting other hosts', () => {
        const html = `<a href="https://gaokao.eol.cn/shiti/sx/202506/t20250612_123.shtml">2025年高考上海卷数学试题及答案</a>
            <a href="https://gaokao.eol.cn/shiti/yw/202506/t20250612_456.shtml">2025年高考北京卷语文试题</a>
            <a href="https://example.com/shiti/sx/202506/t20250612_789.shtml">2025年高考上海卷数学试题</a>`;
        const found = parseDiscoveredSeeds(html, 'https://gaokao.eol.cn/shiti/index_1.shtml');
        expect(found.map(seed => [seed.subject, seed.region, seed.year])).toEqual([['数学', '上海', 2025], ['语文', '北京', 2025]]);
    });

    it('keeps one single-paper link per exam and excludes roundup pages', () => {
        const html = `<a href="/read_123.htm">2026年全国一卷高考数学试卷及答案</a>
            <a href="/read_456.htm">2026年全国一卷高考数学真题</a>
            <a href="/read_789.htm">2026年高考数学试卷全国各地汇总</a>`;
        const found = parseDiscoveredSeeds(html, 'https://www.gk100.com/zhenti/list_4002.htm');
        expect(found).toHaveLength(1);
        expect(found[0].url).toBe('https://www.gk100.com/read_123.htm');
    });
});
