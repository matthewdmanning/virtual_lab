import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

/** Use this function to assemble the static Pages artifact at destination;
 * inputs are a destination path; depends only on the repository's public asset allowlist. */
export function buildSite(destination) {
    const output = resolve(destination);
    const sourceWithinOutput = relative(output, root);
    if (!sourceWithinOutput || (!sourceWithinOutput.startsWith('..') && !sourceWithinOutput.includes(':'))) {
        throw new Error('Build destination must not contain the repository.');
    }
    if (existsSync(output)) {
        if (lstatSync(output).isSymbolicLink()) throw new Error('Build destination cannot be a link.');
        if (readdirSync(output).length && !existsSync(resolve(output, '.nojekyll'))) {
            throw new Error('Refusing to replace a nonempty directory without the generated artifact marker.');
        }
        // Only the checked, explicitly selected generated artifact is replaced.
        rmSync(output, { recursive: true });
    }
    mkdirSync(output, { recursive: true });
    for (const entry of ['index.html', 'apps', 'shared', 'webgpu-harness.js',
        'framework_parameter_interdependence_guide.md', 'glossary.md', 'gh-pages.md', 'mechanistic-pde.md',
        'analysis-guide.md']) {
        cpSync(resolve(root, entry), resolve(output, entry), {
            recursive: true, filter: source => !source.split(/[\\/]/).includes('tests')
        });
    }
    writeFileSync(resolve(output, '.nojekyll'), '');
    return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    console.log(`Static site: ${buildSite(resolve(root, 'dist'))}`);
}
