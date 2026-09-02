import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const browserExecutable = process.env.CODEXHOST_PLAYWRIGHT_EXECUTABLE_PATH;
if (browserExecutable) test.use({ launchOptions: { executablePath: browserExecutable } });

const { outputFiles } = await build({
  stdin: {
    contents: `
      import {
        mountRendererModelPicker,
        renderRendererModelPicker,
      } from "./packages/renderer-extension/src/renderer-model-picker.ts";

      globalThis.__codexhostPickerCalls = [];

      globalThis.setupRendererModelPicker = () => {
        const modelA = { id: "model-a" };
        const modelB = { id: "model-b" };
        const catalog = {
          models: [
            {
              ref: modelA,
              label: "Provider / Model A",
              supportedThinkingOptionIds: ["off", "low"],
            },
            {
              ref: modelB,
              label: "Provider / Model B",
              supportedThinkingOptionIds: ["off", "high", "xhigh"],
            },
          ],
          defaultModel: modelA,
          thinkingOptions: [
            { id: "off", label: "Off" },
            { id: "low", label: "Low" },
            { id: "high", label: "High" },
            { id: "xhigh", label: "Extra High" },
          ],
          defaultThinkingOptionId: "low",
        };
        let view = {
          status: "ready",
          catalog,
          selected: modelA,
          selectedThinkingOptionId: "low",
        };
        const record = (type, id) => {
          globalThis.__codexhostPickerCalls.push({ type, id });
        };
        let control;
        const selectModel = (modelId) => {
          record("model", modelId);
          view = { ...view, status: "selecting" };
          renderRendererModelPicker(control, view, true);
          setTimeout(() => {
            view = {
              status: "ready",
              catalog,
              selected: modelId === modelB.id ? modelB : modelA,
              selectedThinkingOptionId: modelId === modelB.id ? "high" : "low",
            };
            renderRendererModelPicker(control, view, true);
          }, 250);
        };
        const selectThinking = (optionId) => {
          record("thinking", optionId);
          view = { ...view, status: "selecting" };
          renderRendererModelPicker(control, view, true);
          setTimeout(() => {
            view = { ...view, status: "ready", selectedThinkingOptionId: optionId };
            renderRendererModelPicker(control, view, true);
          }, 250);
        };
        control = mountRendererModelPicker(
          "test-composer",
          selectModel,
          selectThinking,
          () => record("default"),
        );
        document.body.append(control.root);
        renderRendererModelPicker(control, view, true);
      };

      globalThis.setupClaudeRendererModelPicker = () => {
        const alias = { id: "claude-model-v1.alias" };
        const concrete = { id: "claude-model-v1.concrete" };
        const catalog = {
          models: [
            {
              ref: alias,
              label: "Family alias",
              resolvedModelLabel: "Runtime custom",
              supportedThinkingOptionIds: ["low", "high"],
            },
            {
              ref: concrete,
              label: "Runtime custom",
              resolvedModelLabel: "Runtime custom",
            },
          ],
          defaultModel: alias,
          thinkingOptions: [
            { id: "low", label: "Low" },
            { id: "high", label: "High" },
          ],
        };
        const view = {
          status: "ready",
          catalog,
          selected: alias,
          resolvedModelLabel: "Runtime custom",
          thinkingSelectionSupported: false,
        };
        const control = mountRendererModelPicker(
          "claude-composer",
          () => {},
          () => {},
          () => {},
        );
        document.body.append(control.root);
        renderRendererModelPicker(control, view, true);
      };
    `,
    resolveDir: repositoryRoot,
    sourcefile: "renderer-model-picker-e2e-entry.ts",
    loader: "ts",
  },
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2024",
  loader: { ".css": "text", ".png": "dataurl", ".svg": "dataurl" },
  write: false,
});

const browserBundle = outputFiles[0]?.text;
if (!browserBundle) throw new Error("Renderer Model picker E2E bundle was not generated");

