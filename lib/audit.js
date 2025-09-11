/**
 * Security audit logging
 * Tracks all security-related events for compliance and monitoring
 */

import { getFirestore } from './firebase-init.js';
import logger from './logger.js';
import config from './config.js';

/**
 * Security event types
 */
export const SecurityEventTypes = {
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILED: 'login_failed',
  LOGOUT: 'logout',
  TOKEN_REFRESH: 'token_refresh',
  TOKEN_INVALID: 'token_invalid',
  PERMISSION_DENIED: 'permission_denied',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  SUSPICIOUS_ACTIVITY: 'suspicious_activity',
  DATA_ACCESS: 'data_access',
  DATA_MODIFICATION: 'data_modification',
  DATA_DELETION: 'data_deletion',
  ADMIN_ACTION: 'admin_action',
  API_KEY_USED: 'api_key_used',
  VOTE_CAST: 'vote_cast',
  WALLET_VERIFIED: 'wallet_verified',
  REGISTRATION: 'registration',
  PASSWORD_CHANGE: 'password_change',
  ACCOUNT_LOCKED: 'account_locked',
  SQL_INJECTION_ATTEMPT: 'sql_injection_attempt',
  XSS_ATTEMPT: 'xss_attempt',
  CSRF_ATTEMPT: 'csrf_attempt',
  BRUTE_FORCE_ATTEMPT: 'brute_force_attempt'
};

/**
 * Risk levels
 */
export const RiskLevels = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Audit logger class
 */
class AuditLogger {
  constructor() {
    this.buffer = [];
    this.flushInterval = 5000; // Flush every 5 seconds
    this.maxBufferSize = 100;
    this.setupFlushInterval();
  }

  /**
   * Log security event
   */
  async logSecurityEvent({
    eventType,
    userId = null,
    ip = null,
    userAgent = null,
    details = {},
    riskLevel = RiskLevels.LOW,
    success = true
  }) {
    const event = {
      eventType,
      userId,
      ip: this.sanitizeIp(ip),
      userAgent: this.sanitizeUserAgent(userAgent),
      details: this.sanitizeDetails(details),
      riskLevel,
      success,
      timestamp: new Date().toISOString(),
      environment: config.get('NODE_ENV')
    };

    // Log to console/file
    logger.logSecurityEvent(eventType, event);

    // Add to buffer for database write
    this.buffer.push(event);

    // Flush if buffer is full
    if (this.buffer.length >= this.maxBufferSize) {
      await this.flush();
    }

    // For critical events, flush immediately
    if (riskLevel === RiskLevels.CRITICAL) {
      await this.flush();
    }

    return event;
  }

  /**
   * Log login attempt
   */
  async logLoginAttempt(userId, ip, success, details = {}) {
    return this.logSecurityEvent({
      eventType: success ? SecurityEventTypes.LOGIN_SUCCESS : SecurityEventTypes.LOGIN_FAILED,
      userId,
      ip,
      details,
      riskLevel: success ? RiskLevels.LOW : RiskLevels.MEDIUM,
      success
    });
  }

  /**
   * Log data access
   */
  async logDataAccess(userId, resource, action, ip, details = {}) {
    return this.logSecurityEvent({
      eventType: SecurityEventTypes.DATA_ACCESS,
      userId,
      ip,
      details: { resource, action, ...details },
      riskLevel: RiskLevels.LOW,
      success: true
    });
  }

  /**
   * Log suspicious activity
   */
  async logSuspiciousActivity(ip, activity, details = {}) {
    return this.logSecurityEvent({
      eventType: SecurityEventTypes.SUSPICIOUS_ACTIVITY,
      ip,
      details: { activity, ...details },
      riskLevel: RiskLevels.HIGH,
      success: false
    });
  }

  /**
   * Log rate limit exceeded
   */
  async logRateLimitExceeded(ip, endpoint, details = {}) {
    return this.logSecurityEvent({
      eventType: SecurityEventTypes.RATE_LIMIT_EXCEEDED,
      ip,
      details: { endpoint, ...details },
      riskLevel: RiskLevels.MEDIUM,
      success: false
    });
  }

  /**
   * Log admin action
   */
  async logAdminAction(adminId, action, targetUserId, ip, details = {}) {
    return this.logSecurityEvent({
      eventType: SecurityEventTypes.ADMIN_ACTION,
      userId: adminId,
      ip,
      details: { action, targetUserId, ...details },
      riskLevel: RiskLevels.MEDIUM,
      success: true
    });
  }

  /**
   * Sanitize IP address
   */
  sanitizeIp(ip) {
    if (!ip) return 'unknown';
    
    // Remove port if present
    const cleanIp = ip.split(':').slice(0, -1).join(':') || ip;
    
    // Basic validation
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    
    if (ipv4Regex.test(cleanIp) || ipv6Regex.test(cleanIp)) {
      return cleanIp;
    }
    
    return 'invalid';
  }

