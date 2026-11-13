/** @type {import('next').NextConfig} */
const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:4000";

export default {
  reactStrictMode: true,
  transpilePackages: ["@daveup/shared"],
  // Same-origin API: the browser calls /api/*, Next forwards to the API server,
  // so the httpOnly session cookie works without CORS.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/:path*` }];
  },
};
