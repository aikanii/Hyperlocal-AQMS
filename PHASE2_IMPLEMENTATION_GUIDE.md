# Phase 2: NestJS Backend Refactoring - Implementation Guide

## Executive Summary

This document provides a comprehensive guide to migrating the HY-AQMS backend from Express.js to NestJS while maintaining API compatibility and ensuring zero-downtime transitions.

**Duration**: 3-4 weeks  
**Effort**: 80 engineer-hours  
**Team**: 2 backend developers, 1 DevOps engineer

---

## Objectives

✅ Migrate Express monolith to NestJS modular architecture  
✅ Implement RBAC with fine-grained permissions  
✅ Add OpenAPI/Swagger documentation  
✅ Maintain 100% API compatibility  
✅ Implement comprehensive error handling  
✅ Add security hardening (JWT, CSRF, rate limiting)  
✅ Set up automated testing (unit + integration)  
✅ Enable zero-downtime blue-green deployment  

---

## Deliverables

### 1. Project Structure
- [x] NestJS project initialized
- [x] TypeScript configuration
- [ ] Module structure (Auth, Devices, Readings, Analytics, MQTT, Export, Health)
- [ ] Service/repository patterns
- [ ] DTO validation classes
- [ ] Entity definitions
- [ ] Database migrations

### 2. Core Modules
- [ ] **Auth Module**: JWT, RBAC, login, register, token refresh
- [ ] **Devices Module**: CRUD, calibration, status management
- [ ] **Readings Module**: Time-series ingestion, queries, aggregations
- [ ] **Analytics Module**: Statistics, trends, forecasting
- [ ] **MQTT Module**: Message broker subscription, parsing
- [ ] **Export Module**: CSV generation, async job queue
- [ ] **Health Module**: Liveness/readiness probes

### 3. Common Infrastructure
- [ ] Exception filters (centralized error handling)
- [ ] Guards (JWT auth, RBAC, rate limiting)
- [ ] Interceptors (logging, transformation, audit)
- [ ] Pipes (validation, transformation)
- [ ] Middleware (security headers, CORS)
- [ ] Decorators (roles, public routes)

### 4. Documentation & Testing
- [ ] OpenAPI/Swagger specifications
- [ ] Unit tests (>80% coverage)
- [ ] Integration tests
- [ ] E2E tests for critical flows
- [ ] Load testing scenarios
- [ ] Security testing

### 5. Deployment
- [ ] Docker image optimizations
- [ ] Blue-green deployment setup
- [ ] Health check configuration
- [ ] Monitoring metrics
- [ ] Rollback procedures

---

## Week 1: Foundation & Core Infrastructure

### Day 1-2: Project Initialization

**Tasks**:
1. Run setup script: `bash scripts/setup-nestjs.sh`
2. Verify all dependencies installed
3. Create `.env` from `.env.example`
4. Create database connection test

**Files to Create**:
- `src/main.ts` - Application entry point
- `src/app.module.ts` - Root module
- `src/config/configuration.ts` - Environment validation
- `src/config/database.config.ts` - TypeORM setup

**Verification**:
```bash
npm run start:dev
# Should start on port 3001 without errors
```

### Day 3: Authentication Module

**Tasks**:
1. Create Auth module structure
2. Implement JWT strategy
3. Create User entity
4. Implement LoginService
5. Create AuthController with login endpoint

**Files to Create**:
- `src/modules/auth/auth.module.ts`
- `src/modules/auth/auth.service.ts`
- `src/modules/auth/auth.controller.ts`
- `src/modules/auth/jwt.strategy.ts`
- `src/modules/auth/dto/login.dto.ts`
- `src/modules/auth/dto/register.dto.ts`
- `src/modules/auth/entities/user.entity.ts`
- `src/modules/auth/entities/refresh-token.entity.ts`

**Tests**:
```bash
POST /api/v1/auth/login
{
  "email": "admin@example.com",
  "password": "SecurePassword123!"
}

Response:
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc..."
}
```

### Day 4-5: Guards & Common Infrastructure

**Tasks**:
1. Create JWT auth guard
2. Create RBAC roles guard
3. Create exception filter
4. Create logging interceptor
5. Create validation pipe

**Files to Create**:
- `src/common/guards/jwt-auth.guard.ts`
- `src/common/guards/roles.guard.ts`
- `src/common/guards/rate-limit.guard.ts`
- `src/common/filters/http-exception.filter.ts`
- `src/common/interceptors/logging.interceptor.ts`
- `src/common/interceptors/transform.interceptor.ts`
- `src/common/interceptors/audit.interceptor.ts`
- `src/common/decorators/roles.decorator.ts`
- `src/common/decorators/public.decorator.ts`
- `src/common/pipes/validation.pipe.ts`

**Key Code**:
```typescript
// src/common/guards/jwt-auth.guard.ts
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err, user) {
    if (err || !user) {
      throw err || new UnauthorizedException();
    }
    return user;
  }
}

// src/common/guards/roles.guard.ts
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
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
```

