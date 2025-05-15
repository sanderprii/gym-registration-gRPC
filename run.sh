#!/bin/bash

# run.sh - Start script for Gym Registration gRPC Service

set -e

echo "Starting Gym Registration gRPC Service..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js 16+ to continue."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "Error: npm is not installed. Please install npm to continue."
    exit 1
fi

# Check if protoc is installed
if ! command -v protoc &> /dev/null; then
    echo "Error: Protocol Buffers compiler (protoc) is not installed."
    echo "Please install protoc from https://protobuf.dev/downloads/"
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cp .env.example .env
    echo "Please edit the .env file with your configuration before running again."
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
npm install

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

# Run database migrations
echo "Running database migrations..."
npx prisma migrate dev --name init

# Note: Protocol buffers are loaded at runtime using @grpc/proto-loader
# No compilation needed for our implementation
echo "Using runtime proto loading (no compilation needed)..."

# Start the gRPC server
echo "Starting gRPC server..."
node src/grpc_server.js &
GRPC_PID=$!
echo "gRPC service started with PID: $GRPC_PID"

# Create a simple process monitor script
cat > stop_service.sh << 'EOF'
#!/bin/bash
echo "Stopping gRPC service..."

# Stop gRPC service
if [ ! -z "$GRPC_PID" ] && kill -0 $GRPC_PID 2>/dev/null; then
    kill $GRPC_PID
    echo "gRPC service stopped"
fi

# Also kill by name in case PID tracking failed
pkill -f "grpc_server.js" 2>/dev/null || true

echo "Service stopped"
EOF

chmod +x stop_service.sh

echo ""
echo "=== Gym Registration gRPC Service Started ==="
echo "gRPC Server: localhost:50051"
echo "Protocol: gRPC"
echo ""
echo "Press Ctrl+C to stop the service, or run ./stop_service.sh"
echo "=== Service is running ==="

# Wait for Ctrl+C
trap './stop_service.sh' INT

# Keep the script running
wait