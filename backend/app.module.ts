import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';

// Feature modules (placeholders)
import { AuthModule } from './modules/auth/auth.module';
import { DevicesModule } from './modules/devices/devices.module';
import { ReadingsModule } from './modules/readings/readings.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { MqttModule } from './modules/mqtt/mqtt.module';
import { ExportModule } from './modules/export/export.module';
import { HealthModule } from './modules/health/health.module';

import { configuration } from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], envFilePath: '.env' }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('database.host'),
        port: configService.get('database.port'),
        username: configService.get('database.username'),
        password: configService.get('database.password'),
        database: configService.get('database.name'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        migrationsRun: true,
        synchronize: false,
        logging: configService.get('database.logging'),
        ssl: configService.get('database.ssl'),
      }),
    }),

    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('jwt.secret'),
        signOptions: { expiresIn: configService.get('jwt.expiry') },
      }),
    }),

    // Feature modules
    AuthModule,
    DevicesModule,
    ReadingsModule,
    AnalyticsModule,
    MqttModule,
    ExportModule,
    HealthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
