# Security Hardening & Best Practices Guide

## Executive Summary

This guide provides enterprise-grade security hardening for HY-AQMS covering authentication, authorization, data protection, API security, infrastructure hardening, and compliance.

---

## 1. Authentication & Authorization

### 1.1 JWT Token Strategy

**Token Architecture**:
- **Access Token**: Short-lived (15 minutes), contains user claims
- **Refresh Token**: Long-lived (7 days), used to obtain new access tokens
- **Rotation**: Refresh tokens are single-use (invalidated after use)

```typescript
// src/auth/jwt.strategy.ts (NestJS)
import { Strategy, ExtractJwt } from 'passport-jwt';
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(private configService: ConfigService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.get('JWT_SECRET'),
            algorithms: ['HS256'],
        });
    }

    async validate(payload: any): Promise<JwtPayload> {
        return {
            userId: payload.sub,
            email: payload.email,
            role: payload.role,
            iat: payload.iat,
            exp: payload.exp,
        };
    }
}
```

**Access Token Payload**:
```json
{
    "sub": "uuid-of-user",
    "email": "user@example.com",
    "role": "editor",
    "iat": 1234567890,
    "exp": 1234567900,
    "iss": "hy-aqms",
    "aud": "hy-aqms-api"
}
```

### 1.2 Multi-User RBAC (Role-Based Access Control)

**Roles & Permissions**:
```
Admin:
  - read: all resources
  - write: all resources
  - delete: all resources
  - train_ml_models
  - manage_users
  - audit_logs
  
Editor:
  - read: all resources
  - write: devices, readings (own region)
  - export: data
  - view_predictions
  
Viewer:
  - read: all resources (no sensitive data)
  - no write permissions
```

**Implementation**:
```typescript
// src/auth/roles.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflector.get<string[]>(
            'roles',
            context.getHandler(),
        );
        
        if (!requiredRoles) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user || !requiredRoles.includes(user.role)) {
            throw new ForbiddenException(
                'User does not have required role',
            );
        }

        return true;
    }
}

// Usage in controller
@Controller('api/v1/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
    @Post('users')
    @Roles('admin')
    async createUser() {
        // Only accessible by admin
    }
}
```

### 1.3 Password Security

**Requirements**:
- Minimum 12 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one digit
- At least one special character
- Cannot contain username

```typescript
// src/auth/password.validator.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class PasswordValidator {
    validate(password: string, username: string): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (password.length < 12) {
            errors.push('Password must be at least 12 characters long');
        }
        if (!/[A-Z]/.test(password)) {
            errors.push('Password must contain at least one uppercase letter');
        }
        if (!/[a-z]/.test(password)) {
            errors.push('Password must contain at least one lowercase letter');
        }
        if (!/[0-9]/.test(password)) {
            errors.push('Password must contain at least one digit');
        }
        if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
            errors.push('Password must contain at least one special character');
        }
        if (password.includes(username)) {
            errors.push('Password cannot contain username');
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }
}
```

**Hashing**:
```typescript
// src/auth/password.service.ts
import * as bcrypt from 'bcrypt';

@Injectable()
export class PasswordService {
    private readonly saltRounds = 12;

    async hash(password: string): Promise<string> {
        return bcrypt.hash(password, this.saltRounds);
    }

    async compare(plain: string, hashed: string): Promise<boolean> {
        return bcrypt.compare(plain, hashed);
    }
}
```

### 1.4 Account Lockout & Brute-Force Protection

