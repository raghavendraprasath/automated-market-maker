import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Hardhat project one level up has its own lockfile; pin the app root so the
  // bundler does not treat the repository root as the workspace root.
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
};

export default nextConfig;
