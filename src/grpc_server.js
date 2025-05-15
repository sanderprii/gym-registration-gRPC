const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

// Initialize Prisma client
const prisma = new PrismaClient();

// Load the protocol buffer
const packageDefinition = protoLoader.loadSync(
    path.join(__dirname, '../proto/gym_registration.proto'),
    {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
        includeDirs: [path.join(__dirname, '../proto')]
    }
);

const gymProto = grpc.loadPackageDefinition(packageDefinition).gym_registration;

// Configuration
const port = process.env.GRPC_PORT || 50051;
const JWT_SECRET = process.env.JWT_SECRET;

// Track revoked tokens
const revokedTokens = new Set();

// ============================================================================
// Helper Functions
// ============================================================================

function authenticateToken(token) {
    if (!token) {
        throw {
            code: grpc.status.UNAUTHENTICATED,
            message: 'Authorization token missing'
        };
    }

    if (revokedTokens.has(token)) {
        throw {
            code: grpc.status.UNAUTHENTICATED,
            message: 'Token is revoked'
        };
    }

    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (err) {
        throw {
            code: grpc.status.UNAUTHENTICATED,
            message: 'Invalid token'
        };
    }
}

function formatTrainee(trainee) {
    if (!trainee) return null;
    const { password, ...traineeWithoutPassword } = trainee;
    return {
        ...traineeWithoutPassword,
        created_at: trainee.createdAt,
        updated_at: trainee.updatedAt
    };
}

function convertTimestamp(date) {
    if (!date) return null;
    const timestamp = new Date(date);
    return {
        seconds: Math.floor(timestamp.getTime() / 1000),
        nanos: (timestamp.getTime() % 1000) * 1000000
    };
}

function convertFromTimestamp(timestamp) {
    if (!timestamp) return null;
    return new Date(timestamp.seconds * 1000 + timestamp.nanos / 1000000);
}

// ============================================================================
// Session Service Implementation
// ============================================================================

const sessionService = {
    async CreateSession(call, callback) {
        try {
            const { email, password } = call.request;

            if (!email || !password) {
                return callback({
                    code: grpc.status.INVALID_ARGUMENT,
                    message: 'Email and password are required'
                });
            }

            const trainee = await prisma.trainee.findUnique({
                where: { email }
            });

            if (!trainee || trainee.password !== password) {
                return callback({
                    code: grpc.status.UNAUTHENTICATED,
                    message: 'Invalid credentials'
                });
            }

            const token = jwt.sign(
                { traineeId: trainee.id, email: trainee.email },
                JWT_SECRET,
                { expiresIn: '2h' }
            );

            callback(null, {
                token,
                trainee: formatTrainee(trainee)
            });
        } catch (error) {
            console.error('CreateSession error:', error);
            callback({
                code: grpc.status.INTERNAL,
                message: 'Internal server error'
            });
        }
    },

    async DeleteSession(call, callback) {
        try {
            const { token } = call.request;
            authenticateToken(token);
            revokedTokens.add(token);

            callback(null, { message: 'Successfully logged out' });
        } catch (error) {
            callback(error);
        }
    },

    async CheckSession(call, callback) {
        try {
            const { token } = call.request;
            const userData = authenticateToken(token);

            const trainee = await prisma.trainee.findUnique({
                where: { id: userData.traineeId }
            });

            if (!trainee) {
                return callback({
                    code: grpc.status.NOT_FOUND,
                    message: 'Trainee not found'
                });
            }

            callback(null, {
                authenticated: true,
                trainee: formatTrainee(trainee)
            });
        } catch (error) {
            callback(error);
        }
    }
};

// ============================================================================
// Trainee Service Implementation
// ============================================================================

