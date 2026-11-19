const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const stage = path.resolve(process.argv[2]);
if (!stage || !stage.startsWith(path.join(root, 'build') + path.sep)) {
    throw new Error('Expected an output directory inside build.');
}

const sources = [
    'scripts/sync-knowledge-library.ts',
    'scripts/sync-image-sources.ts',
    'src/lib/knowledge-library.ts',
];
for (const relative of sources) {
    const input = path.join(root, relative);
    const output = path.join(stage, relative.replace(/\.ts$/, '.js'));
    const result = ts.transpileModule(fs.readFileSync(input, 'utf8'), {
        fileName: input,
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
            esModuleInterop: true,
        },
        reportDiagnostics: true,
    });
    if (result.diagnostics?.some(item => item.category === ts.DiagnosticCategory.Error)) {
        throw new Error(`Failed to compile ${relative}`);
    }
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, result.outputText);
    console.log(`Compiled ${relative}`);
}
for (const relative of ['scripts/library-parser.cjs', 'scripts/image-paper-parser.cjs']) {
    const output = path.join(stage, relative);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.copyFileSync(path.join(root, relative), output);
}