```typescript
// src/auth/login.service.ts
@Injectable()
export class LoginService {
    private readonly maxAttempts = 5;
    private readonly lockoutDurationMinutes = 30;

    async login(email: string, password: string): Promise<TokenResponse> {
        const user = await this.usersService.findByEmail(email);

        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        // Check if account is locked
        if (user.lockedUntil && user.lockedUntil > new Date()) {
            throw new HttpException(
                'Account temporarily locked. Try again later.',
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        // Verify password
        const isPasswordValid = await this.passwordService.compare(
            password,
            user.passwordHash,
        );

        if (!isPasswordValid) {
            // Increment failed attempts
            const failedAttempts = (user.failedLoginAttempts || 0) + 1;

            if (failedAttempts >= this.maxAttempts) {
                const lockoutUntil = new Date(
                    Date.now() + this.lockoutDurationMinutes * 60 * 1000
                );

                await this.usersService.update(user.id, {
                    failedLoginAttempts: failedAttempts,
                    lockedUntil: lockoutUntil,
                });

                throw new HttpException(
                    'Too many failed login attempts. Account locked.',
                    HttpStatus.TOO_MANY_REQUESTS,
                );
            }

            await this.usersService.update(user.id, {
                failedLoginAttempts: failedAttempts,
            });

            throw new UnauthorizedException('Invalid credentials');
        }

        // Reset failed attempts
        await this.usersService.update(user.id, {
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLogin: new Date(),
        });

        return this.generateTokens(user);
    }
}
```

---

## 2. API Security

### 2.1 Input Validation & Sanitization

```typescript
// src/common/pipes/validation.pipe.ts
import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';

@Injectable()
export class ValidationPipe implements PipeTransform {
    async transform(value: any, metadata: ArgumentMetadata) {
        if (!metadata.type || metadata.type === 'custom') return value;

        const object = plainToClass(metadata.metatype, value);
        const errors = await validate(object);

        if (errors.length > 0) {
            const errorMessages = errors
                .flatMap((error) => Object.values(error.constraints))
                .join('; ');

            throw new BadRequestException({
                statusCode: 400,
                message: 'Validation failed',
                errors: errorMessages,
            });
        }

        return value;
    }
}

// Usage in DTOs
import { IsEmail, IsString, MinLength, Matches } from 'class-validator';
import { Trim } from 'class-transformer';

export class CreateUserDto {
    @IsString()
    @Trim()
    @MinLength(3)
    username: string;

    @IsEmail()
    @Trim()
    email: string;

    @IsString()
    @MinLength(12)
    @Matches(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/,
        {
            message: 'Password must contain uppercase, lowercase, digit, and special character',
        }
    )
    password: string;
}
```

### 2.2 CSRF Protection

```typescript
// src/common/middleware/csrf.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import * as csrf from 'csurf';

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
    private csrfProtection = csrf({ cookie: false }); // Use sessions instead

    use(req: any, res: any, next: Function) {
        this.csrfProtection(req, res, next);
    }
}

// Apply in main.ts
app.use(new CsrfMiddleware().use);

// Frontend sends CSRF token
POST /api/v1/devices
X-CSRF-Token: <token from cookie or meta tag>
Content-Type: application/json
```

### 2.3 Rate Limiting

```typescript
// src/common/guards/rate-limit.guard.ts
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import * as rateLimit from 'express-rate-limit';

@Injectable()
export class RateLimitGuard {
    // Global rate limiter
    private globalLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // limit each IP to 100 requests per windowMs
        message: 'Too many requests from this IP',
        standardHeaders: true,
        legacyHeaders: false,
    });

    // Per-user rate limiter (stricter)
    private authLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 50,
        keyGenerator: (req) => req.user?.id || req.ip,
    });

    // Login attempts (very strict)
    private loginLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 5,
        message: 'Too many login attempts',
        skipSuccessfulRequests: true,
    });
}
```

### 2.4 Security Headers

```typescript
// src/main.ts
import * as helmet from 'helmet';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    // Security headers
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:', 'https:'],
                connectSrc: ["'self'", 'wss:'],
                fontSrc: ["'self'", 'data:'],
                objectSrc: ["'none'"],
                mediaSrc: ["'self'"],
                frameSrc: ["'none'"],
            },
        },
        hsts: {
            maxAge: 31536000, // 1 year in seconds
            includeSubDomains: true,
            preload: true,
        },
        referrerPolicy: {
            policy: 'no-referrer',
        },
        noSniff: true,
        xssFilter: true,
        frameGuard: {
            action: 'deny',
        },
    }));

    // CORS
    app.enableCors({
        origin: process.env.CORS_ORIGIN?.split(',') || 'http://localhost:3000',
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    });

    await app.listen(3001);
}
```

