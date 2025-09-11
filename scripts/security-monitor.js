#!/usr/bin/env node

/**
 * Security monitoring and alerting script
 * Run this periodically to check for security issues
 */

import { getFirestore } from '../lib/firebase-init.js';
import auditLogger from '../lib/audit.js';
import logger from '../lib/logger.js';
import config from '../lib/config.js';

/**
 * Security thresholds
 */
const THRESHOLDS = {
  MAX_FAILED_LOGINS_PER_HOUR: 10,
  MAX_RATE_LIMIT_HITS_PER_HOUR: 50,
  MAX_SUSPICIOUS_ACTIVITIES_PER_DAY: 5,
  MAX_CRITICAL_EVENTS_PER_DAY: 1,
  MIN_SUCCESS_LOGIN_RATIO: 0.7 // 70% success rate
};

/**
 * Check for security issues
 */
async function checkSecurityIssues() {
  const issues = [];
  
  try {
    // Get metrics for last hour
    const hourlyMetrics = await auditLogger.getSecurityMetrics('1h');
    
    // Get metrics for last 24 hours
    const dailyMetrics = await auditLogger.getSecurityMetrics('24h');
    
    // Check failed login attempts
    if (hourlyMetrics.failedLogins > THRESHOLDS.MAX_FAILED_LOGINS_PER_HOUR) {
      issues.push({
        severity: 'HIGH',
        type: 'BRUTE_FORCE',
        message: `High number of failed login attempts: ${hourlyMetrics.failedLogins} in the last hour`,
        metric: 'failedLogins',
        value: hourlyMetrics.failedLogins,
        threshold: THRESHOLDS.MAX_FAILED_LOGINS_PER_HOUR
      });
    }
    
    // Check rate limit hits
    if (hourlyMetrics.rateLimitHits > THRESHOLDS.MAX_RATE_LIMIT_HITS_PER_HOUR) {
      issues.push({
        severity: 'MEDIUM',
        type: 'RATE_LIMIT_ABUSE',
        message: `High number of rate limit hits: ${hourlyMetrics.rateLimitHits} in the last hour`,
        metric: 'rateLimitHits',
        value: hourlyMetrics.rateLimitHits,
        threshold: THRESHOLDS.MAX_RATE_LIMIT_HITS_PER_HOUR
      });
    }
    
    // Check suspicious activities
    if (dailyMetrics.suspiciousActivities > THRESHOLDS.MAX_SUSPICIOUS_ACTIVITIES_PER_DAY) {
      issues.push({
        severity: 'HIGH',
        type: 'SUSPICIOUS_ACTIVITY',
        message: `Multiple suspicious activities detected: ${dailyMetrics.suspiciousActivities} in the last 24 hours`,
        metric: 'suspiciousActivities',
        value: dailyMetrics.suspiciousActivities,
        threshold: THRESHOLDS.MAX_SUSPICIOUS_ACTIVITIES_PER_DAY
      });
    }
    
    // Check critical events
    if (dailyMetrics.criticalEvents > THRESHOLDS.MAX_CRITICAL_EVENTS_PER_DAY) {
      issues.push({
        severity: 'CRITICAL',
        type: 'CRITICAL_EVENTS',
        message: `Critical security events detected: ${dailyMetrics.criticalEvents} in the last 24 hours`,
        metric: 'criticalEvents',
        value: dailyMetrics.criticalEvents,
        threshold: THRESHOLDS.MAX_CRITICAL_EVENTS_PER_DAY
      });
    }
    
    // Check login success ratio
    if (dailyMetrics.successfulLogins + dailyMetrics.failedLogins > 0) {
      const successRatio = dailyMetrics.successfulLogins / 
                          (dailyMetrics.successfulLogins + dailyMetrics.failedLogins);
      
      if (successRatio < THRESHOLDS.MIN_SUCCESS_LOGIN_RATIO) {
        issues.push({
          severity: 'MEDIUM',
          type: 'LOW_SUCCESS_RATIO',
          message: `Low login success ratio: ${(successRatio * 100).toFixed(2)}%`,
          metric: 'successRatio',
          value: successRatio,
          threshold: THRESHOLDS.MIN_SUCCESS_LOGIN_RATIO
        });
      }
    }
    
    return {
      issues,
      metrics: {
        hourly: hourlyMetrics,
        daily: dailyMetrics
      }
    };
    
  } catch (error) {
    logger.error('Failed to check security issues', { error: error.message });
    throw error;
  }
}

/**
 * Check for suspicious IP addresses
 */
