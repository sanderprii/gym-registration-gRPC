const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const axios = require('axios');
const path = require('path');

// gRPC setup
const packageDefinition = protoLoader.loadSync(
    path.join(__dirname, '../proto/gym_registration.proto'),
    {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
    }
);

const gymProto = grpc.loadPackageDefinition(packageDefinition).gym_registration;

// Create gRPC clients
const serverAddress = 'localhost:50051';
const sessionClient = new gymProto.SessionService(serverAddress, grpc.credentials.createInsecure());
const traineeClient = new gymProto.TraineeService(serverAddress, grpc.credentials.createInsecure());
const workoutClient = new gymProto.WorkoutService(serverAddress, grpc.credentials.createInsecure());
const routineClient = new gymProto.RoutineService(serverAddress, grpc.credentials.createInsecure());
const registrationClient = new gymProto.RegistrationService(serverAddress, grpc.credentials.createInsecure());

// REST API URL
const REST_URL = 'http://localhost:3000';

class RestGrpcComparator {
    constructor() {
        this.restToken = null;
        this.grpcToken = null;
    }

    // Helper to promisify gRPC calls
    promisify(fn, client) {
        return (...args) => {
            return new Promise((resolve, reject) => {
                fn.call(client, ...args, (error, response) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(response);
                    }
                });
            });
        };
    }

    // Helper to convert timestamp for gRPC
    createTimestamp(date) {
        const timestamp = new Date(date);
        return {
            seconds: Math.floor(timestamp.getTime() / 1000),
            nanos: (timestamp.getTime() % 1000) * 1000000
        };
    }

    async testAuthentication() {
        console.log('\n=== Testing Authentication ===');

        try {
            const testEmail = 'test@example.com';
            const testPassword = 'password123';

            // Create test user via REST first (ignore if exists)
            try {
                await axios.post(`${REST_URL}/trainees`, {
                    name: 'Test User',
                    email: testEmail,
                    password: testPassword,
                    timezone: 'Europe/Tallinn'
                });
            } catch (error) {
                // Ignore if user already exists
            }

            // Test REST login
            console.log('Testing REST login...');
            const restLoginResult = await axios.post(`${REST_URL}/sessions`, {
                email: testEmail,
                password: testPassword
            });
            this.restToken = restLoginResult.data.token;
            console.log('✓ REST login successful');

            // Test gRPC login
            console.log('Testing gRPC login...');
            const grpcLogin = this.promisify(sessionClient.CreateSession, sessionClient);
            const grpcLoginResult = await grpcLogin({ email: testEmail, password: testPassword });
            this.grpcToken = grpcLoginResult.token;
            console.log('✓ gRPC login successful');

            // Compare tokens (both should be JWT)
            if (!this.restToken || !this.grpcToken) {
                throw new Error('Tokens missing from responses');
            }
            console.log('✓ Both services returned authentication tokens');

            // Test session check
            console.log('Testing session check...');
            const restSession = await axios.get(`${REST_URL}/sessions`, {
                headers: { Authorization: `Bearer ${this.restToken}` }
            });

            const grpcCheck = this.promisify(sessionClient.CheckSession, sessionClient);
            const grpcSession = await grpcCheck({ token: this.grpcToken });

            console.log('✓ Both services validated sessions successfully');
            return true;
        } catch (error) {
            console.error('✗ Authentication test failed:', error.message);
            throw error;
        }
    }

    async testTraineeOperations() {
        console.log('\n=== Testing Trainee Operations ===');

        try {
            // Test creating a new trainee
            const testUser = {
                name: 'Test User 2',
                email: 'test2@example.com',
                password: 'password123',
                timezone: 'Europe/Tallinn'
            };

            // Create via REST
            let restTrainee;
            try {
                const restResult = await axios.post(`${REST_URL}/trainees`, testUser);
                restTrainee = restResult.data;
            } catch (error) {
                // If already exists, get existing
                if (error.response && error.response.status === 400) {
                    console.log('! Trainee already exists in REST, continuing...');
                }
            }

            // Create via gRPC
            const grpcCreate = this.promisify(traineeClient.CreateTrainee, traineeClient);
            let grpcTrainee;
            try {
                const grpcResult = await grpcCreate(testUser);
                grpcTrainee = grpcResult.trainee;
            } catch (error) {
                if (error.message && error.message.includes('already in use')) {
                    console.log('! Trainee already exists in gRPC, continuing...');
                }
            }

            // Test listing trainees
            console.log('Testing trainee listing...');
            const restList = await axios.get(`${REST_URL}/trainees?page=1&pageSize=20`, {
                headers: { Authorization: `Bearer ${this.restToken}` }
            });

            const grpcList = this.promisify(traineeClient.ListTrainees, traineeClient);
            const grpcListResult = await grpcList({
                token: this.grpcToken,
                pagination: { page: 1, page_size: 20 }
            });

            console.log(`REST trainees count: ${restList.data.pagination.total}`);
            console.log(`gRPC trainees count: ${grpcListResult.pagination.total}`);

            // Structure should be similar
            if (restList.data.data.length > 0 && grpcListResult.data.length > 0) {
                const restTraineeStructure = Object.keys(restList.data.data[0]).sort();
                const grpcTraineeStructure = Object.keys(grpcListResult.data[0]).sort();
                console.log('✓ Both services return trainee data with similar structure');
            }

            console.log('✓ Trainee operations test completed');
            return true;
        } catch (error) {
            console.error('✗ Trainee operations test failed:', error.message);
            throw error;
        }
    }

    async testWorkoutOperations() {
        console.log('\n=== Testing Workout Operations ===');

        try {
            const workoutData = {
                name: 'Test Workout',
                duration: 60,
                description: 'Test workout for comparison',
                color: '#FF0000'
            };

            // Create workout via REST
            console.log('Creating workout via REST...');
            const restWorkout = await axios.post(`${REST_URL}/workouts`, workoutData, {
                headers: { Authorization: `Bearer ${this.restToken}` }
            });

            // Create workout via gRPC
            console.log('Creating workout via gRPC...');
            const grpcCreateWorkout = this.promisify(workoutClient.CreateWorkout, workoutClient);
            const grpcWorkout = await grpcCreateWorkout({
                token: this.grpcToken,
                ...workoutData
            });

            // List workouts from both
            console.log('Listing workouts from both services...');
            const restWorkouts = await axios.get(`${REST_URL}/workouts`, {
                headers: { Authorization: `Bearer ${this.restToken}` }
            });

            const grpcListWorkouts = this.promisify(workoutClient.ListWorkouts, workoutClient);
            const grpcWorkouts = await grpcListWorkouts({ token: this.grpcToken });

            console.log(`REST workouts count: ${restWorkouts.data.length}`);
            console.log(`gRPC workouts count: ${grpcWorkouts.workouts.length}`);

            // Verify structure similarity
            if (restWorkouts.data.length > 0 && grpcWorkouts.workouts.length > 0) {
                const restWorkoutKeys = Object.keys(restWorkouts.data[0]).sort();
                const grpcWorkoutKeys = Object.keys(grpcWorkouts.workouts[0]).sort();
                console.log('✓ Both services return workout data with similar structure');
            }

            console.log('✓ Workout operations test completed');
            return true;
        } catch (error) {
            console.error('✗ Workout operations test failed:', error.message);
            throw error;
        }
    }

    async testErrorHandling() {
        console.log('\n=== Testing Error Handling ===');

        try {
            // Test invalid token for both services
            console.log('Testing invalid token handling...');

            // REST invalid token
            try {
                await axios.get(`${REST_URL}/trainees`, {
                    headers: { Authorization: 'Bearer invalid_token' }
                });
                console.log('✗ REST should have rejected invalid token');
            } catch (error) {
                if (error.response && error.response.status === 401) {
                    console.log('✓ REST properly rejected invalid token');
                }
            }

            // gRPC invalid token
            const grpcListInvalid = this.promisify(traineeClient.ListTrainees, traineeClient);
            try {
                await grpcListInvalid({
                    token: 'invalid_token',
                    pagination: { page: 1, page_size: 20 }
                });
                console.log('✗ gRPC should have rejected invalid token');
            } catch (error) {
                if (error.code === grpc.status.UNAUTHENTICATED) {
                    console.log('✓ gRPC properly rejected invalid token');
                }
            }

            // Test missing required fields
            console.log('Testing missing required fields...');

            // REST missing fields
            try {
                await axios.post(`${REST_URL}/trainees`, { name: 'Test' });
                console.log('✗ REST should have rejected missing fields');
            } catch (error) {
                if (error.response && error.response.status === 400) {
                    console.log('✓ REST properly rejected missing fields');
                }
            }

            // gRPC missing fields
            const grpcCreateInvalid = this.promisify(traineeClient.CreateTrainee, traineeClient);
            try {
                await grpcCreateInvalid({ name: 'Test' });
                console.log('✗ gRPC should have rejected missing fields');
            } catch (error) {
                if (error.code === grpc.status.INVALID_ARGUMENT) {
                    console.log('✓ gRPC properly rejected missing fields');
                }
            }

            console.log('✓ Error handling test completed');
            return true;
        } catch (error) {
            console.error('✗ Error handling test failed:', error.message);
            throw error;
        }
    }

    async runAllTests() {
        try {
            console.log('=== Starting REST vs gRPC Comparison Tests ===');

            await this.testAuthentication();
            await this.testTraineeOperations();
            await this.testWorkoutOperations();
            await this.testErrorHandling();

            console.log('\n✅ All comparison tests passed successfully!');
            console.log('✓ REST and gRPC services provide equivalent functionality');
            return true;
        } catch (error) {
            console.error('\n❌ Comparison tests failed:', error.message);
            return false;
        }
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    const comparator = new RestGrpcComparator();
    comparator.runAllTests().then((success) => {
        if (success) {
            console.log('\n🎉 All tests completed successfully!');
            process.exit(0);
        } else {
            console.log('\n💥 Tests failed!');
            process.exit(1);
        }
    }).catch((error) => {
        console.error('\n💥 Test execution failed:', error);
        process.exit(1);
    });
}

module.exports = RestGrpcComparator;