---

## 3. Data Protection

### 3.1 Encryption at Rest (Future)

```sql
-- Enable pgcrypto extension
CREATE EXTENSION pgcrypto;

-- Example: Encrypt sensitive fields
ALTER TABLE users
ADD COLUMN email_enc bytea;

-- Function to encrypt on insert
CREATE TRIGGER encrypt_user_email
    BEFORE INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION encrypt_email_fn();
```

### 3.2 Sensitive Data Masking

```typescript
// src/common/interceptors/sensitive-data.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class SensitiveDataInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        return next.handle().pipe(
            map((data) => this.maskSensitiveData(data)),
        );
    }

    private maskSensitiveData(data: any): any {
        if (!data) return data;

        if (typeof data !== 'object') {
            return data;
        }

        if (Array.isArray(data)) {
            return data.map((item) => this.maskSensitiveData(item));
        }

        const masked = { ...data };

        if (masked.passwordHash) {
            delete masked.passwordHash;
        }
        if (masked.email && !this.isAuthorized()) {
            masked.email = this.maskEmail(masked.email);
        }

        return masked;
    }

    private maskEmail(email: string): string {
        const [local, domain] = email.split('@');
        return `${local.substring(0, 2)}***@${domain}`;
    }

    private isAuthorized(): boolean {
        // Check if user is authorized to see full data
        return false; // Implement proper authorization
    }
}
```

### 3.3 Audit Logging

```typescript
// src/common/interceptors/audit.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
    constructor(private auditService: AuditService) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        const startTime = Date.now();

        return next.handle().pipe(
            tap(
                (data) => {
                    const duration = Date.now() - startTime;
                    this.auditService.log({
                        userId: user?.id,
                        action: request.method,
                        entity: this.extractEntity(request.path),
                        status: 'success',
                        ipAddress: request.ip,
                        userAgent: request.get('user-agent'),
                        duration,
                        timestamp: new Date(),
                    });
                },
                (error) => {
                    const duration = Date.now() - startTime;
                    this.auditService.log({
                        userId: user?.id,
                        action: request.method,
                        entity: this.extractEntity(request.path),
                        status: 'failure',
                        errorMessage: error.message,
                        ipAddress: request.ip,
                        userAgent: request.get('user-agent'),
                        duration,
                        timestamp: new Date(),
                    });
                }
            )
        );
    }

    private extractEntity(path: string): string {
        const match = path.match(/\/api\/v1\/(\w+)/);
        return match ? match[1] : 'unknown';
    }
}
```

---

## 4. MQTT Security

### 4.1 Mosquitto TLS/SSL Configuration

```
# /mosquitto/mosquitto.conf

# Listeners
listener 1883
protocol mqtt

listener 8883
protocol mqtt
cafile /mosquitto/certs/ca.crt
certfile /mosquitto/certs/server.crt
keyfile /mosquitto/certs/server.key
tls_version tlsv1.2
tls_ciphers DEFAULT:!aNULL:!eNULL:!aNULL:!DES:!DES-CBC3-SHA:!MD5:!PSK:!RC4:!MD5:!DSS
require_certificate false

# Authentication
password_file /mosquitto/config/passwd
allow_anonymous false

# Logging
log_dest file /mosquitto/log/mosquitto.log
log_dest stdout
log_type all

# Performance
max_connections 1000
max_queued_messages 1000
message_size_limit 0

# Persistence
persistence true
persistence_file mosquitto.db
persistence_location /mosquitto/data/
```

### 4.2 Device Credential Management

