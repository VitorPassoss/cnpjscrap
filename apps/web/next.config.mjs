/** @type {import('next').NextConfig} */
export default {
  transpilePackages: ['@cnpjscrap/db', '@cnpjscrap/shared'],
  serverExternalPackages: ['pg'],
  typedRoutes: true,
};
