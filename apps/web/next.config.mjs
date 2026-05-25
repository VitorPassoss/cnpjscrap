/** @type {import('next').NextConfig} */
export default {
  transpilePackages: ['@cnpjscrap/db', '@cnpjscrap/shared'],
  experimental: { typedRoutes: true },
};
