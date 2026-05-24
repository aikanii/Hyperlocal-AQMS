# Phase 2: Backend Refactoring - NestJS Implementation Guide

## Overview
This guide provides step-by-step instructions to migrate from Express to NestJS while maintaining API compatibility and ensuring zero downtime during transition.

## Migration Strategy

### Current State
- Express.js monolithic server (index.js)
- Socket.IO for real-time communication
- MQTT subscription handler
- PostgreSQL connection via pg driver
- JWT token validation

### Target State
- NestJS modular architecture
- Modules: Auth, Devices, Readings, Analytics, MQTT, Health
- Guards for JWT validation and RBAC
- Interceptors for logging and transformation
- Exception filters for centralized error handling
- Swagger/OpenAPI documentation
- TypeORM for database abstraction

---

## Step 1: Initialize NestJS Project

### Option A: Using NestJS CLI (Recommended)

```bash
# Install NestJS CLI globally
npm install -g @nestjs/cli

# Create new NestJS project (in temporary location)
nest new hy-aqms-backend-v2

# cd into the project
cd hy-aqms-backend-v2

# Install additional dependencies
npm install @nestjs/jwt @nestjs/passport passport passport-jwt
npm install mqtt redis
npm install typeorm pg class-validator class-transformer
npm install @nestjs/swagger swagger-ui-express
npm install helmet
npm install joi
npm install bcryptjs
```

### Option B: Manual Setup

Create the following tsconfig.json:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2021",
    "lib": ["ES2021"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "baseUrl": "./",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Step 2: Project Structure

Create this folder structure:

```
src/
├── main.ts                    # Application entry point
├── app.module.ts              # Root module
├── app.controller.ts          # Root controller
├── app.service.ts             # Root service
│
├── config/
│   ├── configuration.ts       # Environment validation
│   ├── database.config.ts     # TypeORM configuration
│   ├── mqtt.config.ts         # MQTT broker config
│   ├── jwt.config.ts          # JWT strategy
│   └── redis.config.ts        # Redis configuration
│
├── common/
│   ├── decorators/
│   │   ├── roles.decorator.ts
│   │   └── public.decorator.ts
│   ├── filters/
│   │   └── http-exception.filter.ts
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   ├── roles.guard.ts
│   │   └── rate-limit.guard.ts
│   ├── interceptors/
│   │   ├── logging.interceptor.ts
│   │   ├── transform.interceptor.ts
│   │   └── audit.interceptor.ts
│   ├── middleware/
│   │   └── security.middleware.ts
│   └── pipes/
│       └── validation.pipe.ts
│
├── modules/
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.service.ts
│   │   ├── auth.controller.ts
│   │   ├── jwt.strategy.ts
│   │   ├── dto/
│   │   │   ├── login.dto.ts
│   │   │   ├── register.dto.ts
│   │   │   └── token-response.dto.ts
│   │   └── entities/
│   │       ├── user.entity.ts
│   │       └── refresh-token.entity.ts
│   │
│   ├── devices/
│   │   ├── devices.module.ts
│   │   ├── devices.service.ts
│   │   ├── devices.controller.ts
│   │   ├── dto/
│   │   │   ├── create-device.dto.ts
│   │   │   ├── update-device.dto.ts
│   │   │   └── calibration.dto.ts
│   │   └── entities/
│   │       └── device.entity.ts
│   │
│   ├── readings/
│   │   ├── readings.module.ts
│   │   ├── readings.service.ts
│   │   ├── readings.controller.ts
│   │   ├── dto/
│   │   │   ├── create-reading.dto.ts
│   │   │   └── reading-query.dto.ts
│   │   └── entities/
│   │       └── reading.entity.ts
│   │
│   ├── analytics/
│   │   ├── analytics.module.ts
│   │   ├── analytics.service.ts
│   │   ├── analytics.controller.ts
│   │   └── dto/
│   │       └── stats-query.dto.ts
│   │
│   ├── mqtt/
│   │   ├── mqtt.module.ts
│   │   ├── mqtt.service.ts
│   │   └── interfaces/
│   │       └── mqtt-message.interface.ts
│   │
│   ├── export/
│   │   ├── export.module.ts
│   │   ├── export.service.ts
│   │   ├── export.controller.ts
│   │   └── dto/
│   │       └── export-query.dto.ts
│   │
│   └── health/
│       ├── health.module.ts
│       ├── health.service.ts
│       └── health.controller.ts
│
└── shared/
    ├── services/
    │   ├── database.service.ts
    │   ├── redis.service.ts
    │   └── logger.service.ts
    └── interfaces/
        └── jwt-payload.interface.ts

test/
├── jest-e2e.json
└── e2e/
    └── auth.e2e-spec.ts
```

---

## Step 3: Core Application Files

### src/main.ts

```typescript
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import * as helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Security middleware
  app.use(helmet());

  // CORS configuration
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger API Documentation
  const config = new DocumentBuilder()
    .setTitle('HY-AQMS API')
    .setDescription('Hyperlocal Air Quality Monitoring System API')
    .setVersion('2.0.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication endpoints')
    .addTag('devices', 'Device management')
    .addTag('readings', 'Time-series readings')
    .addTag('analytics', 'Analytics and statistics')
    .addTag('health', 'Health checks')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🚀 Application running on port ${port}`);
  console.log(`📚 Swagger documentation: http://localhost:${port}/api/docs`);
}