---

## Week 2: API Endpoints & Business Logic

### Day 1-2: Devices Module

**Tasks**:
1. Create Device entity with all fields
2. Implement DevicesService with CRUD
3. Create DevicesController with REST endpoints
4. Create DTOs for validation
5. Add calibration logic

**Endpoints**:
```
GET  /api/v1/devices
GET  /api/v1/devices/:id
GET  /api/v1/devices/:id/latest
POST /api/v1/devices
PUT  /api/v1/devices/:id
PATCH /api/v1/devices/:id/calibration
DELETE /api/v1/devices/:id
```

**Files**:
- `src/modules/devices/devices.module.ts`
- `src/modules/devices/devices.service.ts`
- `src/modules/devices/devices.controller.ts`
- `src/modules/devices/entities/device.entity.ts`
- `src/modules/devices/dto/create-device.dto.ts`
- `src/modules/devices/dto/update-device.dto.ts`
- `src/modules/devices/dto/calibration.dto.ts`

### Day 3: Readings Module

**Tasks**:
1. Create Reading entity
2. Implement ReadingsService (insert, query, aggregate)
3. Create ReadingsController
4. Add time-series query support
5. Add filtering by device, date range, region

**Endpoints**:
```
GET  /api/v1/readings
GET  /api/v1/readings/latest
GET  /api/v1/readings/:device_id/history
POST /api/v1/readings (batch insert)
```

**Key Service Methods**:
```typescript
// Query with filters
findReadings(filters: {
  deviceId?: string;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
}): Promise<Reading[]>

// Aggregations
getAggregations(deviceId: string, interval: 'hour' | 'day' | '6hour'):
  Promise<Aggregation[]>

// Latest readings batch
getLatestReadings(): Promise<Map<string, Reading>>
```

### Day 4: Analytics Module

**Tasks**:
1. Create StatisticsService
2. Create AnalyticsController
3. Implement city-wide stats queries
4. Implement device-specific stats
5. Add trend analysis

**Endpoints**:
```
GET /api/v1/analytics/city?interval=hour|day|6hour
GET /api/v1/analytics/device/:id?interval=hour|day
GET /api/v1/analytics/trends/:device_id?days=7|30|90
```

### Day 5: Export Module

**Tasks**:
1. Create ExportService
2. Create ExportController
3. Implement CSV generation
4. Add async job queue
5. Integrate with MinIO

**Endpoints**:
```
POST /api/v1/export (create job)
GET  /api/v1/export/:job_id (get status)
GET  /api/v1/export/:job_id/download (download file)
```

---

## Week 3: Integration & Advanced Features

### Day 1-2: MQTT Module

**Tasks**:
1. Create MqttService
2. Implement subscription handler
3. Parse device messages
4. Apply calibration
5. Trigger ML predictions
6. Broadcast via Socket.IO

**Implementation**:
```typescript
@Injectable()
export class MqttService implements OnModuleInit {
  constructor(
    private readingsService: ReadingsService,
    private devicesService: DevicesService,
    private analyticsService: AnalyticsService,
  ) {}

  async onModuleInit() {
    await this.connectBroker();
    this.subscribeToTopics();
  }

  private async connectBroker() {
    this.client = mqtt.connect(this.configService.get('mqtt.broker'), {
      username: this.configService.get('mqtt.username'),
      password: this.configService.get('mqtt.password'),
      reconnectPeriod: 5000,
      keepalive: 60,
    });

    this.client.on('message', (topic, payload) => {
      this.handleMessage(topic, payload);
    });
  }

  private async handleMessage(topic: string, payload: Buffer) {
    const data = JSON.parse(payload.toString());
    const deviceId = this.extractDeviceId(topic);
    
    // Get device with calibration
    const device = await this.devicesService.findOne(deviceId);
    
    // Apply calibration
    data.pm2_5_cal = this.applyCalibratio(
      data.pm2_5,
      device.calibration_coefficients,
    );
    
    // Save reading
    await this.readingsService.create(data);
    
    // Broadcast to clients
    this.socketGateway.broadcastReading(data);
    
    // Trigger ML prediction
    this.analyticsService.triggerPrediction(deviceId);
  }
}
```

### Day 3: Health & Monitoring Module

**Tasks**:
1. Create HealthService
2. Add liveness probe
3. Add readiness probe
4. Check database connectivity
5. Check Redis connectivity
6. Check MQTT connectivity

**Endpoints**:
```
GET /health (liveness probe)
GET /health/ready (readiness probe)
GET /health/metrics (Prometheus metrics)
```

### Day 4-5: Socket.IO Real-Time

**Tasks**:
1. Create Socket.IO gateway
2. Implement connection management
3. Broadcast readings
4. Broadcast predictions
5. Handle client subscriptions

