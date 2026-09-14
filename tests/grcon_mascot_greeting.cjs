const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const Core = require(path.join(root, "grcon_mascot_greeting_core.js"));
const ui = fs.readFileSync(path.join(root, "grcon_mascot_greeting.js"), "utf8");
const loader = fs.readFileSync(path.join(root, "grcon_service_worker.js"), "utf8");
const cloud = fs.readFileSync(path.join(root, "grcon_cloud_app.js"), "utf8");
const mascot = fs.readFileSync(path.join(root, "grcon_mascot_header.js"), "utf8");
const asset = fs.readFileSync(path.join(root, "grcon_mascot_asset_fix.js"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const animatedAssets = [
  "grcon-mascot-run-sprite.png",
  "grcon-mascot-wave.png",
  "grcon-mascot-analyze.png",
  "grcon-mascot-success.png",
].map((name) => ({
  name,
  bytes: fs.readFileSync(path.join(root, "assets", "mascot", "animated", name)),
}));

assert.strictEqual(Core.firstName("Vinicio Melo"), "Vinicio");
assert.strictEqual(Core.firstName("João Pedro Silva"), "João");
assert.strictEqual(Core.firstName("Ana"), "Ana");
assert.strictEqual(Core.firstName("   Ana   Carolina   Souza  "), "Ana");
assert.strictEqual(Core.firstName(""), "");
assert.strictEqual(Core.firstName(null), "");
assert.strictEqual(Core.greeting({ displayName: "  Vinicio Melo " }), "Olá, Vinicio!");
assert.strictEqual(Core.greeting({ metadataName: " João Pedro Silva " }), "Olá, João!");
assert.strictEqual(Core.greeting({}), "Olá!");
assert.strictEqual(Core.greeting({ displayName: "   " }), "Olá!");
assert.ok(!Core.greeting({}).includes("undefined"));
assert.ok(!Core.greeting({}).includes("null"));

assert.match(cloud, /function getCurrentUserIdentity\(\)/);
assert.match(cloud, /state\.profiles\.get\(user\.id\)/);
assert.match(cloud, /metadata\.full_name \|\| metadata\.name \|\| metadata\.display_name/);
assert.match(cloud, /getCurrentUserIdentity,/);

assert.match(loader, /grcon_mascot_greeting_core\.js/);
assert.match(loader, /grcon_mascot_greeting\.js/);
assert.match(ui, /\.grcon-brand-mascot, \.grcon-mascot-context/);
assert.match(ui, /pointerenter/);
assert.match(ui, /pointerleave/);
assert.match(ui, /event\.pointerType !== "touch"/);
assert.match(ui, /event\.key === "Enter" \|\| event\.key === " "/);
assert.match(ui, /event\.key === "Escape"/);
assert.match(ui, /prefers-reduced-motion: reduce/);
assert.match(ui, /position: fixed/);
assert.match(ui, /z-index: 340/);
assert.match(ui, /clamp\(left, EDGE_GAP, viewportWidth - width - EDGE_GAP\)/);
assert.match(ui, /clamp\(top, EDGE_GAP, viewportHeight - height - EDGE_GAP\)/);
assert.match(ui, /placement = roomAbove >= height \+ MASCOT_GAP \|\| roomAbove >= roomBelow \? "top" : "bottom"/);
assert.match(ui, /data-placement="bottom"/);
assert.match(ui, /pinnedMascot && pinnedMascot !== mascot && !options\?\.pinned/);
assert.match(ui, /hideGreeting\(pinnedMascot, \{ force: true \}\)/);
assert.match(ui, /translate3d\(0, -4px, 0\) scale\(1\.008\)/);
assert.match(ui, /rotate\(1\.6deg\)/);
assert.match(ui, /cubic-bezier\(\.18, \.89, \.32, 1\.14\)/);
assert.match(ui, /transition-delay: 70ms, 55ms, 0s/);
assert.doesNotMatch(ui, /requestAnimationFrame\s*\([^)]*requestAnimationFrame/);
assert.doesNotMatch(ui, /is-greeting-active[^{}]*\{[^}]*infinite/s);
assert.strictEqual((ui.match(/\binfinite\b/g) || []).length, 3, "somente corrida por quadros, linhas e esfera podem repetir");
assert.doesNotMatch(ui, /Cumprimentar|setAttribute\("title"/);
assert.match(ui, /mascot\.removeAttribute\("title"\)/);
assert.match(ui, /\.grcon-mascot-context\.is-processing\[data-pose="pending"\] \.grcon-mascot-processing-orb/);
assert.match(ui, /mask-image: radial-gradient\(circle at 80% 43%/);
assert.match(ui, /grcon-mascot-pose-motion/);
assert.doesNotMatch(ui, /--grcon-pose-animation/);
assert.doesNotMatch(ui, /@keyframes grcon-mascot-pose-/);
assert.match(ui, /html\[data-grcon-mascot-asset="sprite-hd-file-v1"\]/);
assert.match(ui, /clip-path: circle\(12% at 80% 43%\)/);
assert.match(ui, /processingOrb\.className = "grcon-mascot-sprite grcon-mascot-processing-orb"/);
assert.match(ui, /\(poseMotion \|\| motion \|\| mascot\)\.appendChild\(processingOrb\)/);
assert.match(ui, /animation: grcon-mascot-orb-spin 840ms cubic-bezier/);
assert.match(ui, /animation: grcon-mascot-frame-run 720ms step-end infinite/);
assert.doesNotMatch(ui, /animation: grcon-mascot-working-run/);
assert.doesNotMatch(ui, /\.grcon-mascot-context\.is-processing \.grcon-mascot-motion\s*\{\s*animation:/);
assert.match(ui, /background-size: 800% 100%/);
assert.match(ui, /background-position: 14\.285714% 0/);
assert.match(ui, /background-position: 100% 0/);
assert.match(ui, /grcon-mascot-generated-run/);
assert.match(ui, /grcon-mascot-generated-wave/);
assert.match(ui, /grcon-mascot-generated-analyze/);
assert.match(ui, /grcon-mascot-generated-success/);
assert.match(ui, /Object\.values\(GENERATED_ASSETS\)/);
assert.match(ui, /animation: grcon-mascot-speed-lines 620ms ease-in-out/);
assert.doesNotMatch(ui, /grcon-mascot-working-run/);
const runFrames = ui.match(/@keyframes grcon-mascot-frame-run \{([\s\S]*?)\n      \}/)?.[1] || "";
assert.strictEqual((runFrames.match(/background-position:/g) || []).length, 8, "corrida deve usar oito quadros distintos");
assert.match(ui, /opacity: \.68/);
assert.match(ui, /processingPose = mascot\.dataset\.pose === "pending" \|\| mascot\.dataset\.pose === "analysis"/);
assert.match(ui, /grcon:processing-state/);
assert.match(ui, /grcon:processing-pulse/);
assert.match(ui, /signaledControl \|\| \(fallbackBusy && processingPose\)/);
assert.match(ui, /Date\.now\(\) \+ 1100/);
assert.match(app, /signalMascotProcessing\(busy, taskLabel\)/);
assert.match(app, /async function analyze\(\) \{[\s\S]{0,220}pulseMascotProcessing\(\)/);
assert.match(app, /context: "control"/);
assert.match(app, /dataset\.grconControlProcessing = String\(nextActive\)/);
assert.match(app, /dataset\.grconControlProcessingUntil = String\(Date\.now\(\) \+ safeDuration\)/);
assert.match(ui, /function durableProcessingState\(\)/);
assert.match(ui, /observer\.observe\(document\.documentElement/);
assert.match(ui, /diagnostics,/);
const mascotHeaderIndex = index.indexOf('src="grcon_mascot_header.js"');
const mascotAssetIndex = index.indexOf('src="grcon_mascot_asset_fix.js"');
const mascotCoreIndex = index.indexOf('src="grcon_mascot_greeting_core.js"');
const mascotGreetingIndex = index.indexOf('src="grcon_mascot_greeting.js"');
const appIndex = index.indexOf('src="app.js"');
assert.ok(mascotHeaderIndex >= 0 && mascotHeaderIndex < appIndex);
assert.ok(mascotAssetIndex > mascotHeaderIndex && mascotAssetIndex < appIndex);
assert.ok(mascotCoreIndex > mascotAssetIndex && mascotCoreIndex < appIndex);
assert.ok(mascotGreetingIndex > mascotCoreIndex && mascotGreetingIndex < appIndex);
assert.match(ui, /"#progress"/);
assert.match(ui, /"#requests-progress"/);
assert.match(ui, /"#pdf-merge-progress"/);
assert.match(ui, /"#pc-progress"/);
assert.match(ui, /"#spw-progress"/);
assert.doesNotMatch(ui, /querySelectorAll\("\.progress, \[id\$=\'progress\'\]"/);
assert.match(ui, /"data-grcon-control-processing"/);
assert.match(ui, /"data-grcon-control-processing-until"/);
assert.match(ui, /"data-grcon-mascot-asset"/);
assert.match(ui, /!element\.closest\('\[hidden\], \[aria-hidden="true"\]'\)/);
assert.match(ui, /shouldAnimate && mascot\.getAttribute\("aria-busy"\) !== "true"/);
assert.match(ui, /!shouldAnimate && mascot\.hasAttribute\("aria-busy"\)/);
assert.match(ui, /animation: none !important/);
assert.match(ui, /if \(target\.textContent !== nextText\) target\.textContent = nextText/);
assert.match(sw, /mascot-greeting1-processing5-frames1/);
for (const asset of animatedAssets) {
  assert.ok(asset.bytes.length > 30000, `${asset.name} deve manter definição suficiente`);
  assert.strictEqual(asset.bytes.subarray(1, 4).toString("ascii"), "PNG", `${asset.name} deve ser PNG válido`);
  assert.match(ui, new RegExp(asset.name.replaceAll(".", "\\.")));
  assert.match(sw, new RegExp(asset.name.replaceAll(".", "\\.")));
}
assert.doesNotMatch(ui, /fetch\s*\(|XMLHttpRequest|(?:supabase|client|state\.client)\s*\.?\s*\.from\s*\(|getSession\s*\(/);
assert.match(asset, /image-rendering:auto/);
assert.match(asset, /backface-visibility:hidden/);
assert.match(ui, /aria-live/);
assert.match(ui, /aria-expanded/);
assert.match(ui, /role", "button"/);

const poses = [...mascot.matchAll(/(?:default|analysis|search|check|history|dashboard|"sigem-pw"|egrdt|import|report|warning|success|pending|empty|quality):\{/g)];
assert.ok(poses.length >= 15, "todas as poses existentes devem continuar disponíveis");

console.log("grcon_mascot_greeting: OK — carregamento determinístico, assets HD, corrida por quadros, poses geradas, esfera, reduced motion e estabilidade validados.");