bootstrap();
```

### src/app.module.ts

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { configuration } from './config/configuration';

// Modules
import { AuthModule } from './modules/auth/auth.module';
import { DevicesModule } from './modules/devices/devices.module';
import { ReadingsModule } from './modules/readings/readings.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { MqttModule } from './modules/mqtt/mqtt.module';
import { ExportModule } from './modules/export/export.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
    }),

    // Database
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('database.host'),
        port: configService.get('database.port'),
        username: configService.get('database.username'),
        password: configService.get('database.password'),
        database: configService.get('database.name'),
        entities: ['dist/**/*.entity{.ts,.js}'],
        migrations: ['dist/migrations/**/*{.ts,.js}'],
        migrationsRun: true,
        synchronize: false,
        logging: configService.get('database.logging'),
        ssl: configService.get('database.ssl'),
      }),
    }),

    // JWT
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('jwt.secret'),
        signOptions: {
          expiresIn: configService.get('jwt.expiry'),
          algorithm: 'HS256',
        },
      }),
    }),

    // Passport
    PassportModule.register({ defaultStrategy: 'jwt' }),

    // Feature Modules
    AuthModule,
    DevicesModule,
    ReadingsModule,
    AnalyticsModule,
    MqttModule,
    ExportModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

### src/config/configuration.ts

```typescript
import * as Joi from 'joi';

