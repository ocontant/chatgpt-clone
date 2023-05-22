const fs = require('fs');
const yaml = require('js-yaml');
const pino = process.env.NODE_ENV === 'development' ? require('pino-caller')(require('pino')(), { relativeTo: __dirname }) : require('pino')()
const pinoms = require('pino-multi-stream').multistream
const pinoFluent = require('pino-fluentd')
const pinoSocket = require('pino-socket')
const pinoLambda = require('pino-lambda')
const pinomongodb = require('pino-mongodb')
const pinoPretty = require('pino-pretty')

const levels = {
  TRACE:  10,
  DEBUG:  20,
  INFO:   30,
  WARN:   40,
  ERROR:  50,
  FATAL:  60
};

// Read configuration file
let config;
try {
  config = yaml.safeLoad(fs.readFileSync('../conf/logging-conf.yaml', 'utf8'));
} catch (e) {
  throw new Error(`Failed to load configuration from config.yaml. Please make sure the file exists and is correctly formatted. Original error: ${e.message}`);
}

// Convert the redactPatterns to a map of regular expressions objects
const redactPatterns = config.redactPatterns.map(pattern => new RegExp(pattern, 'i'));

// Create an array to hold your log streams
let streams = []

// For each output destination, if it is enabled in the config,
// create a new stream and push it into the streams array
if (config.output.console) {
  const prettyStream = pinoPretty({ colorize: true, translateTime: 'yyyy-mm-dd HH:MM:ss' });
  streams.push({ stream: prettyStream, level: process.env.LEVEL })
}
if (config.output.fluentd.enabled) {
  let fluentTransport = pinoFluent({ tag: config.output.fluentd.tag, server: config.output.fluentd.server })
  streams.push({ stream: fluentTransport, level: process.env.LEVEL })
}
if (config.output.syslog.enabled) {
  let syslogTransport = pinoSocket({ address: config.output.syslog.address, port: config.output.syslog.port })
  streams.push({ stream: syslogTransport, level: process.env.LEVEL })
}
if (config.output.lambda.enabled) {
  let lambdaTransport = pinoLambda()
  streams.push({ stream: lambdaTransport, level: process.env.LEVEL })
}
if (config.output.mongodb.enabled) {
  let mongodbTransport = pinomongodb({ mongoURL: config.output.mongodb.mongoURL })
  streams.push({ stream: mongodbTransport, level: process.env.LEVEL })
}


const logger = pino({
  redact: {                       // See example to filter object class instances directly
    paths: config.redactedPaths,  // List of Paths to redact from the logs (https://getpino.io/#/docs/redaction)
    censor: '***',                // Redaction characters
  },
}, pinoms(streams));              // Output to all streams in the streams array enabled in ./app/config/logging-conf.yaml

/*
  // Example of redacting sensitive data from object class instances
  function redactSensitiveData(obj) {
    if (obj instanceof User) {
      return {
        ...obj.toObject(),
        password: '***', // Redact the password field
      };
    }
    return obj;
  }
  logger.info({ newUser: redactSensitiveData(newUser) }, 'newUser');
*/

let level = levels.INFO;

module.exports = {
  levels,
  setLevel: (l) => (level = l),
  log: {
    trace: (msg) => {
      if (level <= levels.TRACE) return;
      logger.trace(msg);
    },
    debug: (msg) => {
      if (level <= levels.DEBUG) return;
      logger.debug(msg);
    },
    info: (msg) => {
      if (level <= levels.INFO) return;
      logger.info(msg);
    },
    warn: (msg) => {
      if (level <= levels.WARN) return;
      logger.warn(msg);
    },
    error: (msg) => {
      if (level <= levels.ERROR) return;
      logger.error(msg);
    },
    fatal: (msg) => {
      if (level <= levels.FATAL) return;
      logger.fatal(msg);
    },

    // Middleware functions to log request and response
    // Logs the request body and query parameters
    // app.use(log.request()); 
    request: () => (req, res, next) => {
      if (level < levels.DEBUG) return next();
      logger.debug({ query: req.query, body: req.body }, `Hit URL ${req.url} with following`);
      return next();
    },

    // Redact variables value if they contain sensitive information
    variable: ({ name, value }) => {
      if (level <= levels.DEBUG) return;
      // Check if the variable name matches any of the redact patterns and redact the value
      let sanitizedValue = value;
      for (const pattern of redactPatterns) {
        if (pattern.test(name)) {
          sanitizedValue = '***';
          break;
        }
      }
      logger.debug({ variable: { name, value: sanitizedValue } }, `VARIABLE ${name}`);
    }

/* TO REMOVE
    parameters: (parameters) => {
      if (level <= levels.TRACE) return;
      logger.debug({ parameters }, 'Function Parameters');
    },
    functionName: (name) => {
      if (level <= levels.TRACE) return;
      logger.debug(`EXECUTING: ${name}`);
    },
    flow: (flow) => {
      if (level <= levels.INFO) return;
      logger.debug(`BEGIN FLOW: ${flow}`);
    }, 
*/
  }
};

