export function developmentEnvironment(service, source = process.env) {
  const ui = [
    'PATH',
    'NODE_ENV',
    'PUBLIC_ORIGIN',
    'PORTAL_ORIGIN',
    'STAFF_ORIGIN',
    'API_INTERNAL_URL',
    'INTERNAL_API_KEY',
  ];
  const keys =
    service === '@cornerstone/worker'
      ? [
          'PATH',
          'NODE_ENV',
          'CORNERSTONE_MODE',
          'DATA_REALM',
          'WORKER_DATABASE_URL',
          'NOTIFICATION_PROVIDER',
        ]
      : service === '@cornerstone/api'
        ? Object.keys(source).filter(
            (k) =>
              ![
                'MIGRATION_DATABASE_URL',
                'WORKER_DATABASE_URL',
                'LOCAL_DATABASE_PASSWORD',
              ].includes(k),
          )
        : service === '@cornerstone/web'
          ? ['PATH', 'NODE_ENV', 'PUBLIC_ORIGIN']
          : ui;
  return {
    ...Object.fromEntries(keys.filter((k) => source[k]).map((k) => [k, source[k]])),
    NEXT_TELEMETRY_DISABLED: '1',
  };
}
