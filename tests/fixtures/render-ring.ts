import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { compile } from "@tailwindcss/node";
import { ProgressRing } from "../../src/components/progress-ring";

async function renderFixture() {
  const html = renderToStaticMarkup(
    createElement(ProgressRing, {
      sent: 2,
      queued: 0,
      failed: 0,
      seconds: 0,
    }),
  );
  const candidates = [...html.matchAll(/class="([^"]+)"/g)].flatMap((match) =>
    match[1].split(" "),
  );
  const compiler = await compile(readFileSync("src/app/globals.css", "utf8"), {
    base: path.resolve("src/app"),
    onDependency() {},
  });
  process.stdout.write(`<style>${compiler.build(candidates)}</style>${html}`);
}
void renderFixture();
