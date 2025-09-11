/**
 * Structured logging utility for production security
 * Replaces console.log with proper logging levels
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const CURRENT_LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'WARN' : 'DEBUG');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

class Logger {
  constructor() {
    this.level = LOG_LEVELS[CURRENT_LOG_LEVEL] || LOG_LEVELS.DEBUG;
  }

  shouldLog(level) {
    return level <= this.level;
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const levelName = Object.keys(LOG_LEVELS)[level];
    
    if (data) {
      return `[${timestamp}] ${levelName}: ${message} ${JSON.stringify(data)}`;
    }
    return `[${timestamp}] ${levelName}: ${message}`;
  }

  error(message, data = null) {
    if (this.shouldLog(LOG_LEVELS.ERROR)) {
      console.error(this.formatMessage(LOG_LEVELS.ERROR, message, data));
    }
  }

  warn(message, data = null) {
    if (this.shouldLog(LOG_LEVELS.WARN)) {
      console.warn(this.formatMessage(LOG_LEVELS.WARN, message, data));
    }
  }

  info(message, data = null) {
    if (this.shouldLog(LOG_LEVELS.INFO)) {
      console.info(this.formatMessage(LOG_LEVELS.INFO, message, data));
    }
  }

  debug(message, data = null) {
    if (this.shouldLog(LOG_LEVELS.DEBUG)) {
      console.log(this.formatMessage(LOG_LEVELS.DEBUG, message, data));
    }
  }

  // Security-aware logging - never logs sensitive data
  logRequest(req, message = 'Request received') {
    if (this.shouldLog(LOG_LEVELS.INFO)) {
      const safeData = {
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent'],
        ip: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown',
        timestamp: new Date().toISOString()
      };
      this.info(message, safeData);
    }
  }

  logError(error, context = '') {
    this.error(`Error${context ? ` in ${context}` : ''}: ${error.message}`, {
      stack: IS_PRODUCTION ? undefined : error.stack,
      name: error.name
    });
  }

  // Audit logging for security events
  logSecurityEvent(event, details = {}) {
    this.warn(`Security Event: ${event}`, {
      ...details,
      timestamp: new Date().toISOString()
    });
  }

  // Performance logging
  logPerformance(operation, duration, details = {}) {
    if (this.shouldLog(LOG_LEVELS.INFO)) {
      this.info(`Performance: ${operation} took ${duration}ms`, details);
    }
  }
}

// Create singleton instance
const logger = new Logger();

// Export both the instance and the class
export default logger;
export { Logger, LOG_LEVELS };
