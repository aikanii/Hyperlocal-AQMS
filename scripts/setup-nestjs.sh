#!/bin/bash

# HY-AQMS NestJS Backend - Complete Setup Script
# This script initializes a complete NestJS project for HY-AQMS

set -e

echo "================================"
echo "HY-AQMS Backend - NestJS Setup"
echo "================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

echo "✅ Node.js version: $(node --version)"
echo "✅ npm version: $(npm --version)"
echo ""

# Step 1: Install NestJS CLI globally
echo "📦 Installing NestJS CLI..."
npm install -g @nestjs/cli
echo "✅ NestJS CLI installed"
echo ""

# Step 2: Navigate to backend directory
BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$BACKEND_DIR"

echo "📂 Backend directory: $BACKEND_DIR"
echo ""

# Step 3: Initialize NestJS project (if not already done)
if [ ! -d "src" ]; then
    echo "🚀 Creating NestJS project structure..."
    
    # Create directory structure manually
    mkdir -p src/{modules,config,common,shared}
    mkdir -p src/common/{decorators,filters,guards,interceptors,middleware,pipes}
    mkdir -p src/modules/{auth,devices,readings,analytics,mqtt,export,health}
    mkdir -p src/shared/{services,interfaces}
    mkdir -p test/{unit,integration,e2e}
    
    echo "✅ Directory structure created"
else
    echo "⏭️  Project structure already exists"
fi

echo ""

# Step 4: Install dependencies
echo "📚 Installing dependencies (this may take a few minutes)..."

npm install \
  @nestjs/common \
  @nestjs/core \
  @nestjs/jwt \
  @nestjs/passport \
  @nestjs/platform-express \
  @nestjs/swagger \
  @nestjs/typeorm \
  @nestjs/config \
  bcryptjs \
  class-transformer \
  class-validator \
  dotenv \
  helmet \
  joi \
  mqtt \
  passport \
  passport-jwt \
  pg \
  redis \
  reflect-metadata \
  rimraf \
  rxjs \
  socket.io \
  swagger-ui-express \
  typeorm \
  uuid

echo "✅ Dependencies installed"
echo ""

# Step 5: Install dev dependencies
echo "📦 Installing dev dependencies..."

npm install --save-dev \
  @nestjs/cli \
  @nestjs/schematics \
  @nestjs/testing \
  @types/express \
  @types/jest \
  @types/node \
  @types/passport-jwt \
  @types/supertest \
  @typescript-eslint/eslint-plugin \
  @typescript-eslint/parser \
  eslint \
  eslint-config-prettier \
  eslint-plugin-prettier \
  jest \
  prettier \
  supertest \
  ts-jest \
  ts-loader \
  ts-node \
  tsconfig-paths \
  typescript

echo "✅ Dev dependencies installed"
echo ""

# Step 6: Create TypeScript configuration
echo "⚙️  Creating tsconfig.json..."
cat > tsconfig.json << 'EOF'
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
    },
    "typeRoots": ["./node_modules/@types"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test", "**/*spec.ts"]
}
EOF
echo "✅ tsconfig.json created"
echo ""

# Step 7: Create ESLint configuration
echo "⚙️  Creating ESLint configuration..."
cat > .eslintrc.js << 'EOF'
module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin', 'prettier'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js', 'dist', 'node_modules'],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    'prettier/prettier': 'error',
  },
};
EOF
echo "✅ ESLint configuration created"
echo ""

# Step 8: Create prettier configuration
echo "⚙️  Creating Prettier configuration..."
cat > .prettierrc << 'EOF'
{
  "printWidth": 100,
  "trailingComma": "all",
  "tabWidth": 2,
  "semi": true,
  "singleQuote": true,
  "bracketSpacing": true,
  "arrowParens": "always"
}
EOF
echo "✅ Prettier configuration created"
echo ""

# Step 9: Create .env.example
echo "⚙️  Creating .env.example..."
cat > .env.example << 'EOF'
# Server Configuration
NODE_ENV=development
PORT=3001

# Database (PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hy_aqms
DB_USER=postgres
DB_PASSWORD=postgres
DB_SSL=false
DB_LOGGING=false
DB_POOL_MIN=5
DB_POOL_MAX=20

# Redis Cache
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT Authentication
JWT_SECRET=your_super_secret_jwt_key_min_32_characters_long
JWT_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d

# MQTT Broker
MQTT_BROKER=mqtt://localhost:1883
MQTT_USERNAME=iot_device
MQTT_PASSWORD=password

# CORS
CORS_ORIGIN=http://localhost:3000

# Security
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# ML Service
ML_SERVICE_URL=http://localhost:8000

# MinIO Object Storage
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
EOF
echo "✅ .env.example created"
echo ""

echo "================================"
echo "✅ Setup Complete!"
echo "================================"
echo ""
echo "Next steps:"
echo "  1. Copy .env.example to .env and update values"
echo "  2. Create the NestJS module files (see NESTJS_MIGRATION_GUIDE.md)"
echo "  3. Run migrations: npm run migration:run"
echo "  4. Start development server: npm run start:dev"
echo ""
echo "For more information, see NESTJS_MIGRATION_GUIDE.md"
echo ""
