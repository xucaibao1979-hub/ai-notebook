import { expect, it } from 'vitest';
import { decodeSavedHomeworkImage, hasSavedHomeworkImage } from '@/lib/homework-image';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

it('recognizes and decodes a saved original image', () => {
    expect(hasSavedHomeworkImage(png)).toBe(true);
    expect(decodeSavedHomeworkImage(png)?.mime).toBe('image/png');
});

it('does not present empty or malformed archived images as viewable', () => {
    for (const value of ['', 'not-an-image', 'data:image/png;base64,AAAA', 'data:image/png;base64,%%%']) {
        expect(hasSavedHomeworkImage(value)).toBe(false);
        expect(decodeSavedHomeworkImage(value)).toBeNull();
    }
});
