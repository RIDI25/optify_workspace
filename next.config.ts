import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // 상위 디렉터리의 lockfile 때문에 워크스페이스 루트가 잘못 잡히는 것을 방지.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