const traineeService = {
    async ListTrainees(call, callback) {
        try {
            const { token, pagination } = call.request;
            authenticateToken(token);

            const page = pagination?.page || 1;
            const pageSize = pagination?.page_size || 20;
            const skip = (page - 1) * pageSize;

            const [trainees, total] = await prisma.$transaction([
                prisma.trainee.findMany({
                    skip,
                    take: pageSize,
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        timezone: true,
                        createdAt: true,
                        updatedAt: true
                    }
                }),
                prisma.trainee.count()
            ]);

            callback(null, {
                data: trainees.map(formatTrainee),
                pagination: {
                    page,
                    page_size: pageSize,
                    total
                }
            });
        } catch (error) {
            console.error('ListTrainees error:', error);
            callback(error.code ? error : {
                code: grpc.status.INTERNAL,
                message: 'Internal server error'
            });
        }
    },

    async CreateTrainee(call, callback) {
        try {
            const { name, email, password, timezone } = call.request;

            if (!name || !email || !password) {
                return callback({
                    code: grpc.status.INVALID_ARGUMENT,
                    message: 'Name, email, and password are required'
                });
            }

            const existingTrainee = await prisma.trainee.findUnique({
                where: { email }
            });

            if (existingTrainee) {
                return callback({
                    code: grpc.status.ALREADY_EXISTS,
                    message: 'Email is already in use'
                });
            }

            const newTrainee = await prisma.trainee.create({
                data: { name, email, password, timezone },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    timezone: true,
                    createdAt: true,
                    updatedAt: true
                }
            });

            callback(null, { trainee: formatTrainee(newTrainee) });
        } catch (error) {
            console.error('CreateTrainee error:', error);
            callback({
                code: grpc.status.INTERNAL,
                message: 'Internal server error'
            });
        }
    },

    async GetTrainee(call, callback) {
        try {
            const { token, trainee_id } = call.request;
            authenticateToken(token);

            const trainee = await prisma.trainee.findUnique({
                where: { id: trainee_id },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    timezone: true,
                    createdAt: true,
                    updatedAt: true
                }
            });

            if (!trainee) {
                return callback({
                    code: grpc.status.NOT_FOUND,
                    message: 'Trainee not found'
                });
            }

            callback(null, { trainee: formatTrainee(trainee) });
        } catch (error) {
            callback(error.code ? error : {
                code: grpc.status.INTERNAL,
                message: 'Internal server error'
            });
        }
    },

    async UpdateTrainee(call, callback) {
        try {
            const { token, trainee_id, name, email, password, timezone } = call.request;
            authenticateToken(token);

            const updateData = {};
            if (name !== undefined && name !== '') updateData.name = name;
            if (email !== undefined && email !== '') updateData.email = email;
            if (password !== undefined && password !== '') updateData.password = password;
            if (timezone !== undefined && timezone !== '') updateData.timezone = timezone;

            const updatedTrainee = await prisma.trainee.update({
                where: { id: trainee_id },
                data: updateData,
                select: {
                    id: true,
                    name: true,
                    email: true,
                    timezone: true,
                    createdAt: true,
                    updatedAt: true
                }
            });

            callback(null, { trainee: formatTrainee(updatedTrainee) });
        } catch (error) {
            if (error.code === 'P2025') {
                return callback({
                    code: grpc.status.NOT_FOUND,
                    message: 'Trainee not found'
                });
            }
            callback({
                code: grpc.status.INTERNAL,
                message: 'Internal server error'
            });
        }
    },

    async DeleteTrainee(call, callback) {
        try {
            const { token, trainee_id } = call.request;
            authenticateToken(token);

            await prisma.trainee.delete({
                where: { id: trainee_id }
            });

            callback(null, { success: true });
        } catch (error) {
            if (error.code === 'P2025') {
                return callback({
                    code: grpc.status.NOT_FOUND,
                    message: 'Trainee not found'
                });
            }
            callback(error.code ? error : {
                code: grpc.status.INTERNAL,
                message: 'Internal server error'
            });
        }
    }
};

// ============================================================================
// Workout Service Implementation
// ============================================================================

