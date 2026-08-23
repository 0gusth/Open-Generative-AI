/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['studio', 'ai-agent', 'workflow-builder', 'design-agent'],
  // A verification build must not write into the directory the running dev
  // server is serving from — doing so leaves it throwing 500s until someone
  // restarts it. `npm run check` sets this; Vercel never does, so the cloud
  // build is untouched.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};

export default nextConfig;