```typescript
// src/mqtt/mqtt-credentials.service.ts
@Injectable()
export class MqttCredentialsService {
    async generateDeviceCredentials(device: Device): Promise<MqttCredential> {
        const username = `device_${device.deviceId}`;
        const password = this.generateSecurePassword();
        
        // Hash password with mosquitto_passwd
        const hashedPassword = await this.hashPassword(password);
        
        // Store in mosquitto passwd file
        await this.updateMosquittoPasswd(username, hashedPassword);
        
        return {
            username,
            password, // Return once, never again
            brokerUrl: `mqtts://${this.configService.get('MQTT_BROKER')}:8883`,
            topic: `aqms/${device.region}/${device.deviceId}/data`,
        };
    }

    async revokeDeviceCredentials(device: Device): Promise<void> {
        const username = `device_${device.deviceId}`;
        await this.removeMosquittoPasswd(username);
    }

    private generateSecurePassword(): string {
        return randomBytes(32).toString('hex');
    }
}
```

### 4.3 Topic ACL (Future Enhancement)

```
# /mosquitto/aclfile
user device_abc123
topic aqms/iligan_city/abc123/data
topic aqms/iligan_city/abc123/config

user admin
topic aqms/#
```

---

## 5. Infrastructure Security

### 5.1 Traefik Security Configuration

```yaml
# infrastructure/traefik/dynamic.yml
http:
  middlewares:
    # Security headers
    security-headers:
      headers:
        sslRedirect: true
        sslHost: "example.com"
        sslProxyHeaders:
          X-Forwarded-Proto: "https"
        stsSeconds: 31536000
        stsIncludeSubdomains: true
        stsPreload: true
        forceSTSHeader: true
        customFrameOptionsValue: "DENY"
        customRequestHeaders:
          X-Content-Type-Options: "nosniff"
          X-Frame-Options: "DENY"
          X-XSS-Protection: "1; mode=block"
          Referrer-Policy: "no-referrer"

    # Rate limiting
    rate-limit:
      rateLimit:
        average: 100
        period: "1m"
        burst: 50

    # CORS
    cors:
      headers:
        accessControlAllowOriginList: ["http://localhost:3000"]
        accessControlAllowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH"]
        accessControlAllowHeaders: ["*"]
        accessControlMaxAge: 86400

  routers:
    backend:
      rule: "PathPrefix(`/api/`)"
      entrypoints: ["websecure"]
      service: backend
      middlewares:
        - security-headers
        - rate-limit

services:
  backend:
    loadBalancer:
      servers:
        - url: "http://backend:3001"
```

### 5.2 Docker Security

```dockerfile
# Non-root user
RUN addgroup -g 1001 -S appuser && \
    adduser -S appuser -u 1001

# Read-only root filesystem (for production)
RUN chmod -R 555 /app && \
    chmod -R 755 /app/logs

# Health checks
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

USER appuser
```

### 5.3 Network Segmentation

```yaml
# docker-compose.yml
networks:
  app-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16

services:
  backend:
    networks:
      app-network:
        ipv4_address: 172.20.0.2
```

---

## 6. Secrets Management

### 6.1 HashiCorp Vault Integration (Production)

```typescript
// src/config/vault.service.ts
import { Client } from 'vault-client';

@Injectable()
export class VaultService {
    private client: Client;

    constructor(private configService: ConfigService) {
        this.client = new Client({
            endpoint: this.configService.get('VAULT_ADDR'),
            token: this.configService.get('VAULT_TOKEN'),
        });
    }

    async getSecret(path: string): Promise<any> {
        const secret = await this.client.read(`secret/data/${path}`);
        return secret.data.data;
    }

    async rotateSecret(path: string): Promise<void> {
        // Automatic secret rotation
        const newSecret = this.generateSecureValue();
        await this.client.write(`secret/data/${path}`, { data: newSecret });
    }
}
```

### 6.2 Environment Variable Validation

```typescript
// src/config/configuration.ts
import { ConfigModuleOptions } from '@nestjs/config';
import * as Joi from 'joi';

