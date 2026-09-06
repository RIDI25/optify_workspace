import path from "node:path";
import { defineConfig } from "vitest/config";

/** 핵심 규칙(HTML 변환·발행 집계·URL 검사)의 회귀 검증. `npm test` */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
