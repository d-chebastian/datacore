type LogFields = Record<string, unknown>;

function log(level: 'info' | 'warn' | 'error', message: string, fields?: LogFields): void {
  const entry = { level, message, timestamp: new Date().toISOString(), ...fields };
  // eslint-disable-next-line no-console
  console[level === 'error' ? 'error' : 'log'](JSON.stringify(entry));
}

export const logger = {
  info: (message: string, fields?: LogFields) => log('info', message, fields),
  warn: (message: string, fields?: LogFields) => log('warn', message, fields),
  error: (message: string, fields?: LogFields) => log('error', message, fields),
};
