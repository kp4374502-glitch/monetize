/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Analytics-proof screenshots are uploaded through a Server Action (max 4 MB file; Vercel caps request
    // bodies at 4.5 MB). Next's default of 1 MB would reject ordinary phone screenshots.
    serverActions: { bodySizeLimit: "4.5mb" },
  },
};

export default nextConfig;
