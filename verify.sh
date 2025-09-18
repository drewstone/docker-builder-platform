#!/bin/bash

# Docker Build Platform - Installation Verification Script

set -e

echo "================================================"
echo "Docker Build Platform - Verification Script"
echo "================================================"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print success
success() {
    echo -e "${GREEN}✓${NC} $1"
}

# Function to print error
error() {
    echo -e "${RED}✗${NC} $1"
    exit 1
}

# Function to print warning
warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check Node.js version
echo "1. Checking Node.js version..."
NODE_VERSION=$(node -v)
if [[ $NODE_VERSION == v* ]]; then
    success "Node.js installed: $NODE_VERSION"
else
    error "Node.js not found"
fi

# Check npm version
echo ""
echo "2. Checking npm version..."
NPM_VERSION=$(npm -v)
if [[ $NPM_VERSION ]]; then
    success "npm installed: $NPM_VERSION"
else
    error "npm not found"
fi

# Check dependencies installed
echo ""
echo "3. Checking dependencies..."
if [ -d "node_modules" ]; then
    success "Root dependencies installed"
else
    error "Root dependencies not installed. Run: npm run install:all"
fi

# Workspace dependencies are in root node_modules
if [ -d "node_modules/chalk" ]; then
    success "CLI dependencies installed (workspace)"
else
    error "CLI dependencies not installed. Run: npm run install:all"
fi

if [ -d "node_modules/@fastify/cors" ]; then
    success "API dependencies installed (workspace)"
else
    error "API dependencies not installed. Run: npm run install:all"
fi

# Check Prisma client
echo ""
echo "4. Checking Prisma client..."
if [ -d "node_modules/@prisma/client" ]; then
    success "Prisma client generated"
else
    error "Prisma client not generated. Run: npm run generate"
fi

# Check builds
echo ""
echo "5. Checking build outputs..."
if [ -d "cli/dist" ]; then
    success "CLI built successfully"
else
    warning "CLI not built. Run: npm run build:cli"
fi

if [ -d "services/control-plane/dist" ]; then
    success "API built successfully"
else
    warning "API not built. Run: npm run build:api"
fi

# Check CLI binary
echo ""
echo "6. Checking CLI binary..."
if [ -f "cli/dist/index.js" ]; then
    if [ -x "cli/dist/index.js" ]; then
        success "CLI binary is executable"
    else
        error "CLI binary is not executable"
    fi
else
    error "CLI binary not found"
fi

# Run TypeScript check
echo ""
echo "7. Running TypeScript type check..."
if npm run typecheck > /dev/null 2>&1; then
    success "TypeScript compilation successful"
else
    error "TypeScript compilation failed. Run: npm run typecheck"
fi

# Run linter
echo ""
echo "8. Running linter..."
if npm run lint > /dev/null 2>&1; then
    success "Linting passed"
else
    warning "Linting has issues. Run: npm run lint"
fi

# Check environment file
echo ""
echo "9. Checking environment configuration..."
if [ -f ".env.example" ]; then
    success ".env.example file exists"
else
    error ".env.example file not found"
fi

if [ -f ".env" ]; then
    success ".env file exists"
else
    warning ".env file not found. Copy from .env.example: cp .env.example .env"
fi

# Check CLI command
echo ""
echo "10. Checking CLI availability..."
if command -v dbp &> /dev/null; then
    CLI_VERSION=$(dbp --version)
    success "CLI globally linked: v$CLI_VERSION"
else
    warning "CLI not globally available. Run: cd cli && npm link"
fi

# Test CLI help
echo ""
echo "11. Testing CLI help command..."
if node cli/dist/index.js --help > /dev/null 2>&1; then
    success "CLI help command works"
else
    error "CLI help command failed"
fi

# Check important files
echo ""
echo "12. Checking project files..."
FILES_TO_CHECK=(
    "package.json"
    "tsconfig.json"
    ".gitignore"
    "README.md"
    "docker-compose.yml"
    "services/control-plane/prisma/schema.prisma"
)

for file in "${FILES_TO_CHECK[@]}"; do
    if [ -f "$file" ]; then
        success "$file exists"
    else
        error "$file not found"
    fi
done

echo ""
echo "================================================"
echo "Verification Complete!"
echo "================================================"
echo ""
echo "Next steps:"
echo "1. Copy and configure .env file: cp .env.example .env"
echo "2. Start Docker services: docker-compose up -d"
echo "3. Run database migrations: npm run migrate"
echo "4. Start API server: npm run dev:api"
echo "5. Test the CLI: dbp status"
echo ""
echo "For more information, see README.md"