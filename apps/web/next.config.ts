import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import fs from "fs";
import path from "path";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const workspaceRoot = fs.existsSync(path.resolve(__dirname, "../../pnpm-workspace.yaml"))
  ? path.resolve(__dirname, "../../")
  : path.resolve(__dirname);

const BACKEND_INTERNAL_URL =
  process.env.INTERNAL_API_URL?.replace(/\/v1\/?$/, '') ||
  process.env.BACKEND_INTERNAL_URL ||
  (process.env.NODE_ENV === "production" ? "http://api:8080" : "http://127.0.0.1:8080");

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: workspaceRoot,
  },
  allowedDevOrigins: [
    "klados.app",
    "*.klados.app",
    "*.trycloudflare.com",
    ...(process.env.MAIN_DOMAIN ? process.env.MAIN_DOMAIN.split(',').map(d => d.trim()).filter(Boolean) : []),
  ],
  async rewrites() {
    return [
      {
        source: "/v1/:path*",
        destination: `${BACKEND_INTERNAL_URL}/v1/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