const workoutService = {
    async ListWorkouts(call, callback) {
        try {
            const { token } = call.request;
            authenticateToken(token);

            const workouts = await prisma.workout.findMany({
                orderBy: { createdAt: 'desc' }
            });

            callback(null, { workouts });
        } catch (error) {
            callback(error.code ? error : {
                code: grpc.status.INTERNAL,
                message: 'Internal server error'
            });
        }
    },

    async CreateWorkout(call, callback) {
        try {
            const { token, name, duration, description, color } = call.request;
            authenticateToken(token);

            if (!name || !duration) {
                return callback({
                    code: grpc.status.INVALID_ARGUMENT,
                    message: 'Name and duration are required'
                });
            }

            const newWorkout = await prisma.workout.create({
                data: { name, duration, description, color }
            });

            callback(null, { workout: newWorkout });
        } catch (error) {
            callback(error.code ? error : {
                code: grpc.status.INTERNAL,
                message: 'Internal server error'
            });
        }
    },

    async GetWorkout(call, callback) {
        try {
            const { token, workout_id } = call.request;
            authenticateToken(token);

            const workout = await prisma.workout.findUnique({
                where: { id: workout_id }
            });

            if (!workout) {
                return callback({
                    code: grpc.status.NOT_FOUND,
                    message: 'Workout not found'
                });
            }

            callback(null, { workout });
        } catch (error) {
            callback(error.code ? error : {
                code: grpc.status.INTERNAL,
                message: 'Internal server error'
            });
        }
    },

    async UpdateWorkout(call, callback) {
        try {
            const { token, workout_id, name, duration, description, color } = call.request;
            authenticateToken(token);

            const updateData = {};
            if (name !== undefined && name !== '') updateData.name = name;
            if (duration !== undefined) updateData.duration = duration;
            if (description !== undefined && description !== '') updateData.description = description;
            if (color !== undefined && color !== '') updateData.color = color;

            const updatedWorkout = await prisma.workout.update({
                where: { id: workout_id },
                data: updateData
            });

            callback(null, { workout: updatedWorkout });
        } catch (error) {
            if (error.code === 'P2025') {
                return callback({
                    code: grpc.status.NOT_FOUND,
                    message: 'Workout not found'
                });
            }
            callback({
                code: grpc.status.INTERNAL,
                message: 'Internal server error'
            });
        }
    },

    async DeleteWorkout(call, callback) {
        try {
            const { token, workout_id } = call.request;
            authenticateToken(token);

            await prisma.workout.delete({
                where: { id: workout_id }
            });

            callback(null, { success: true });
        } catch (error) {
            if (error.code === 'P2025') {
                return callback({
                    code: grpc.status.NOT_FOUND,
                    message: 'Workout not found'
                });
            }
            callback(error.code ? error : {
                code: grpc.status.INTERNAL,
                message: 'Internal server error'
            });
        }
    }
};

// ============================================================================
// Routine Service Implementation
// ============================================================================

function formatRoutine(routine) {
    return {
        id: routine.id,
        user_id: routine.userId,
        availability: JSON.parse(routine.availability),
        trainee: routine.trainee ? formatTrainee(routine.trainee) : null,
        created_at: convertTimestamp(routine.createdAt),
        updated_at: convertTimestamp(routine.updatedAt)
    };
}

