import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: the whole app (including the DuckDB warehouse file served
  // from /public) deploys to any static host -- Vercel, Netlify, S3+CloudFront,
  // GitHub Pages. There is no server: SQL runs in the browser via duckdb-wasm.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
