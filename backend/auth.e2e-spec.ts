import * as request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module';

describe('AuthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/auth/login (POST) - invalid creds', async () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'noone@example.com', password: 'wrong' })
      .expect(401);
  });

  // NOTE: A valid credentials test requires DB seeding with a known user.
});