**Gateway**:
```typescript
@WebSocketGateway({
  namespace: 'socket.io',
  cors: { origin: '*' },
})
export class ReadingsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('subscribe_device')
  async onSubscribeDevice(client: Socket, deviceId: string) {
    client.join(`device:${deviceId}`);
    client.emit('subscribed', { deviceId });
  }

  broadcastReading(reading: Reading) {
    this.server.to(`device:${reading.deviceId}`).emit('new_reading', reading);
  }
}
```

---

## Week 4: Testing & Deployment

### Day 1-2: Unit & Integration Tests

**Test Coverage**:
- Auth service (login, token generation, validation)
- Devices service (CRUD operations)
- Readings service (insert, query, aggregation)
- Analytics service (statistics calculation)

**Example Test**:
```typescript
describe('AuthService', () => {
  let service: AuthService;
  let repository: Repository<User>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    repository = module.get<Repository<User>>(getRepositoryToken(User));
  });

  it('should login with valid credentials', async () => {
    const result = await service.login({
      email: 'test@example.com',
      password: 'password123',
    });

    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
  });

  it('should throw on invalid password', async () => {
    await expect(
      service.login({
        email: 'test@example.com',
        password: 'wrongpassword',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
```

### Day 3: E2E Tests

**Critical Flows**:
1. User registration and login
2. Device creation and calibration
3. Reading insertion and retrieval
4. Analytics queries
5. CSV export workflow

```typescript
describe('Readings (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Get auth token
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'password',
      });

    accessToken = loginRes.body.accessToken;
  });

  it('should fetch readings', () => {
    return request(app.getHttpServer())
      .get('/api/v1/readings')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toBeInstanceOf(Array);
      });
  });
});
```

### Day 4: Load Testing

**Tools**: Apache JMeter / k6

**Scenarios**:
1. 100 concurrent users, 10 RPS → /api/v1/readings
2. 500 concurrent users, 50 RPS → /api/v1/devices
3. 1000 concurrent users, 100 RPS → /api/v1/readings (batch)

**Acceptance Criteria**:
- p99 latency < 200ms
- Error rate < 0.1%
- Throughput >= 1000 RPS

### Day 5: Deployment & Validation

**Tasks**:
1. Build Docker image
2. Push to registry
3. Deploy to staging (blue-green)
4. Run smoke tests
5. Monitor metrics
6. Gradual traffic shift (10% → 50% → 100%)
7. Keep Express running for 1 week

---

## Migration Checklist

### Code Migration
- [ ] All Express routes mapped to NestJS controllers
- [ ] All business logic moved to services
- [ ] All DTOs created for validation
- [ ] All entities created in TypeORM
- [ ] RBAC implemented and tested

### Testing
- [ ] Unit tests written (>80% coverage)
- [ ] Integration tests written
- [ ] E2E tests written
- [ ] Load tests passed
- [ ] Security tests passed

### Documentation
- [ ] OpenAPI/Swagger specs complete
- [ ] README updated with NestJS info
- [ ] Deployment guide updated
- [ ] Architecture diagram updated
- [ ] API migration guide created

### Deployment
- [ ] Docker image built & tested
- [ ] Blue-green deployment configured
- [ ] Health checks configured
- [ ] Monitoring alerts configured
- [ ] Rollback procedure documented
- [ ] Canary deployment tested

---

## API Compatibility

### URL Versioning
```
Old: /api/endpoint
New: /api/v1/endpoint
```

All new NestJS endpoints use `/api/v1/` prefix to maintain backward compatibility.

### Response Format

**Express API**:
```json
{
  "data": [...],
  "success": true
}
```

**NestJS API** (via interceptor):
```json
{
  "statusCode": 200,
  "data": [...],
  "timestamp": "2026-05-23T16:00:00Z"
}
```

Use interceptor to maintain compatibility:
```typescript
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      map(data => ({
        statusCode: context.switchToHttp().getResponse().statusCode,
        data,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
```

---

## Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| API Latency (p99) | <100ms | ? |
| Throughput | >1000 RPS | ? |
| Error Rate | <0.1% | ? |
| Memory Usage | <500MB | ? |
| Startup Time | <5s | ? |
| Code Coverage | >80% | ? |

---

## Risk Mitigation

| Risk | Probability | Mitigation |
|------|-------------|-----------|
| API incompatibility | Medium | Comprehensive E2E tests |
| Performance regression | Medium | Load testing before cutover |
| Data loss | Low | Database backup before migration |
| User disruption | Low | Blue-green deployment, instant rollback |

---

## Success Criteria

✅ All existing Express endpoints working identically in NestJS  
✅ RBAC system fully functional  
✅ OpenAPI documentation complete  
✅ Code coverage >80%  
✅ Load test passes (1000+ RPS)  
✅ Zero downtime during migration  
✅ Response times < 100ms (p99)  
✅ Team trained on NestJS architecture  

---

**Status**: Ready for Phase 2 Implementation  
**Estimated Duration**: 3-4 weeks  
**Estimated Effort**: 80 hours  
**Team Size**: 2-3 developers  

---

*Last Updated: 2026-05-23*
*Next Update: Upon Phase 2 Completion*
