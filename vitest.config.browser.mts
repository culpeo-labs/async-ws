import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ["test/**/*.browser.test.ts"],
    alias: {
      "./ws/websocket": path.resolve(__dirname, "src/ws/websocket-browser.ts"),
    },
    globalSetup: ["test/helpers/ws-server.ts"],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
      screenshotFailures: false,
    },
  },
});
