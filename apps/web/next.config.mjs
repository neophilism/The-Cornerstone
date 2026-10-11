export default {
  agentRules: false,
  poweredByHeader: false,
  reactStrictMode: true,
  outputFileTracingIncludes: { '/documents/*': ['../../policy/*'] },
  transpilePackages: [
    '@cornerstone/ui',
    '@cornerstone/content',
    '@cornerstone/i18n',
    '@cornerstone/contracts',
    '@cornerstone/domain',
  ],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};
