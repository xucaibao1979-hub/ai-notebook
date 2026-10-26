const imagePattern = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

export function hasSavedHomeworkImage(value: string | null | undefined): boolean {
    if (!value) return false;
    const match = imagePattern.exec(value);
    if (!match || match[2].length < 32 || match[2].length % 4 !== 0) return false;
    const signature = Buffer.from(match[2].slice(0, 32), 'base64');
    if (match[1] === 'jpeg') return signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff;
    if (match[1] === 'png') return signature.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    return signature.toString('ascii', 0, 4) === 'RIFF' && signature.toString('ascii', 8, 12) === 'WEBP';
}

export function decodeSavedHomeworkImage(value: string | null | undefined): { mime: string; bytes: Buffer } | null {
    if (!hasSavedHomeworkImage(value)) return null;
    const match = imagePattern.exec(value!)!;
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length < 32 || bytes.toString('base64') !== match[2]) return null;
    return { mime: `image/${match[1]}`, bytes };
}
