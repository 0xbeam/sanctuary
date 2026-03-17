/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    externalDir: true
  },
  transpilePackages: ["@polaris/compiler", "@polaris/layer-store"]
}

export default nextConfig
