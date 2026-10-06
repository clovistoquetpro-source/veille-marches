import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // DuckDB ne sert qu'aux scripts d'import : il ne doit jamais être embarqué dans le site.
  serverExternalPackages: ["@duckdb/node-api"],
};

export default nextConfig;