const routineService = {
    async ListRoutines(call, callback) {
        try {
            const { token, trainee_id } = call.request;
            authenticateToken(token);

            const whereClause = trainee_id ? { userId: trainee_id } : {};

            const routines = await prisma.routine.findMany({
                where: whereClause,
                include: {
                    trainee: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            createdAt: true,
                            updatedAt: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });

            callback(null, {
                routines: routines.map(formatRoutine)
            });
        } catch (error) {
            callback(error.code ? error : {
                code: grpc.status.INTERNAL,
                message: 'Internal server error'
            });
        }
    },

    async CreateRoutine(call, callback) {
        try {
            const { token, user_id, availability } = call.request;
            authenticateToken(token);

            if (!user_id || !availability || availability.length === 0) {
                return callback({
                    code: grpc.status.INVALID_ARGUMENT,
                    message: 'user_id and availability are required'
                });
            }

            const trainee = await prisma.trainee.findUnique({
                where: { id: user_id }
            });

            if (!trainee) {
                return callback({
                    code: grpc.status.NOT_FOUND,
                    message: 'Trainee not found'
                });
            }

            const newRoutine = await prisma.routine.create({
                data: {
                    userId: user_id,
                    availability: JSON.stringify(availability)
                },
                include: {
                    trainee: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            createdAt: true,
                            updatedAt: true
                        }
                    }
                }
            });

            callback(null, { routine: formatRoutine(newRoutine) });
        } catch (error) {
            callback(error.code ? error : {
                code: grpc.status.INTERNAL,
                message: 'Internal server error'
            });
        }
    },

    async GetTraineeRoutine(call, callback) {
        try {
            const { token, trainee_id } = call.request;
            authenticateToken(token);

            const routine = await prisma.routine.findFirst({
                where: { userId: trainee_id },
                include: {
                    trainee: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            createdAt: true,
                            updatedAt: true
                        }
                    }
                }
            });

            if (!routine) {
                return callback({
                    code: grpc.status.NOT_FOUND,
                    message: 'Routine not found'
                });
            }

            callback(null, { routine: formatRoutine(routine) });
        } catch (error) {
            callback(error.code ? error : {
                code: grpc.status.INTERNAL,
                message: 'Internal server error'
            });
        }
    },

    async UpdateTraineeRoutine(call, callback) {
        try {
            const { token, trainee_id, availability } = call.request;
            authenticateToken(token);

            if (!availability || availability.length === 0) {
                return callback({
                    code: grpc.status.INVALID_ARGUMENT,
                    message: 'availability is required'
                });
            }

            const updatedRoutine = await prisma.routine.updateMany({
                where: { userId: trainee_id },
                data: {
                    availability: JSON.stringify(availability)
                }
            });

            if (updatedRoutine.count === 0) {
                return callback({
                    code: grpc.status.NOT_FOUND,
                    message: 'Routine not found'
                });
            }

            const routine = await prisma.routine.findFirst({
                where: { userId: trainee_id },
                include: {
                    trainee: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            createdAt: true,
                            updatedAt: true
                        }
                    }
                }
            });

            callback(null, { routine: formatRoutine(routine) });
        } catch (error) {
            callback({
                code: grpc.status.INTERNAL,
                message: 'Internal server error'
            });
        }
    },

    async DeleteTraineeRoutine(call, callback) {
        try {
            const { token, trainee_id } = call.request;
            authenticateToken(token);

            const deletedRoutine = await prisma.routine.deleteMany({
                where: { userId: trainee_id }
            });

            if (deletedRoutine.count === 0) {
                return callback({
                    code: grpc.status.NOT_FOUND,
                    message: 'Routine not found'
                });
            }

            callback(null, { success: true });
        } catch (error) {
            callback(error.code ? error : {
                code: grpc.status.INTERNAL,
                message: 'Internal server error'
            });
        }
    }
};

// ============================================================================
// Registration Service Implementation
// ============================================================================

function formatRegistration(registration) {
    return {
        id: registration.id,
        event_id: registration.eventId,
        user_id: registration.userId,
        invitee_email: registration.inviteeEmail,
        start_time: convertTimestamp(registration.startTime),
        end_time: convertTimestamp(registration.endTime),
        status: registration.status,
        trainee: registration.trainee ? formatTrainee(registration.trainee) : null,
        created_at: convertTimestamp(registration.createdAt),
        updated_at: convertTimestamp(registration.updatedAt)
    };
}

