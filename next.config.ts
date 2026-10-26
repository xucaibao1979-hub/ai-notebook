import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.platform === 'win32' ? undefined : 'standalone',
  devIndicators: false,
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
};

export default nextConfig;