async function checkSuspiciousIPs() {
  try {
    const firestore = getFirestore();
    if (!firestore) {
      throw new Error('Firestore not available');
    }
    
    // Get failed login attempts from last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const snapshot = await firestore.collection('audit_logs')
      .where('eventType', '==', 'login_failed')
      .where('timestamp', '>=', oneHourAgo.toISOString())
      .get();
    
    // Count failures per IP
    const ipFailures = {};
    snapshot.forEach(doc => {
      const data = doc.data();
      const ip = data.ip;
      if (ip && ip !== 'unknown') {
        ipFailures[ip] = (ipFailures[ip] || 0) + 1;
      }
    });
    
    // Find IPs with too many failures
    const suspiciousIPs = [];
    for (const [ip, count] of Object.entries(ipFailures)) {
      if (count >= 5) { // 5 or more failures in an hour
        suspiciousIPs.push({ ip, failureCount: count });
      }
    }
    
    return suspiciousIPs;
    
  } catch (error) {
    logger.error('Failed to check suspicious IPs', { error: error.message });
    throw error;
  }
}

/**
 * Send alert (implement your alerting mechanism)
 */
async function sendAlert(issues, suspiciousIPs) {
  // Log the alert
  logger.warn('SECURITY ALERT', {
    issueCount: issues.length,
    suspiciousIPCount: suspiciousIPs.length,
    issues,
    suspiciousIPs
  });
  
  // In production, send alerts via email, Slack, PagerDuty, etc.
  if (config.isProduction()) {
    // TODO: Implement actual alerting
    // Example: Send email
    // Example: Send Slack notification
    // Example: Trigger PagerDuty incident
  }
  
  // Store alert in database
  try {
    const firestore = getFirestore();
    if (firestore) {
      await firestore.collection('security_alerts').add({
        timestamp: new Date().toISOString(),
        issues,
        suspiciousIPs,
        environment: config.get('NODE_ENV'),
        resolved: false
      });
    }
  } catch (error) {
    logger.error('Failed to store security alert', { error: error.message });
  }
}

/**
 * Generate security report
 */
function generateReport(result, suspiciousIPs) {
  const report = [];
  
  report.push('='.repeat(60));
  report.push('SECURITY MONITORING REPORT');
  report.push('='.repeat(60));
  report.push(`Generated: ${new Date().toISOString()}`);
  report.push(`Environment: ${config.get('NODE_ENV')}`);
  report.push('');
  
  // Metrics summary
  report.push('METRICS SUMMARY (Last 24 Hours)');
  report.push('-'.repeat(40));
  report.push(`Total Events: ${result.metrics.daily.totalEvents}`);
  report.push(`Successful Logins: ${result.metrics.daily.successfulLogins}`);
  report.push(`Failed Logins: ${result.metrics.daily.failedLogins}`);
  report.push(`Rate Limit Hits: ${result.metrics.daily.rateLimitHits}`);
  report.push(`Suspicious Activities: ${result.metrics.daily.suspiciousActivities}`);
  report.push(`Critical Events: ${result.metrics.daily.criticalEvents}`);
  report.push(`High Risk Events: ${result.metrics.daily.highRiskEvents}`);
  report.push(`Unique Users: ${result.metrics.daily.uniqueUsers}`);
  report.push(`Unique IPs: ${result.metrics.daily.uniqueIps}`);
  report.push('');
  
  // Issues
  if (result.issues.length > 0) {
    report.push('SECURITY ISSUES DETECTED');
    report.push('-'.repeat(40));
    
    for (const issue of result.issues) {
      report.push(`[${issue.severity}] ${issue.type}`);
      report.push(`  ${issue.message}`);
      report.push(`  Current: ${issue.value}, Threshold: ${issue.threshold}`);
      report.push('');
    }
  } else {
    report.push('✓ No security issues detected');
    report.push('');
  }
  
  // Suspicious IPs
  if (suspiciousIPs.length > 0) {
    report.push('SUSPICIOUS IP ADDRESSES');
    report.push('-'.repeat(40));
    
    for (const { ip, failureCount } of suspiciousIPs) {
      report.push(`${ip}: ${failureCount} failed login attempts`);
    }
    report.push('');
  }
  
  report.push('='.repeat(60));
  
  return report.join('\n');
}

/**
 * Main monitoring function
 */
async function monitor() {
  try {
    logger.info('Starting security monitoring...');
    
    // Check for security issues
    const result = await checkSecurityIssues();
    
    // Check for suspicious IPs
    const suspiciousIPs = await checkSuspiciousIPs();
    
    // Generate report
    const report = generateReport(result, suspiciousIPs);
    
    // Output report
    console.log(report);
    
    // Send alerts if issues found
    if (result.issues.length > 0 || suspiciousIPs.length > 0) {
      await sendAlert(result.issues, suspiciousIPs);
    }
    
    logger.info('Security monitoring completed', {
      issuesFound: result.issues.length,
      suspiciousIPsFound: suspiciousIPs.length
    });
    
    // Exit with appropriate code
    process.exit(result.issues.length > 0 ? 1 : 0);
    
  } catch (error) {
    logger.error('Security monitoring failed', { error: error.message });
    process.exit(2);
  }
}

// Run monitoring
monitor();
