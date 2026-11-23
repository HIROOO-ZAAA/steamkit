import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readStyles(path: string) {
  return readFileSync(path, "utf8");
}

test("dashboard motion respects reduced-motion preferences", () => {
  const styles = readStyles("src/app/dashboard/dashboard.module.css");
  const reducedMotion = styles.match(
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*)\}\s*$/,
  )?.[1];

  assert.ok(reducedMotion, "dashboard must define reduced-motion rules");
  assert.match(reducedMotion, /\.spin\s*\{\s*animation:\s*none;/);
  assert.match(reducedMotion, /\.statCard/);
  assert.match(reducedMotion, /\.methodCard/);
  assert.match(reducedMotion, /\.commandIcon/);
  assert.match(reducedMotion, /\.commandCard/);
  assert.match(reducedMotion, /\.currencyTab/);
  assert.match(reducedMotion, /\.methodBarFill/);
  assert.match(reducedMotion, /\.obsButton/);
  assert.match(reducedMotion, /\.shortcut/);
  assert.match(reducedMotion, /\.goalBarFill/);
  assert.match(reducedMotion, /\.heroLink/);
  assert.match(reducedMotion, /\.nextStepLink/);
  assert.match(reducedMotion, /transition:\s*none;/);
  assert.match(reducedMotion, /\.statCard:hover,\s*\.commandCard:hover,\s*\.commandCard:hover\s+\.commandIcon\s*\{\s*transform:\s*none;\s*box-shadow:\s*none;/);
});

test("dashboard OBS motion respects reduced-motion preferences", () => {
  const styles = readStyles("src/app/dashboard/integrations/obs/obs.module.css");

  assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(styles, /\.statusLive,\s*\.spinIcon\s*\{\s*animation:\s*none;/);
  assert.match(styles, /\.sceneBtn\s*\{\s*transition:\s*none;/);
});

test("dashboard project controls remove decorative movement when requested", () => {
  const formStyles = readStyles("src/app/dashboard/projects/new/new.module.css");
  const detailStyles = readStyles("src/app/dashboard/projects/[id]/project.module.css");

  assert.match(formStyles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(formStyles, /\.colorSwatch:hover,\s*\.selectedColor\s*\{\s*transform:\s*none;/);
  assert.match(detailStyles, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.typeBtn\s*\{\s*transition:\s*none;/);
});
