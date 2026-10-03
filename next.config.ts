import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // localhost is allowed by default. 127.0.0.1 is a different host, and Next
  // blocks its dev assets unless it is listed here. Without this, the page
  // renders but clicks never reach React.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
