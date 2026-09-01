import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // libsql はネイティブモジュールを含むためサーバー側でそのまま読み込む
  serverExternalPackages: ["@libsql/client", "nodemailer"],
};

export default nextConfig;
