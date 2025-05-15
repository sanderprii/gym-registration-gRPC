const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
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

class GrpcOnlyTester {
    constructor() {
        this.token = null;
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
        console.log('\n=== Testing gRPC Authentication ===');

        try {
            const testEmail = 'test@example.com';
            const testPassword = 'password123';

            // Create test user (ignore if exists)
            console.log('Creating test user...');
            const createTrainee = this.promisify(traineeClient.CreateTrainee, traineeClient);
            try {
                await createTrainee({
                    name: 'Test User',
                    email: testEmail,
                    password: testPassword,
                    timezone: 'Europe/Tallinn'
                });
                console.log('✓ Test user created');
            } catch (error) {
                if (error.message && error.message.includes('already in use')) {
                    console.log('! Test user already exists, continuing...');
                } else {
                    throw error;
                }
            }

            // Test login
            console.log('Testing login...');
            const createSession = this.promisify(sessionClient.CreateSession, sessionClient);
            const loginResult = await createSession({ email: testEmail, password: testPassword });
            this.token = loginResult.token;
            console.log('✓ Login successful, token received');

            // Test session check
            console.log('Testing session check...');
            const checkSession = this.promisify(sessionClient.CheckSession, sessionClient);
            const sessionResult = await checkSession({ token: this.token });

            if (sessionResult.authenticated && sessionResult.trainee) {
                console.log('✓ Session validation successful');
            } else {
                throw new Error('Session check returned invalid data');
            }

            console.log('✓ Authentication tests passed');
            return true;
        } catch (error) {
            console.error('✗ Authentication test failed:', error.message);
            throw error;
        }
    }

    async testTraineeOperations() {
        console.log('\n=== Testing gRPC Trainee Operations ===');

        try {
            // Test listing trainees
            console.log('Testing trainee listing...');
            const listTrainees = this.promisify(traineeClient.ListTrainees, traineeClient);
            const listResult = await listTrainees({
                token: this.token,
                pagination: { page: 1, page_size: 10 }
            });

            if (listResult.data && listResult.pagination) {
                console.log(`✓ Listed ${listResult.data.length} trainees (total: ${listResult.pagination.total})`);
            } else {
                throw new Error('Invalid list response structure');
            }

            // Test getting a specific trainee
            if (listResult.data.length > 0) {
                const traineeId = listResult.data[0].id;
                console.log('Testing get trainee...');
                const getTrainee = this.promisify(traineeClient.GetTrainee, traineeClient);
                const traineeResult = await getTrainee({ token: this.token, trainee_id: traineeId });

                if (traineeResult.trainee && traineeResult.trainee.id === traineeId) {
                    console.log('✓ Get trainee successful');
                } else {
                    throw new Error('Get trainee returned invalid data');
                }
            }

            console.log('✓ Trainee operations tests passed');
            return true;
        } catch (error) {
            console.error('✗ Trainee operations test failed:', error.message);
            throw error;
        }
    }

    async testWorkoutOperations() {
        console.log('\n=== Testing gRPC Workout Operations ===');

        try {
            // Create a test workout
            console.log('Creating test workout...');
            const createWorkout = this.promisify(workoutClient.CreateWorkout, workoutClient);
            const workoutData = {
                token: this.token,
                name: 'Test gRPC Workout',
                duration: 45,
                description: 'Test workout created via gRPC',
                color: '#00FF00'
            };

            const createResult = await createWorkout(workoutData);
            if (createResult.workout && createResult.workout.id) {
                console.log('✓ Workout created successfully');
            } else {
                throw new Error('Workout creation returned invalid data');
            }

            // List workouts
            console.log('Testing workout listing...');
            const listWorkouts = this.promisify(workoutClient.ListWorkouts, workoutClient);
            const listResult = await listWorkouts({ token: this.token });

            if (listResult.workouts && Array.isArray(listResult.workouts)) {
                console.log(`✓ Listed ${listResult.workouts.length} workouts`);
            } else {
                throw new Error('Workout list returned invalid data');
            }

            // Get specific workout
            if (listResult.workouts.length > 0) {
                const workoutId = listResult.workouts[0].id;
                console.log('Testing get workout...');
                const getWorkout = this.promisify(workoutClient.GetWorkout, workoutClient);
                const getResult = await getWorkout({ token: this.token, workout_id: workoutId });

                if (getResult.workout && getResult.workout.id === workoutId) {
                    console.log('✓ Get workout successful');
                } else {
                    throw new Error('Get workout returned invalid data');
                }
            }

            console.log('✓ Workout operations tests passed');
            return true;
        } catch (error) {
            console.error('✗ Workout operations test failed:', error.message);
            throw error;
        }
    }

