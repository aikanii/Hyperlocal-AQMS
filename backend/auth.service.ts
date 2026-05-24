import * as bcrypt from 'bcryptjs';

export class AuthService {
  constructor(private usersRepo: any, private refreshRepo: any, private jwtService: any) {}

  async login(email: string, password: string) {
    const user = await this.usersRepo.findOne({ where: { email } });
    if (!user) {
      throw new Error('Unauthorized');
    }

    const match = await bcrypt.compare(password, (user as any).passwordHash || user.password);
    if (!match) {
      // increment failed attempts (best-effort)
      try {
        await this.usersRepo.update(user.id, { failedLoginAttempts: ((user.failedLoginAttempts || 0) + 1) });
      } catch (e) {
        // ignore
      }
      throw new Error('Unauthorized');
    }

    // reset failed attempts
    try {
      if (user.failedLoginAttempts && user.failedLoginAttempts > 0) {
        await this.usersRepo.update(user.id, { failedLoginAttempts: 0 });
      }
    } catch (e) {
      // ignore
    }

    const payload = { sub: user.id, role: user.role };
    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });

    const refreshEntity = { id: 'rt-' + (user.id || 'unknown'), userId: user.id, token: 'refresh-' + Date.now() };
    await this.refreshRepo.save(refreshEntity);

    return { accessToken, refreshToken: refreshEntity.token };
  }

  async register(email: string, password: string) {
    const hash = await bcrypt.hash(password, 8);
    const user = { id: 'u-' + Date.now(), email, passwordHash: hash, role: 'user', isActive: true };
    return this.usersRepo.save(user);
  }

  async refresh(refreshToken: string) {
    const row = await this.refreshRepo.findOne({ where: { token: refreshToken } });
    if (!row) throw new Error('Invalid refresh token');
    const payload = { sub: row.userId };
    return { accessToken: this.jwtService.sign(payload, { expiresIn: '15m' }) };
  }
}
