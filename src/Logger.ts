import { pino } from 'pino';

const __dirname = import.meta.dirname;

const fileTransport = pino.transport({
  target: 'pino/file',
  options: { destination: `${__dirname}/app.log`},
});

export default pino({
    formatters: {
      level: (label) => {
        return {};
      },
      bindings: (bindings) => {
        return {}
      },
  },
}, fileTransport);
