import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import path from "path";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const BACKEND_INTERNAL_URL =
  process.env.INTERNAL_API_URL?.replace(/\/v1\/?$/, '') ||
  process.env.BACKEND_INTERNAL_URL ||
  "http://127.0.0.1:8080";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: path.resolve(__dirname, "../../"),
  },
  allowedDevOrigins: [
    "klados.app",
    "*.klados.app",
    "*.trycloudflare.com",
  ],
  async rewrites() {
    return [
      {
        source: "/v1/:path*",
        destination: `${BACKEND_INTERNAL_URL}/v1/:path*`,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
