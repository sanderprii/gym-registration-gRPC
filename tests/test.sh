#!/bin/bash

echo "Running automated tests for gRPC service..."

# Check if gRPC service is running
echo "Checking if gRPC service is running..."
if ! nc -z localhost 50051; then
    echo "Error: gRPC service is not running on port 50051"
    echo "Please start it with: ./run.sh"
    exit 1
fi

# Check if REST service is running
echo "Checking if REST service is running..."
if ! curl -f http://localhost:3000 > /dev/null 2>&1; then
    echo "Warning: REST service is not running on port 3000"
    echo "Starting REST service for comparison tests..."

    # Try to start REST service in background
    cd ../gym-registration-api 2>/dev/null || {
        echo "Error: REST API not found. Please ensure REST service is running"
        echo "Skipping comparison tests, running gRPC-only tests..."
        node tests/test_grpc_only.js
        exit $?
    }

    npm start &
    REST_PID=$!
    sleep 3

    # Check if it started successfully
    if ! curl -f http://localhost:3000 > /dev/null 2>&1; then
        echo "Error: Failed to start REST service"
        echo "Running gRPC-only tests..."
        kill $REST_PID 2>/dev/null || true
        node tests/test_grpc_only.js
        exit $?
    fi

    echo "REST service started for comparison"
fi

# Run Node.js comparison tests
echo "Running comparison tests between REST and gRPC..."
cd "$(dirname "$0")"
node test_comparison.js

TEST_RESULT=$?

# Clean up REST service if we started it
if [ ! -z "$REST_PID" ]; then
    kill $REST_PID 2>/dev/null || true
    echo "Cleaned up REST service"
fi

if [ $TEST_RESULT -eq 0 ]; then
    echo "✓ All tests passed successfully!"
    exit 0
else
    echo "✗ Some tests failed!"
    exit 1
fi