export const configModuleOptions: ConfigModuleOptions = {
    isGlobal: true,
    envFilePath: '.env',
    validationSchema: Joi.object({
        // Server
        NODE_ENV: Joi.string()
            .valid('development', 'production', 'staging')
            .required(),
        PORT: Joi.number().default(3001),

        // Database
        DB_HOST: Joi.string().required(),
        DB_PORT: Joi.number().default(5432),
        DB_NAME: Joi.string().required(),
        DB_USER: Joi.string().required(),
        DB_PASSWORD: Joi.string().required().min(12),

        // JWT
        JWT_SECRET: Joi.string().required().min(32),
        JWT_EXPIRY: Joi.string().default('15m'),

        // Security
        BCRYPT_ROUNDS: Joi.number().default(12),
        CORS_ORIGIN: Joi.string().required(),

        // MQTT
        MQTT_BROKER: Joi.string().required(),
        MQTT_USERNAME: Joi.string().required(),
        MQTT_PASSWORD: Joi.string().required(),
    }),
    validationOptions: {
        abortEarly: true,
        allowUnknown: true,
    },
};
```

---

## 7. Compliance & Monitoring

### 7.1 Security Logging

```typescript
// src/common/services/security-logger.service.ts
@Injectable()
export class SecurityLoggerService {
    private logger = new Logger('Security');

    logFailedLogin(email: string, ipAddress: string): void {
        this.logger.warn(`Failed login attempt: ${email} from ${ipAddress}`);
    }

    logSuspiciousActivity(message: string, metadata: any): void {
        this.logger.error(`Suspicious activity detected: ${message}`, metadata);
    }

    logPermissionDenied(userId: string, action: string): void {
        this.logger.warn(`Permission denied: User ${userId} attempted ${action}`);
    }

    logDataAccess(userId: string, entityType: string, entityId: string): void {
        this.logger.debug(`Data access: User ${userId} accessed ${entityType} ${entityId}`);
    }
}
```

### 7.2 Security Headers Verification

```bash
# Test security headers
curl -I https://api.example.com

# Expected headers
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'self'
Referrer-Policy: no-referrer
```

---

## 8. Incident Response

### 8.1 Breach Response Plan

1. **Immediate Actions** (First 1 hour):
   - Revoke all active sessions
   - Force password reset for all users
   - Enable enhanced logging
   - Notify security team

2. **Investigation** (Next 24 hours):
   - Review audit logs
   - Identify affected users/data
   - Determine breach vector
   - Collect forensic evidence

3. **Communication** (Ongoing):
   - Notify affected users
   - Communicate with regulators
   - Publish incident report
   - Update security measures

### 8.2 Secret Rotation Automation

```bash
#!/bin/bash
# scripts/rotate-secrets.sh

# Rotate JWT secret
NEW_JWT_SECRET=$(openssl rand -hex 32)
vault write secret/data/jwt_secret value="$NEW_JWT_SECRET"

# Update all services
docker-compose restart backend ml-service

# Rotate database password
NEW_DB_PASSWORD=$(openssl rand -hex 16)
psql -U postgres -c "ALTER USER hy_aqms WITH PASSWORD '$NEW_DB_PASSWORD';"
vault write secret/data/db_password value="$NEW_DB_PASSWORD"

# Rotate MQTT credentials
mosquitto_passwd -b /mosquitto/config/passwd iot_device "$(openssl rand -hex 16)"

# Log rotation
echo "$(date): Secrets rotated successfully" >> /var/log/hy-aqms-rotation.log
```

---

## Checklist: Security Implementation

- [ ] JWT access + refresh tokens
- [ ] Multi-user RBAC system
- [ ] Password complexity requirements
- [ ] Account lockout after failed attempts
- [ ] Input validation on all endpoints
- [ ] CSRF protection
- [ ] Rate limiting (global + per-user)
- [ ] Security headers (Helmet)
- [ ] HTTPS/TLS for all connections
- [ ] MQTT TLS/SSL
- [ ] Audit logging for all actions
- [ ] Secrets management strategy
- [ ] Regular security testing
- [ ] Incident response plan
- [ ] Penetration testing schedule

---

**Version**: 1.0 (Enterprise-Grade)
**Last Updated**: 2026-05-23
**Status**: Complete Security Framework
