import { AuthService } from './auth.service';
// Test-only lightweight User/RefreshToken shapes
type User = any;
type RefreshToken = any;

// Simple Jest unit tests for AuthService (mocks TypeORM repository & JwtService)

describe('AuthService (unit)', () => {
  let authService: AuthService;
  const mockUsersRepo: any = {
    findOne: jest.fn(),
    update: jest.fn(),
  };
  const mockRefreshRepo: any = {
    save: jest.fn(),
  };
  const mockJwtService: any = {
    sign: jest.fn().mockImplementation((payload, opts) => `token-${payload.sub}`),
  };

  beforeEach(() => {
    // Create instance with mocked dependencies
    // @ts-ignore - bypass constructor typing for unit test
    authService = new AuthService(mockUsersRepo, mockRefreshRepo, mockJwtService);
    jest.clearAllMocks();
  });

  it('should return access and refresh tokens for valid credentials', async () => {
    const passwordHash = require('bcryptjs').hashSync('Password123!', 8);
    const user = { id: 'uuid-1', email: 'test@example.com', passwordHash, role: 'admin', isActive: true } as User;
    mockUsersRepo.findOne.mockResolvedValue(user);

    const result = await authService.login('test@example.com', 'Password123!');

    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
    expect(mockRefreshRepo.save).toHaveBeenCalled();
  });

  it('should throw UnauthorizedException for invalid password', async () => {
    const passwordHash = require('bcryptjs').hashSync('Password123!', 8);
    const user = { id: 'uuid-1', email: 'test@example.com', passwordHash, role: 'admin' } as User;
    mockUsersRepo.findOne.mockResolvedValue(user);

    await expect(authService.login('test@example.com', 'WrongPassword')).rejects.toThrow();
    expect(mockUsersRepo.update).toHaveBeenCalled();
  });

  it('should throw UnauthorizedException when user not found', async () => {
    mockUsersRepo.findOne.mockResolvedValue(null);
    await expect(authService.login('missing@example.com', 'Password123!')).rejects.toThrow();
  });
});