test("opens the Model list first, shows a per-model strength card on hover, and combines Model + tier in one gesture", async ({
  page,
}) => {
  await page.setContent(
    '<!doctype html><body style="display:flex;align-items:flex-end;min-height:100vh;margin:0"></body>',
  );
  await page.addScriptTag({ content: browserBundle });
  await page.evaluate(() => {
    const setup = Reflect.get(globalThis, "setupRendererModelPicker");
    if (typeof setup !== "function") throw new Error("Model picker setup is unavailable");
    setup();
  });

  const root = page.locator('[data-codexhost-model-control="test-composer"]');
  const trigger = root.locator(':scope > button[aria-haspopup="menu"]');
  const modelList = page.locator('[aria-label="Model"]');
  const card = page.locator('[aria-label="推理强度"]');

  // Flipped hierarchy: the trigger opens the Model list directly. There is no
  // persistent thinking-strength layer, and no tier button exists until a model
  // row is hovered (the card DOM is built lazily).
  await trigger.click();
  await expect(modelList).toBeVisible();
  await expect(page.locator('[aria-label="Model and Thinking"]')).toHaveCount(0);
  await expect(page.locator("button[data-thinking-option-id]")).toHaveCount(0);
  await expect(modelList.locator("button[data-model-id]")).toHaveCount(2);

  const [triggerBox, listBox] = await Promise.all([trigger.boundingBox(), modelList.boundingBox()]);
  if (!triggerBox || !listBox) throw new Error("Model picker geometry is unavailable");
  expect(listBox.y + listBox.height).toBeLessThanOrEqual(triggerBox.y + 1);
  expect(listBox.height).toBeLessThanOrEqual(360);

  // Hovering a row opens the strength card for THAT model, anchored to the
  // row's right edge. Only the unified scale plus the default row are listed;
  // "off" is not a unified tier and appears only as the default caption.
  const modelBRow = modelList.locator('button[data-model-id="model-b"]');
  await modelBRow.hover();
  await expect(card).toBeVisible();
  await expect(card).toContainText("Provider / Model B");
  const tierRows = card.locator("button[data-thinking-option-id]");
  await expect(tierRows).toHaveCount(2);
  await expect
    .poll(() =>
      tierRows.evaluateAll((rows) =>
        rows.map((row) => row.getAttribute("data-thinking-option-id")),
      ),
    )
    .toEqual(["high", "xhigh"]);
  await expect(card.locator("button[data-thinking-default]")).toContainText("默认 · Off");
  const [rowBox, cardBox] = await Promise.all([modelBRow.boundingBox(), card.boundingBox()]);
  if (!rowBox || !cardBox) throw new Error("Strength card geometry is unavailable");
  expect(cardBox.x).toBeCloseTo(rowBox.x + rowBox.width + 4, 0);
  expect(cardBox.y).toBeCloseTo(rowBox.y, 0);
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(viewportWidth - 8);

  // One gesture on a tier of a model that is NOT currently selected selects
  // both the model and the tier, then closes every layer.
  await card.locator('button[data-thinking-option-id="xhigh"]').click();
  await expect(modelList).toBeHidden();
  await expect(card).toBeHidden();
  await expect(page.locator("button[data-thinking-option-id]")).toHaveCount(0);
  await expect(trigger).toBeEnabled();
  await expect(trigger).toContainText("Provider / Model B");
  await expect(trigger).toContainText("超高");
  await expect
    .poll(() => page.evaluate(() => Reflect.get(globalThis, "__codexhostPickerCalls")))
    .toEqual([
      { type: "model", id: "model-b" },
      { type: "thinking", id: "xhigh" },
    ]);

  // Selecting a model row directly also closes the picker and updates the chip.
  await trigger.click();
  await expect(modelList).toBeVisible();
  await modelList.locator('button[data-model-id="model-a"]').click();
  await expect(modelList).toBeHidden();
  await expect(card).toBeHidden();
  await expect(trigger).toContainText("Provider / Model A");
  await expect(trigger).not.toContainText("Provider / Model B");
  await expect(page.locator("button[data-thinking-option-id]")).toHaveCount(0);
});

test("Claude aliases open the Model list without exposing a Thinking card", async ({ page }) => {
  await page.setContent(`
    <!doctype html>
    <style>
      .native-model-trigger {
        display: flex;
        width: 100%;
        gap: 4px;
        padding: 4px 8px;
      }
    </style>
    <body style="display:flex;align-items:flex-end;min-height:100vh;margin:0"></body>
  `);
  await page.addScriptTag({ content: browserBundle });
  await page.evaluate(() => {
    const setup = Reflect.get(globalThis, "setupClaudeRendererModelPicker");
    if (typeof setup !== "function") throw new Error("Claude Model picker setup is unavailable");
    setup();
  });

  const root = page.locator('[data-codexhost-model-control="claude-composer"]');
  const trigger = root.locator(':scope > button[aria-haspopup="menu"]');
  await expect(trigger).toContainText("Family alias");
  await expect(trigger).toContainText("Runtime custom");
  await expect(trigger).not.toContainText("⌄");
  await expect(trigger).toHaveAttribute("aria-label", /Family alias, Runtime custom/u);
  const secondaryLabel = trigger.locator("span").last();
  const [labelTriggerBox, secondaryLabelBox] = await Promise.all([
    trigger.boundingBox(),
    secondaryLabel.boundingBox(),
  ]);
  if (!labelTriggerBox || !secondaryLabelBox)
    throw new Error("Model trigger geometry is unavailable");
  const trailingSpace =
    labelTriggerBox.x + labelTriggerBox.width - (secondaryLabelBox.x + secondaryLabelBox.width);
  expect(trailingSpace).toBeLessThanOrEqual(16);

  await trigger.click();
  const modelList = page.locator('[aria-label="Model"]');
  await expect(modelList).toBeVisible();
  await expect(page.locator('[aria-label="Model and Thinking"]')).toHaveCount(0);
  await expect(modelList.locator("button[data-model-id]")).toHaveCount(2);

  // With picker-level Thinking support off, hovering any model row must never
  // produce a strength card.
  await modelList.locator('button[data-model-id="claude-model-v1.alias"]').hover();
  await modelList.locator('button[data-model-id="claude-model-v1.concrete"]').hover();
  await expect(page.locator("button[data-thinking-option-id]")).toHaveCount(0);
  await expect(page.locator('[aria-label="推理强度"]')).toBeHidden();

  const [triggerBox, listBox] = await Promise.all([trigger.boundingBox(), modelList.boundingBox()]);
  if (!triggerBox || !listBox) throw new Error("Model picker geometry is unavailable");
  expect(listBox.y + listBox.height).toBeLessThanOrEqual(triggerBox.y + 1);
  expect(listBox.height).toBeLessThanOrEqual(360);
  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  expect(listBox.x + listBox.width).toBeLessThanOrEqual(viewport.width - 8);
  expect(listBox.y).toBeGreaterThanOrEqual(8);
  expect(listBox.y + listBox.height).toBeLessThanOrEqual(viewport.height - 8);
  await expect(root).not.toContainText("claude-model-v1");
});
