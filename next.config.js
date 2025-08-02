/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  async redirects() {
    return [
      // Redirect legacy/non-existent auth path to NextAuth's built-in sign-in page
      {
        source: "/auth/signin",
        destination: "/api/auth/signin",
        permanent: false,
      },
    ];
  },
};

export default config;
