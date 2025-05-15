# Gym Registration gRPC Service

A comprehensive gym registration gRPC service that provides identical functionality to the existing REST API. This project demonstrates functional equivalence between REST and gRPC architectures for the same business logic.

## Table of Contents

- [Project Overview](#project-overview)
- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [gRPC Services](#grpc-services)
- [Protocol Buffers](#protocol-buffers)
- [Testing](#testing)
- [Client Examples](#client-examples)
- [Project Structure](#project-structure)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Comparison with REST](#comparison-with-rest)

## Project Overview

This project provides a complete gym registration management system via gRPC with:

- **gRPC Service** - High-performance RPC interface with Protocol Buffers
- **Functional Equivalence** - Identical business functionality to REST API
- **Comprehensive Testing** - Automated tests comparing gRPC with REST responses
- **Type Safety** - Protocol Buffers provide strong typing and schema validation

### Core Entities

- **Trainees** - Gym members with authentication
- **Workouts** - Exercise types with duration and details
- **Routines** - Trainee availability schedules
- **Registrations** - Workout session bookings

## Features

### gRPC Service Features
- Protocol Buffers (protobuf) for efficient serialization
- Strong typing and schema validation
- bi-directional streaming support (if needed)
- Automatic code generation for multiple languages
- Built-in authentication and error handling

### Common Features (Same as REST)
- JWT-based authentication
- Full CRUD operations
- Identical business logic
- Same database backend
- Equivalent error handling
- Consistent data validation

## Architecture

```
┌─────────────────────────────────────────────┐
│               gRPC Clients                  │
│        (Generated from .proto)             │
└─────────────────┬───────────────────────────┘
                  │ gRPC Protocol
┌─────────────────┴───────────────────────────┐
│              gRPC Server                    │
│            (Port 50051)                     │
├─────────────────────────────────────────────┤
│           Business Logic Layer              │
│        (Same as REST API)                   │
├─────────────────────────────────────────────┤
│            Database Layer                   │
│              (SQLite)                       │
└─────────────────────────────────────────────┘
```

## Prerequisites

- **Node.js** 16.x or higher
- **npm** 6.x or higher
- **Protocol Buffers compiler (protoc)** - [Installation Guide](https://protobuf.dev/downloads/)


### Installing Protocol Buffers

#### macOS
```bash
brew install protobuf
```

#### Ubuntu/Debian
```bash
sudo apt update
sudo apt install protobuf-compiler
```

#### Windows
Download from [Protocol Buffers Releases](https://github.com/protocolbuffers/protobuf/releases) and add to PATH.

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/username/gym-registration-grpc
   cd gym-registration-grpc
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` file with your configuration:
   ```env
   DATABASE_URL="file:./dev.db"
   GRPC_PORT=50051
   JWT_SECRET=your_secure_jwt_secret_here
   ```

4. **Initialize database**
   ```bash
   npx prisma generate
   npx prisma migrate dev --name init
   ```

## Quick Start

### Start the gRPC Service
```bash
# Make the run script executable
chmod +x run.sh

# Start the service
./run.sh
```

The script will:
1. Check prerequisites (Node.js, npm, protoc)
2. Install dependencies
3. Set up the database
4. Compile Protocol Buffers
5. Start the gRPC server on port 50051

### Verify the Service
```bash
# Run the client example
npm run test:client

# Run gRPC-only tests
npm run test:grpc
```

## gRPC Services

The gRPC service provides five main services:

### SessionService
- `CreateSession` - Login with email/password
- `DeleteSession` - Logout
- `CheckSession` - Validate session token

### TraineeService
- `ListTrainees` - Get paginated list of trainees
- `CreateTrainee` - Create new trainee
- `GetTrainee` - Get trainee by ID
- `UpdateTrainee` - Update trainee (partial)
- `DeleteTrainee` - Delete trainee

### WorkoutService
- `ListWorkouts` - Get all workout types
- `CreateWorkout` - Create new workout type
- `GetWorkout` - Get workout by ID
- `UpdateWorkout` - Update workout (partial)
- `DeleteWorkout` - Delete workout

### RoutineService
- `ListRoutines` - Get routines (optionally by trainee)
- `CreateRoutine` - Create new routine
- `GetTraineeRoutine` - Get trainee's routine
- `UpdateTraineeRoutine` - Update routine
- `DeleteTraineeRoutine` - Delete routine

### RegistrationService
- `ListRegistrations` - Get all registrations
- `CreateRegistration` - Create new registration
- `GetRegistration` - Get registration by ID
- `UpdateRegistration` - Update registration (partial)
- `DeleteRegistration` - Delete registration

## Protocol Buffers

The service definition is in `proto/gym_registration.proto`. Key features:

- **Strong Typing** - All fields have explicit types
- **Optional Fields** - Using `optional` keyword for partial updates
- **Timestamps** - Using `google.protobuf.Timestamp` for dates
- **Nested Messages** - Complex types like `TimeSlot` and `Trainee`

### Compiling Protobuf

The `run.sh` script automatically compiles the protobuf, but you can also do it manually:

```bash
npm run compile:proto
```

## Testing

### Run All Tests (with REST Comparison)
```bash
# Automated comparison with REST API
npm test
```

### Run gRPC-Only Tests
```bash
# Test gRPC service independently
npm run test:grpc
```

### Test Coverage

1. **Authentication Tests**
   - Login/logout functionality
   - Session validation
   - Token verification

2. **CRUD Operation Tests**
   - Create, read, update, delete for all entities
   - Data consistency validation

3. **Error Handling Tests**
   - Invalid token scenarios
   - Missing required fields
   - Not found errors
   - gRPC status codes

4. **Comparison Tests** (when REST is available)
   - Request/response equivalence
   - Same business logic validation
   - Error consistency

## Client Examples

### Basic Usage
```javascript
const client = new GymRegistrationGrpcClient();

// Login
await client.createSession('test@example.com', 'password123');

// Create a trainee
await client.createTrainee('John Doe', 'john@example.com', 'password', 'UTC');

// List trainees
const trainees = await client.listTrainees(1, 10);

// Logout
await client.deleteSession();
```

### Run the Example Client
```bash
npm run test:client
```

## Project Structure

```
gym-registration-grpc/
├── README.md
├── package.json
├── .env.example
├── run.sh                    # Main startup script
├── proto/
│   └── gym_registration.proto # Protocol Buffers definition
├── src/
│   └── grpc_server.js        # gRPC service implementation
├── tests/
│   ├── test.sh               # Test runner script
│   ├── test_comparison.js    # REST vs gRPC comparison tests
│   └── test_grpc_only.js     # gRPC standalone tests
├── client/
│   └── grpc_client.js        # Example gRPC client
├── prisma/
│   ├── schema.prisma         # Database schema
│   └── migrations/           # Database migrations
└── .gitignore
```

## Development

### Development Commands
```bash
# Start server with auto-reload
npm run dev

# Database operations
npm run db:migrate
npm run db:generate
npm run db:studio
npm run db:reset

# Compile protobuf manually
npm run compile:proto
```


## Comparison with REST

| Feature | REST API | gRPC Service |
|---------|----------|--------------|
| Protocol | HTTP/JSON | HTTP/2 + Protocol Buffers |
| Schema | OpenAPI/Swagger | Protocol Buffers |
| Type Safety | Runtime validation | Compile-time validation |
| Code Generation | Optional | Automatic |
| Performance | Good | Better (binary protocol) |
| Browser Support | Native | Requires proxy |
| Streaming | Limited | Native support |

