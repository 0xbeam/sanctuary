/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    externalDir: true
  },
  transpilePackages: ["@open-pencil/core", "@polaris/compiler", "@polaris/layer-store"]
}

export default nextConfig
