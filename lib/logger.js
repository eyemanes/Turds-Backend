/**
 * Enhanced logging utility with security features
 * - Redacts sensitive information
 * - Implements log levels
 * - Provides structured logging
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const currentLogLevel = process.env.LOG_LEVEL ? 
  LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] || LOG_LEVELS.INFO : 
  (process.env.NODE_ENV === 'production' ? LOG_LEVELS.WARN : LOG_LEVELS.DEBUG);

/**
 * Redact sensitive information from objects
 */
function redactSensitiveData(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  const sensitiveKeys = [
    'password', 'token', 'apiKey', 'secret', 'authorization',
    'cookie', 'session', 'privateKey', 'clientSecret', 'refreshToken',
    'accessToken', 'idToken', 'creditCard', 'ssn', 'email'
  ];

  const redacted = Array.isArray(obj) ? [] : {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    
    if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSensitiveData(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Format log message with timestamp and level
 */
function formatLogMessage(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const logData = {
    timestamp,
    level,
    message,
    ...redactSensitiveData(meta)
  };

  if (process.env.NODE_ENV === 'production') {
    return JSON.stringify(logData);
  } else {
    // Pretty print for development
    return `[${timestamp}] [${level}] ${message} ${Object.keys(meta).length > 0 ? JSON.stringify(redactSensitiveData(meta), null, 2) : ''}`;
  }
}

/**
 * Main logger class
 */
class Logger {
  error(message, meta = {}) {
    if (currentLogLevel >= LOG_LEVELS.ERROR) {
      console.error(formatLogMessage('ERROR', message, meta));
    }
  }

  warn(message, meta = {}) {
    if (currentLogLevel >= LOG_LEVELS.WARN) {
      console.warn(formatLogMessage('WARN', message, meta));
    }
  }

  info(message, meta = {}) {
    if (currentLogLevel >= LOG_LEVELS.INFO) {
      console.log(formatLogMessage('INFO', message, meta));
    }
  }

  debug(message, meta = {}) {
    if (currentLogLevel >= LOG_LEVELS.DEBUG) {
      console.log(formatLogMessage('DEBUG', message, meta));
    }
  }

  /**
   * Log errors with stack traces
   */
  logError(error, context = '') {
    const errorInfo = {
      message: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
      context,
      timestamp: new Date().toISOString()
    };

    this.error(`Error in ${context}`, errorInfo);
  }

  /**
   * Log API requests (with sensitive data redacted)
   */
  logRequest(req, context = '') {
    if (currentLogLevel < LOG_LEVELS.INFO) return;

    const requestInfo = {
      method: req.method,
      url: req.url,
      ip: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      context
    };

    // Don't log body in production for security
    if (process.env.NODE_ENV !== 'production' && req.body) {
      requestInfo.body = redactSensitiveData(req.body);
    }

    this.info('API Request', requestInfo);
  }

  /**
   * Log security events
   */
  logSecurityEvent(event, details = {}) {
    const securityInfo = {
      event,
      ...redactSensitiveData(details),
      timestamp: new Date().toISOString()
    };

    this.warn(`SECURITY: ${event}`, securityInfo);
  }

  /**
   * Log performance metrics
   */
  logPerformance(operation, duration, meta = {}) {
    if (currentLogLevel < LOG_LEVELS.INFO) return;

    this.info(`Performance: ${operation}`, {
      duration: `${duration}ms`,
      ...meta
    });
  }

  /**
   * Create audit log entry
   */
  async createAuditLog(action, userId, details = {}) {
    try {
      // This would write to a database in production
      const auditEntry = {
        action,
        userId,
        details: redactSensitiveData(details),
        timestamp: new Date().toISOString(),
        ip: details.ip || 'unknown'
      };

      this.info('Audit Log', auditEntry);

      // In production, write to database
      if (process.env.NODE_ENV === 'production') {
        // TODO: Write to Firestore audit_logs collection
      }
    } catch (error) {
      this.error('Failed to create audit log', { error: error.message });
    }
  }
}

// Create singleton instance
const logger = new Logger();

// Export both the class and instance
export { Logger, LOG_LEVELS };
export default logger;
