/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: {
    serverActions: { allowedOrigins: ["*"] },
  },
};

module.exports = nextConfig;
