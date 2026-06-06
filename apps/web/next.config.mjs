/** @type {import('next').NextConfig} */
export default {
  transpilePackages: ['@cnpjscrap/db', '@cnpjscrap/shared'],
  serverExternalPackages: ['pg', 'tailwindcss', 'postcss', 'autoprefixer'],
  typedRoutes: true,
};
