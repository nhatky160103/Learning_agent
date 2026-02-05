/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    output: 'standalone', // Enable for Docker optimization
    async rewrites() {
        return [
            {
                source: '/api/:path*',
                destination: process.env.NEXT_PUBLIC_API_URL
                    ? `${process.env.NEXT_PUBLIC_API_URL}/api/:path*`
                    : 'http://localhost:8001/api/:path*',
            },
        ];
    },
};

module.exports = nextConfig;