  /**
   * Sanitize user agent
   */
  sanitizeUserAgent(userAgent) {
    if (!userAgent) return 'unknown';
    
    // Truncate long user agents
    return userAgent.substring(0, 500);
  }

  /**
   * Sanitize event details
   */
  sanitizeDetails(details) {
    const sanitized = {};
    
    for (const [key, value] of Object.entries(details)) {
      // Skip sensitive fields
      if (['password', 'token', 'secret', 'apiKey'].includes(key)) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string') {
        // Truncate long strings
        sanitized[key] = value.substring(0, 1000);
      } else if (typeof value === 'object' && value !== null) {
        // Recursively sanitize objects
        sanitized[key] = this.sanitizeDetails(value);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  /**
   * Setup flush interval
   */
  setupFlushInterval() {
    if (typeof setInterval !== 'undefined') {
      setInterval(() => {
        if (this.buffer.length > 0) {
          this.flush().catch(err => {
            logger.error('Failed to flush audit logs', { error: err.message });
          });
        }
      }, this.flushInterval);
    }
  }

  /**
   * Flush buffer to database
   */
  async flush() {
    if (this.buffer.length === 0) return;
    
    const events = [...this.buffer];
    this.buffer = [];
    
    try {
      const firestore = getFirestore();
      if (!firestore) {
        logger.error('Firestore not available for audit logging');
        return;
      }
      
      // Batch write to Firestore
      const batch = firestore.batch();
      const auditCollection = firestore.collection('audit_logs');
      
      for (const event of events) {
        const docRef = auditCollection.doc();
        batch.set(docRef, {
          ...event,
          createdAt: new Date()
        });
      }
      
      await batch.commit();
      logger.debug(`Flushed ${events.length} audit events to database`);
      
    } catch (error) {
      logger.error('Failed to write audit logs to database', { 
        error: error.message,
        eventsLost: events.length 
      });
      
      // In production, consider sending to external service
      if (config.isProduction()) {
        // TODO: Send to external logging service
      }
    }
  }

  /**
   * Query audit logs
   */
  async queryLogs(filters = {}) {
    try {
      const firestore = getFirestore();
      if (!firestore) {
        throw new Error('Firestore not available');
      }
      
      let query = firestore.collection('audit_logs');
      
      // Apply filters
      if (filters.userId) {
        query = query.where('userId', '==', filters.userId);
      }
      
      if (filters.eventType) {
        query = query.where('eventType', '==', filters.eventType);
      }
      
      if (filters.riskLevel) {
        query = query.where('riskLevel', '==', filters.riskLevel);
      }
      
      if (filters.startDate) {
        query = query.where('timestamp', '>=', filters.startDate);
      }
      
      if (filters.endDate) {
        query = query.where('timestamp', '<=', filters.endDate);
      }
      
      // Order and limit
      query = query.orderBy('timestamp', 'desc');
      
      if (filters.limit) {
        query = query.limit(filters.limit);
      } else {
        query = query.limit(100);
      }
      
      const snapshot = await query.get();
      const logs = [];
      
      snapshot.forEach(doc => {
        logs.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return logs;
      
    } catch (error) {
      logger.error('Failed to query audit logs', { error: error.message });
      throw error;
    }
  }

  /**
   * Get security metrics
   */
  async getSecurityMetrics(timeRange = '24h') {
    try {
      const now = new Date();
      let startDate;
      
      switch (timeRange) {
        case '1h':
          startDate = new Date(now - 60 * 60 * 1000);
          break;
        case '24h':
          startDate = new Date(now - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(now - 24 * 60 * 60 * 1000);
      }
      
      const logs = await this.queryLogs({
        startDate: startDate.toISOString(),
        limit: 1000
      });
      
      // Calculate metrics
      const metrics = {
        totalEvents: logs.length,
        failedLogins: logs.filter(l => l.eventType === SecurityEventTypes.LOGIN_FAILED).length,
        successfulLogins: logs.filter(l => l.eventType === SecurityEventTypes.LOGIN_SUCCESS).length,
        rateLimitHits: logs.filter(l => l.eventType === SecurityEventTypes.RATE_LIMIT_EXCEEDED).length,
        suspiciousActivities: logs.filter(l => l.eventType === SecurityEventTypes.SUSPICIOUS_ACTIVITY).length,
        criticalEvents: logs.filter(l => l.riskLevel === RiskLevels.CRITICAL).length,
        highRiskEvents: logs.filter(l => l.riskLevel === RiskLevels.HIGH).length,
        uniqueUsers: new Set(logs.map(l => l.userId).filter(Boolean)).size,
        uniqueIps: new Set(logs.map(l => l.ip).filter(Boolean)).size
      };
      
      return metrics;
      
    } catch (error) {
      logger.error('Failed to calculate security metrics', { error: error.message });
      throw error;
    }
  }
}

// Create singleton instance
const auditLogger = new AuditLogger();

// Export instance and types
export default auditLogger;
export { auditLogger, AuditLogger };
