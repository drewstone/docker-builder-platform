# Docker Build Platform

A high-performance Docker build platform with distributed caching, multi-architecture support, and CI/CD integrations - a feature-parity alternative to Depot.dev.

## Features

- **Remote Docker/OCI builds** with BuildKit integration
- **Native multi-arch support** (x86_64/arm64) without emulation
- **Distributed persistent cache** system with MinIO backend
- **CI/CD integrations** (GitHub Actions, GitLab, etc.)
- **Web console** with analytics and build monitoring
- **CLI** with full Docker buildx command parity
- **API-first architecture** with comprehensive REST API
- **Build queue management** with priority scheduling
- **Project isolation** and team collaboration

## Architecture

The platform consists of several key components:

- **Control Plane API**: FastAPI-based REST API for orchestration
- **Builder Service**: BuildKit integration for container builds
- **Cache Service**: Distributed layer cache with MinIO storage
- **CLI Tool**: Command-line interface with buildx parity
- **Web Dashboard**: React-based monitoring and analytics UI

## Quick Start

### Prerequisites

- Node.js 18+ (tested with v22)
- Docker and Docker Compose
- PostgreSQL 15+ (via Docker Compose)
- Redis 7+ (via Docker Compose)
- MinIO (via Docker Compose)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/docker-build-platform.git
cd docker-build-platform
```

2. Copy the example environment file:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Install dependencies:
```bash
npm run install:all
```

4. Generate Prisma client:
```bash
npm run generate
```

5. Start infrastructure services:
```bash
docker-compose up -d
```

6. Run database migrations:
```bash
npm run migrate
```

7. Build the project:
```bash
npm run build
```

8. Start the API server:
```bash
npm run dev:api
```

9. In another terminal, link the CLI globally:
```bash
cd cli
npm link
```

Now you can use the `dbp` command from anywhere.

## Usage

### CLI Commands

The CLI provides Docker buildx-compatible commands:

```bash
# Login to the platform
dbp login

# Create a new project
dbp project create my-project

# Build an image
dbp build -t myimage:latest .

# Build for multiple platforms
dbp build --platform linux/amd64,linux/arm64 -t myimage:latest .

# Push to registry
dbp build --push -t registry.example.com/myimage:latest .

# View cache statistics
dbp cache stats

# Clear project cache
dbp cache reset
```

### API Endpoints

The Control Plane API provides comprehensive REST endpoints:

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/projects` - List projects
- `POST /api/projects` - Create project
- `POST /api/builds` - Start new build
- `GET /api/builds/{id}` - Get build status
- `GET /api/cache/stats` - Cache statistics
- `GET /api/analytics` - Usage analytics

Full API documentation available at `http://localhost:3000/docs` when the server is running.

## Development

### Project Structure

```
docker-build-platform/
├── services/
│   └── control-plane/     # API service
│       ├── src/
│       │   ├── routes/    # API endpoints
│       │   ├── services/  # Business logic
│       │   ├── middleware/
│       │   └── plugins/
│       └── prisma/        # Database schema
├── cli/                   # CLI tool
│   └── src/
│       ├── commands/      # CLI commands
│       └── utils/         # Helpers
├── docker-compose.yml     # Infrastructure setup
├── package.json          # Root package
└── tsconfig.json         # TypeScript config
```

### Available Scripts

```bash
# Development
npm run dev           # Start all services in dev mode
npm run dev:api       # Start API server only
npm run dev:cli       # Start CLI in dev mode

# Building
npm run build         # Build all components
npm run build:api     # Build API server
npm run build:cli     # Build CLI tool

# Testing
npm run test          # Run all tests
npm run test:api      # Test API
npm run test:cli      # Test CLI

# Database
npm run migrate       # Run database migrations
npm run generate      # Generate Prisma client

# Code Quality
npm run lint          # Run linter
npm run typecheck     # TypeScript type checking
```

### Environment Variables

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/dbp"

# Redis
REDIS_URL="redis://localhost:6379"

# MinIO
MINIO_ENDPOINT="localhost"
MINIO_PORT="9000"
MINIO_ACCESS_KEY="minioadmin"
MINIO_SECRET_KEY="minioadmin"

# JWT
JWT_SECRET="your-secret-key-here"

# API
API_PORT=3000
API_HOST=0.0.0.0
```

## Configuration

### Docker Compose Services

The platform uses Docker Compose to manage infrastructure:

- PostgreSQL on port 5432
- Redis on port 6379
- MinIO on ports 9000 (API) and 9001 (Console)
- Prometheus on port 9090
- Grafana on port 3001

### BuildKit Configuration

BuildKit settings are in `buildkit/buildkitd.toml`:
- Multi-platform builds enabled
- Distributed cache configured
- Registry mirrors supported

## Troubleshooting

### Common Issues

1. **Build or TypeScript errors**
   - Ensure Prisma client is generated: `npm run generate`
   - Reinstall dependencies: `rm -rf node_modules package-lock.json && npm run install:all`
   - Clear TypeScript build info: `find . -name '*.tsbuildinfo' -delete`

2. **Cannot connect to database**
   - Ensure PostgreSQL is running: `docker-compose up -d postgres`
   - Check DATABASE_URL in .env file

3. **CLI command 'dbp' not found**
   - Ensure you've run `npm link` in the cli directory
   - Alternatively, use directly: `node cli/dist/index.js`
   - Or use npx: `cd cli && npx dbp status`

4. **Cache not working**
   - Verify MinIO is running: `docker-compose ps`
   - Check MinIO credentials in .env

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Testing the Installation

After setup, verify everything works:

```bash
# Check TypeScript compilation
npm run typecheck

# Run linter
npm run lint

# Test CLI help
dbp --help

# Check API health (requires running server)
curl http://localhost:3000/health
```

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Built with FastAPI, Fastify, BuildKit, and Prisma
- Inspired by Depot.dev's excellent build platform
- Uses best practices from cloud-native build systems