const registrationService = {
    async ListRegistrations(call, callback) {
        try {
            const { token } = call.request;
            authenticateToken(token);

            const registrations = await prisma.registration.findMany({
                include: {
                    trainee: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            createdAt: true,
                            updatedAt: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });

            callback(null, {
                registrations: registrations.map(formatRegistration)
            });
        } catch (error) {
            callback(error.code ? error : {
                code: grpc.status.INTERNAL,
                message: 'Internal server error'
            });
        }
    },

    async CreateRegistration(call, callback) {
        try {
            const { token, event_id, user_id, invitee_email, start_time, end_time, status } = call.request;
            authenticateToken(token);

            if (!event_id || !user_id || !invitee_email || !start_time) {
                return callback({
                    code: grpc.status.INVALID_ARGUMENT,
                    message: 'event_id, user_id, invitee_email, and start_time are required'
                });
            }

            const trainee = await prisma.trainee.findUnique({
                where: { id: user_id }
            });

            if (!trainee) {
                return callback({
                    code: grpc.status.NOT_FOUND,
                    message: 'Trainee not found'
                });
            }

            const newRegistration = await prisma.registration.create({
                data: {
                    eventId: event_id,
                    userId: user_id,
                    inviteeEmail: invitee_email,
                    startTime: convertFromTimestamp(start_time),
                    endTime: end_time ? convertFromTimestamp(end_time) : null,
                    status: status || 'scheduled'
                },
                include: {
                    trainee: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            createdAt: true,
                            updatedAt: true
                        }
                    }
                }
            });

            callback(null, { registration: formatRegistration(newRegistration) });
        } catch (error) {
            callback(error.code ? error : {
                code: grpc.status.INTERNAL,
                message: 'Internal server error'
            });
        }
    },

    async GetRegistration(call, callback) {
        try {
            const { token, registration_id } = call.request;
            authenticateToken(token);

            const registration = await prisma.registration.findUnique({
                where: { id: registration_id },
                include: {
                    trainee: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            createdAt: true,
                            updatedAt: true
                        }
                    }
                }
            });

            if (!registration) {
                return callback({
                    code: grpc.status.NOT_FOUND,
                    message: 'Registration not found'
                });
            }

            callback(null, { registration: formatRegistration(registration) });
        } catch (error) {
            callback(error.code ? error : {
                code: grpc.status.INTERNAL,
                message: 'Internal server error'
            });
        }
    },

    async UpdateRegistration(call, callback) {
        try {
            const { token, registration_id, event_id, user_id, invitee_email, start_time, end_time, status } = call.request;
            authenticateToken(token);

            const updateData = {};
            if (event_id !== undefined && event_id !== '') updateData.eventId = event_id;
            if (user_id !== undefined && user_id !== '') updateData.userId = user_id;
            if (invitee_email !== undefined && invitee_email !== '') updateData.inviteeEmail = invitee_email;
            if (start_time !== undefined) updateData.startTime = convertFromTimestamp(start_time);
            if (end_time !== undefined) updateData.endTime = end_time ? convertFromTimestamp(end_time) : null;
            if (status !== undefined && status !== '') updateData.status = status;

            const updatedRegistration = await prisma.registration.update({
                where: { id: registration_id },
                data: updateData,
                include: {
                    trainee: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            createdAt: true,
                            updatedAt: true
                        }
                    }
                }
            });

            callback(null, { registration: formatRegistration(updatedRegistration) });
        } catch (error) {
            if (error.code === 'P2025') {
                return callback({
                    code: grpc.status.NOT_FOUND,
                    message: 'Registration not found'
                });
            }
            callback({
                code: grpc.status.INTERNAL,
                message: 'Internal server error'
            });
        }
    },

    async DeleteRegistration(call, callback) {
        try {
            const { token, registration_id } = call.request;
            authenticateToken(token);

            await prisma.registration.delete({
                where: { id: registration_id }
            });

            callback(null, { success: true });
        } catch (error) {
            if (error.code === 'P2025') {
                return callback({
                    code: grpc.status.NOT_FOUND,
                    message: 'Registration not found'
                });
            }
            callback(error.code ? error : {
                code: grpc.status.INTERNAL,
                message: 'Internal server error'
            });
        }
    }
};

// ============================================================================
// Create and Start Server
// ============================================================================

function main() {
    const server = new grpc.Server();

    // Add services to the server
    server.addService(gymProto.SessionService.service, sessionService);
    server.addService(gymProto.TraineeService.service, traineeService);
    server.addService(gymProto.WorkoutService.service, workoutService);
    server.addService(gymProto.RoutineService.service, routineService);
    server.addService(gymProto.RegistrationService.service, registrationService);

    // Start the server
    server.bindAsync(
        `0.0.0.0:${port}`,
        grpc.ServerCredentials.createInsecure(),
        (error, port) => {
            if (error) {
                console.error('Failed to start gRPC server:', error);
                return;
            }
            console.log(`gRPC server running on port ${port}`);
            server.start();
        }
    );
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    await prisma.$disconnect();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Shutting down gracefully...');
    await prisma.$disconnect();
    process.exit(0);
});

if (require.main === module) {
    main();
}

module.exports = main;