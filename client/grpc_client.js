const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Load the protocol buffer
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

class GymRegistrationGrpcClient {
    constructor() {
        this.token = null;
    }

    // Helper to convert timestamp
    createTimestamp(date) {
        const timestamp = new Date(date);
        return {
            seconds: Math.floor(timestamp.getTime() / 1000),
            nanos: (timestamp.getTime() % 1000) * 1000000
        };
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

    async createSession(email, password) {
        try {
            const createSession = this.promisify(sessionClient.CreateSession, sessionClient);
            const response = await createSession({ email, password });
            this.token = response.token;
            console.log('✓ Login successful:', response);
            return response;
        } catch (error) {
            console.error('✗ Login failed:', error.message);
            throw error;
        }
    }

    async deleteSession() {
        try {
            const deleteSession = this.promisify(sessionClient.DeleteSession, sessionClient);
            const response = await deleteSession({ token: this.token });
            console.log('✓ Logout successful:', response);
            this.token = null;
            return response;
        } catch (error) {
            console.error('✗ Logout failed:', error.message);
            throw error;
        }
    }

    async checkSession() {
        try {
            const checkSession = this.promisify(sessionClient.CheckSession, sessionClient);
            const response = await checkSession({ token: this.token });
            console.log('✓ Session check successful:', response);
            return response;
        } catch (error) {
            console.error('✗ Session check failed:', error.message);
            throw error;
        }
    }

    async createTrainee(name, email, password, timezone) {
        try {
            const createTrainee = this.promisify(traineeClient.CreateTrainee, traineeClient);
            const response = await createTrainee({ name, email, password, timezone });
            console.log('✓ Trainee created:', response);
            return response;
        } catch (error) {
            // Check if error is "Email already in use" and continue
            if (error.message && error.message.includes('already in use')) {
                console.log('! Trainee already exists, continuing...');
                return null;
            }
            console.error('✗ Create trainee failed:', error.message);
            throw error;
        }
    }

    async listTrainees(page = 1, pageSize = 5) {
        try {
            const listTrainees = this.promisify(traineeClient.ListTrainees, traineeClient);
            const response = await listTrainees({
                token: this.token,
                pagination: { page, page_size: pageSize }
            });
            console.log('✓ Trainees listed:', response);
            return response;
        } catch (error) {
            console.error('✗ List trainees failed:', error.message);
            throw error;
        }
    }

    async createWorkout(name, duration, description, color) {
        try {
            const createWorkout = this.promisify(workoutClient.CreateWorkout, workoutClient);
            const response = await createWorkout({
                token: this.token,
                name,
                duration,
                description,
                color
            });
            console.log('✓ Workout created:', response);
            return response;
        } catch (error) {
            console.error('✗ Create workout failed:', error.message);
            throw error;
        }
    }

    async listWorkouts() {
        try {
            const listWorkouts = this.promisify(workoutClient.ListWorkouts, workoutClient);
            const response = await listWorkouts({ token: this.token });
            console.log('✓ Workouts listed:', response);
            return response;
        } catch (error) {
            console.error('✗ List workouts failed:', error.message);
            throw error;
        }
    }

    async createRoutine(userId, availability) {
        try {
            const createRoutine = this.promisify(routineClient.CreateRoutine, routineClient);
            const response = await createRoutine({
                token: this.token,
                user_id: userId,
                availability
            });
            console.log('✓ Routine created:', response);
            return response;
        } catch (error) {
            console.error('✗ Create routine failed:', error.message);
            throw error;
        }
    }

    async createRegistration(eventId, userId, inviteeEmail, startTime, endTime, status) {
        try {
            const createRegistration = this.promisify(registrationClient.CreateRegistration, registrationClient);
            const response = await createRegistration({
                token: this.token,
                event_id: eventId,
                user_id: userId,
                invitee_email: inviteeEmail,
                start_time: this.createTimestamp(startTime),
                end_time: endTime ? this.createTimestamp(endTime) : null,
                status
            });
            console.log('✓ Registration created:', response);
            return response;
        } catch (error) {
            console.error('✗ Create registration failed:', error.message);
            throw error;
        }
    }
}

// Example usage
async function runExamples() {
    const client = new GymRegistrationGrpcClient();

    try {
        console.log('\n=== Testing gRPC Gym Registration Service ===\n');

        // Create a test trainee (ignore if already exists)
        console.log('=== Creating Test Trainee ===');
        await client.createTrainee('Test User', 'test@example.com', 'password123', 'Europe/Tallinn');

        // Login with test user
        console.log('\n=== Logging in ===');
        await client.createSession('test@example.com', 'password123');

        // Check session
        console.log('\n=== Checking Session ===');
        await client.checkSession();

        // List trainees
        console.log('\n=== Listing Trainees ===');
        const trainees = await client.listTrainees();
        let testUserId = null;
        if (trainees && trainees.data && trainees.data.length > 0) {
            testUserId = trainees.data[0].id;
        }

        // Create a workout
        console.log('\n=== Creating Workout ===');
        await client.createWorkout('HIIT Training', 45, 'High intensity interval training', '#FF5733');

        // List workouts
        console.log('\n=== Listing Workouts ===');
        await client.listWorkouts();

        // Create a routine (if we have a user ID)
        if (testUserId) {
            console.log('\n=== Creating Routine ===');
            const availability = [
                { day: 'monday', start_time: '08:00', end_time: '10:00' },
                { day: 'wednesday', start_time: '18:00', end_time: '20:00' }
            ];
            await client.createRoutine(testUserId, availability);

            // Create a registration
            console.log('\n=== Creating Registration ===');
            const startTime = new Date();
            startTime.setHours(startTime.getHours() + 1);
            const endTime = new Date();
            endTime.setHours(endTime.getHours() + 2);

            await client.createRegistration(
                'event-123',
                testUserId,
                'test@example.com',
                startTime,
                endTime,
                'scheduled'
            );
        }

        // Logout
        console.log('\n=== Logging out ===');
        await client.deleteSession();

        console.log('\n✅ All examples completed successfully!');

    } catch (error) {
        console.error('\n❌ Example failed:', error.message);
        if (error.details) {
            console.error('Error details:', error.details);
        }
    }
}

// Run examples if this file is executed directly
if (require.main === module) {
    runExamples()
        .then(() => {
            console.log('\n🎉 gRPC client example completed!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 gRPC client example failed:', error);
            process.exit(1);
        });
}

module.exports = GymRegistrationGrpcClient;