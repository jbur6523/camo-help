import { readFileSync } from "node:fs";

const css = readFileSync("app/globals.css", "utf8");
const wizard = readFileSync("components/ApplicationWizard.tsx", "utf8");

const checks: Array<[boolean, string]> = [
  [wizard.includes("<WizardBottomNav"), "ApplicationWizard must use the shared WizardBottomNav component."],
  [!wizard.includes('className="sticky-actions"'), "Old inline sticky-actions footer markup must not return."],
  [css.includes(".wizard-bottom-nav"), "Shared wizard-bottom-nav styles must exist."],
  [css.includes(".wizard-bottom-nav-row"), "Footer must use the centered shared button row."],
  [!css.includes("translateX("), "Footer must not use translateX centering."],
  [!css.includes("width: 100vw"), "Layout must not use 100vw width with padding."],
  [!css.includes("width: 100dvw"), "Footer must not use dynamic viewport width."],
  [css.includes("right: 0"), "Footer wrapper must stay inside the viewport with fixed left/right edges."],
  [css.includes("justify-content: center"), "Footer buttons must be centered."],
  [css.includes("width: min(42vw, 160px)"), "Footer buttons must use equal safe mobile widths."],
  [!css.includes("flex: 1"), "Footer buttons must not grow to fill remaining space."],
  [css.includes("overflow-x: hidden"), "Global horizontal overflow protection must remain."],
  [css.includes("@media (pointer: coarse) and (max-width: 900px)"), "Touch-device mobile footer rule must remain."]
];

const failures = checks.filter(([passed]) => !passed).map(([, message]) => message);

if (failures.length) {
  console.error("Mobile layout regression check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Mobile layout regression check passed.");
