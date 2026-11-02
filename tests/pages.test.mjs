import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from "linkedom";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  existsSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { buildSite } from "../scripts/build-site.mjs";

/** Use this function to list files below a built artifact directory; directory
 * is an absolute path; depends only on node:fs and node:path. */
function filesBelow(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesBelow(path) : [path];
  });
}

test("Pages artifact keeps all local imports/assets reachable below a repository prefix", () => {
  const temporary = mkdtempSync(join(tmpdir(), "virtual-lab-pages-"));
  const output = join(temporary, "virtual_lab");
  try {
    buildSite(output);
    writeFileSync(join(output, "obsolete.js"), "// old artifact");
    buildSite(output);
    assert.ok(
      !existsSync(join(output, "obsolete.js")),
      "Rebuild retained an obsolete module",
    );
    const files = filesBelow(output);
    assert.ok(existsSync(join(output, ".nojekyll")));
    assert.ok(existsSync(join(output, "analysis-guide.md")));
    assert.ok(existsSync(join(output, "apps/hplc-simulator/analysis.js")));
    assert.ok(!existsSync(join(output, ".git")));
    assert.ok(!existsSync(join(output, ".codex")));
    assert.ok(!files.some((path) => path.endsWith(".test.mjs")));
    for (const path of files.filter((path) => /\.(html|js|css)$/.test(path))) {
      const source = readFileSync(path, "utf8");
      const references = path.endsWith(".html")
        ? [...parseHTML(source).document.querySelectorAll("[src], [href]")]
            .map(
              (element) =>
                element.getAttribute("src") ?? element.getAttribute("href"),
            )
            .filter((reference) => !reference.startsWith("#"))
        : [
            ...source.matchAll(
              /(?:from\s*|import\s*\(|url\()\s*['"]([^'"]+)['"]/g,
            ),
          ].map((match) => match[1]);
      for (const reference of references) {
        if (/^(https?:|data:|node:)/.test(reference)) continue;
        assert.ok(
          !reference.startsWith("/"),
          `${path} escapes project prefix: ${reference}`,
        );
        const target = resolve(dirname(path), reference.split(/[?#]/)[0]);
        assert.ok(
          !relative(output, target).startsWith(".."),
          `Asset escapes artifact: ${reference}`,
        );
        assert.ok(
          existsSync(target),
          `Missing asset: ${reference} from ${path}`,
        );
      }
    }
    const { document } = parseHTML(
      readFileSync(join(output, "apps/hplc-simulator/index.html"), "utf8"),
    );
    assert.equal(
      document.querySelector('script[type="module"]').getAttribute("src"),
      "./app.js",
    );
  } finally {
    // Verify the recursive-delete target is the temporary directory created above.
    assert.equal(dirname(temporary), resolve(tmpdir()));
    assert.ok(temporary.split(/[\\/]/).at(-1).startsWith("virtual-lab-pages-"));
    rmSync(temporary, { recursive: true, force: true });
  }
});