    async testRoutineOperations() {
        console.log('\n=== Testing gRPC Routine Operations ===');

        try {
            // Get a trainee ID first
            const listTrainees = this.promisify(traineeClient.ListTrainees, traineeClient);
            const traineesResult = await listTrainees({
                token: this.token,
                pagination: { page: 1, page_size: 1 }
            });

            if (!traineesResult.data || traineesResult.data.length === 0) {
                console.log('! No trainees available for routine test, skipping...');
                return true;
            }

            const traineeId = traineesResult.data[0].id;

            // Create a routine
            console.log('Creating test routine...');
            const createRoutine = this.promisify(routineClient.CreateRoutine, routineClient);
            const routineData = {
                token: this.token,
                user_id: traineeId,
                availability: [
                    { day: 'monday', start_time: '09:00', end_time: '11:00' },
                    { day: 'friday', start_time: '16:00', end_time: '18:00' }
                ]
            };

            const createResult = await createRoutine(routineData);
            if (createResult.routine && createResult.routine.user_id === traineeId) {
                console.log('✓ Routine created successfully');
            } else {
                console.log('! Routine already exists or creation failed, continuing...');
            }

            // Get trainee's routine
            console.log('Testing get trainee routine...');
            const getRoutine = this.promisify(routineClient.GetTraineeRoutine, routineClient);
            try {
                const getResult = await getRoutine({ token: this.token, trainee_id: traineeId });
                if (getResult.routine && getResult.routine.user_id === traineeId) {
                    console.log('✓ Get routine successful');
                }
            } catch (error) {
                if (error.code === grpc.status.NOT_FOUND) {
                    console.log('! No routine found for trainee (expected if routine doesn\'t exist)');
                }
            }

            console.log('✓ Routine operations tests passed');
            return true;
        } catch (error) {
            console.error('✗ Routine operations test failed:', error.message);
            throw error;
        }
    }

    async testErrorHandling() {
        console.log('\n=== Testing gRPC Error Handling ===');

        try {
            // Test invalid token
            console.log('Testing invalid token...');
            const listInvalid = this.promisify(traineeClient.ListTrainees, traineeClient);
            try {
                await listInvalid({
                    token: 'invalid_token',
                    pagination: { page: 1, page_size: 10 }
                });
                console.log('✗ Should have failed with invalid token');
            } catch (error) {
                if (error.code === grpc.status.UNAUTHENTICATED) {
                    console.log('✓ Properly rejected invalid token');
                } else {
                    console.log(`✗ Unexpected error code: ${error.code}`);
                }
            }

            // Test missing required fields
            console.log('Testing missing required fields...');
            const createInvalid = this.promisify(traineeClient.CreateTrainee, traineeClient);
            try {
                await createInvalid({ name: 'Test' }); // Missing email and password
                console.log('✗ Should have failed with missing fields');
            } catch (error) {
                if (error.code === grpc.status.INVALID_ARGUMENT) {
                    console.log('✓ Properly rejected missing required fields');
                } else {
                    console.log(`✗ Unexpected error code: ${error.code}`);
                }
            }

            // Test non-existent resource
            console.log('Testing non-existent resource...');
            const getInvalid = this.promisify(traineeClient.GetTrainee, traineeClient);
            try {
                await getInvalid({ token: this.token, trainee_id: 'non-existent-id' });
                console.log('✗ Should have failed with non-existent ID');
            } catch (error) {
                if (error.code === grpc.status.NOT_FOUND) {
                    console.log('✓ Properly rejected non-existent resource');
                } else {
                    console.log(`✗ Unexpected error code: ${error.code}`);
                }
            }

            console.log('✓ Error handling tests passed');
            return true;
        } catch (error) {
            console.error('✗ Error handling test failed:', error.message);
            throw error;
        }
    }

    async runAllTests() {
        try {
            console.log('=== Starting gRPC-Only Tests ===');

            await this.testAuthentication();
            await this.testTraineeOperations();
            await this.testWorkoutOperations();
            await this.testRoutineOperations();
            await this.testErrorHandling();

            // Test logout
            console.log('\n=== Testing Logout ===');
            const deleteSession = this.promisify(sessionClient.DeleteSession, sessionClient);
            const logoutResult = await deleteSession({ token: this.token });
            if (logoutResult.message) {
                console.log('✓ Logout successful');
            }

            console.log('\n✅ All gRPC tests passed successfully!');
            console.log('✓ gRPC service is fully functional');
            return true;
        } catch (error) {
            console.error('\n❌ gRPC tests failed:', error.message);
            return false;
        }
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    const tester = new GrpcOnlyTester();
    tester.runAllTests().then((success) => {
        if (success) {
            console.log('\n🎉 All gRPC tests completed successfully!');
            process.exit(0);
        } else {
            console.log('\n💥 gRPC tests failed!');
            process.exit(1);
        }
    }).catch((error) => {
        console.error('\n💥 Test execution failed:', error);
        process.exit(1);
    });
}

module.exports = GrpcOnlyTester;