export const configuration = () => {
  const envVars = process.env;

  const validatedEnv = Joi.object({
    // Server
    NODE_ENV: Joi.string()
      .valid('development', 'production', 'staging')
      .default('development'),
    PORT: Joi.number().default(3001),

    // Database
    DB_HOST: Joi.string().required(),
    DB_PORT: Joi.number().default(5432),
    DB_NAME: Joi.string().required(),
    DB_USER: Joi.string().required(),
    DB_PASSWORD: Joi.string().required(),
    DB_SSL: Joi.boolean().default(false),
    DB_LOGGING: Joi.boolean().default(false),
    DB_POOL_MIN: Joi.number().default(5),
    DB_POOL_MAX: Joi.number().default(20),

    // Redis
    REDIS_HOST: Joi.string().default('localhost'),
    REDIS_PORT: Joi.number().default(6379),
    REDIS_PASSWORD: Joi.string().optional(),

    // JWT
    JWT_SECRET: Joi.string().required().min(32),
    JWT_EXPIRY: Joi.string().default('15m'),
    REFRESH_TOKEN_EXPIRY: Joi.string().default('7d'),

    // MQTT
    MQTT_BROKER: Joi.string().required(),
    MQTT_USERNAME: Joi.string().required(),
    MQTT_PASSWORD: Joi.string().required(),
    MQTT_TOPIC_BASE: Joi.string().default('aqms'),

    // CORS
    CORS_ORIGIN: Joi.string().default('http://localhost:3000'),

    // Security
    BCRYPT_ROUNDS: Joi.number().default(12),
    RATE_LIMIT_WINDOW_MS: Joi.number().default(900000),
    RATE_LIMIT_MAX_REQUESTS: Joi.number().default(100),

    // ML Service
    ML_SERVICE_URL: Joi.string().required(),

    // MinIO
    MINIO_ENDPOINT: Joi.string().required(),
    MINIO_ACCESS_KEY: Joi.string().required(),
    MINIO_SECRET_KEY: Joi.string().required(),
  }).unknown(true);

  const { error, value: envVars } = validatedEnv.validate(process.env);

  if (error) {
    throw new Error(`Config validation error: ${error.message}`);
  }

  return {
    app: {
      nodeEnv: envVars.NODE_ENV,
      port: envVars.PORT,
    },
    database: {
      host: envVars.DB_HOST,
      port: envVars.DB_PORT,
      name: envVars.DB_NAME,
      username: envVars.DB_USER,
      password: envVars.DB_PASSWORD,
      ssl: envVars.DB_SSL,
      logging: envVars.DB_LOGGING,
      poolMin: envVars.DB_POOL_MIN,
      poolMax: envVars.DB_POOL_MAX,
    },
    redis: {
      host: envVars.REDIS_HOST,
      port: envVars.REDIS_PORT,
      password: envVars.REDIS_PASSWORD,
    },
    jwt: {
      secret: envVars.JWT_SECRET,
      expiry: envVars.JWT_EXPIRY,
      refreshTokenExpiry: envVars.REFRESH_TOKEN_EXPIRY,
    },
    mqtt: {
      broker: envVars.MQTT_BROKER,
      username: envVars.MQTT_USERNAME,
      password: envVars.MQTT_PASSWORD,
      topicBase: envVars.MQTT_TOPIC_BASE,
    },
    cors: {
      origin: envVars.CORS_ORIGIN,
    },
    security: {
      bcryptRounds: envVars.BCRYPT_ROUNDS,
      rateLimitWindowMs: envVars.RATE_LIMIT_WINDOW_MS,
      rateLimitMaxRequests: envVars.RATE_LIMIT_MAX_REQUESTS,
    },
    ml: {
      serviceUrl: envVars.ML_SERVICE_URL,
    },
    minio: {
      endpoint: envVars.MINIO_ENDPOINT,
      accessKey: envVars.MINIO_ACCESS_KEY,
      secretKey: envVars.MINIO_SECRET_KEY,
    },
  };
};
```

---

## Step 4: Authentication Module

### src/modules/auth/auth.module.ts

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { User } from './entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule,
    TypeOrmModule.forFeature([User, RefreshToken]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

### src/modules/auth/entities/user.entity.ts

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';

export enum UserRole {
  ADMIN = 'admin',
  EDITOR = 'editor',
  VIEWER = 'viewer',
}

@Entity('users')
@Index(['username'])
@Index(['email'])
@Index(['role'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 255 })
  username: string;

  @Column({ unique: true, length: 255 })
  email: string;

  @Column({ length: 255 })
  passwordHash: string;

  @Column({ nullable: true, length: 255 })
  fullName: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.VIEWER,
  })
  role: UserRole;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isEmailVerified: boolean;

  @Column({ nullable: true })
  lastLogin: Date;

  @Column({ default: 0 })
  failedLoginAttempts: number;

  @Column({ nullable: true })
  lockedUntil: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date;
}
```

### src/modules/auth/dto/login.dto.ts

```typescript
import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'User password',
    example: 'SecurePassword123!',
  })
  @IsString()
  @MinLength(12)
  password: string;
}
```

### src/modules/auth/auth.service.ts

