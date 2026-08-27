/** @type {import('next').NextConfig} */
const nextConfig = {
  // The box's launch.sh looks for a server.js — see sync-infra.sh.
  output: 'standalone',
  reactStrictMode: true,
};
export default nextConfig;