```typescript
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  HttpException,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';

import { User, UserRole } from './entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly maxAttempts = 5;
  private readonly lockoutDurationMinutes = 30;
  private readonly bcryptRounds = 12;

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private refreshTokenRepository: Repository<RefreshToken>,
    private jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.usersRepository.findOne({
      where: { email: loginDto.email },
    });

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
    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      // Increment failed attempts
      const failedAttempts = (user.failedLoginAttempts || 0) + 1;

      if (failedAttempts >= this.maxAttempts) {
        const lockoutUntil = new Date(
          Date.now() + this.lockoutDurationMinutes * 60 * 1000
        );

        await this.usersRepository.update(user.id, {
          failedLoginAttempts: failedAttempts,
          lockedUntil: lockoutUntil,
        });

        throw new HttpException(
          'Too many failed login attempts. Account locked.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      await this.usersRepository.update(user.id, {
        failedLoginAttempts: failedAttempts,
      });

      throw new UnauthorizedException('Invalid credentials');
    }

    // Reset failed attempts
    await this.usersRepository.update(user.id, {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLogin: new Date(),
    });

    return this.generateTokens(user);
  }

  private async generateTokens(user: User) {
    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      {
        expiresIn: '15m',
      },
    );

    const refreshToken = this.jwtService.sign(
      {
        sub: user.id,
        type: 'refresh',
      },
      {
        expiresIn: '7d',
      },
    );

    // Store refresh token
    await this.refreshTokenRepository.save({
      userId: user.id,
      tokenHash: await bcrypt.hash(refreshToken, this.bcryptRounds),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    return { accessToken, refreshToken };
  }

  async validateUser(userId: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return user;
  }
}
```

---

## Step 5: API Compatibility Layer

To maintain API compatibility with the existing Express API, create a compatibility layer that maps old routes to new NestJS endpoints.

### src/modules/devices/devices.controller.ts (Example)

```typescript
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { DevicesService } from './devices.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditInterceptor } from '../../common/interceptors/audit.interceptor';

@ApiTags('devices')
@Controller('api/v1/devices')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  @ApiBearerAuth()
  async findAll() {
    return this.devicesService.findAll();
  }

  @Get(':id')
  @ApiBearerAuth()
  async findOne(@Param('id') id: string) {
    return this.devicesService.findOne(id);
  }

  @Post()
  @Roles('admin', 'editor')
  @ApiBearerAuth()
  async create(@Body() createDeviceDto) {
    return this.devicesService.create(createDeviceDto);
  }

  @Get(':id/latest')
  async getLatestReading(@Param('id') id: string) {
    return this.devicesService.getLatestReading(id);
  }
}
```

---

## Step 6: Migration Execution Plan

### Week 1: Core Infrastructure
- [ ] Initialize NestJS project
- [ ] Set up TypeORM with PostgreSQL
- [ ] Implement JWT strategy
- [ ] Create Auth module
- [ ] Set up database configuration

### Week 2: API Endpoints
- [ ] Create Devices module & controller
- [ ] Create Readings module & controller
- [ ] Create Analytics module & controller
- [ ] API tests for all endpoints

### Week 3: Integration
- [ ] MQTT handler module
- [ ] Redis caching integration
- [ ] WebSocket (Socket.IO) integration
- [ ] Export functionality

### Week 4: Testing & Deployment
- [ ] Unit tests
- [ ] Integration tests
- [ ] Load testing
- [ ] Blue-green deployment
- [ ] API compatibility validation

---

## Step 7: Running the NestJS Application

```bash
# Install dependencies
npm install

# Create .env from template
cp .env.example .env

# Run migrations
npm run migration:run

# Start development server
npm run start:dev

# Build for production
npm run build

# Start production server
npm run start:prod
```

---

## Step 8: Gradual Migration Strategy

### Phase 1: Dual-Stack Deployment
1. Deploy NestJS alongside existing Express
2. Use Traefik to route traffic: 90% Express, 10% NestJS
3. Monitor for issues

### Phase 2: Gradual Traffic Shift
1. Increase NestJS traffic: 25%, 50%, 75%
2. Monitor error rates and latency
3. Keep Express running as fallback

### Phase 3: Full Cutover
1. Route 100% traffic to NestJS
2. Keep Express running for 1 week
3. Decommission Express after validation

---

**Status**: Ready for implementation
**Next**: Create individual module files
**Effort**: 80 hours over 3-4 weeks
