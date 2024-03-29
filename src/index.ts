import Express from 'express';
import mqtt from 'mqtt'
import * as dotenv from 'dotenv';
dotenv.config();
import { machineIdSync } from 'node-machine-id';
import { PrismaClient } from '@prisma/client';
import { indexRouter } from './routers';
import path from 'path';
import 'dotenv/config'
import { periodicLogCleanup } from './controllers/periodicLogCleanup';
import { initializeApp } from 'firebase-admin/app';
import { credential } from 'firebase-admin';
import { exit } from 'process';
import { CronJob } from 'cron';

console.log("Starting MQTT Backend...")

const app = Express();
const port = 3636;

console.log("Reading configuration...")
if (process.env.MQTT_HOST === undefined || process.env.MQTT_PORT === undefined || process.env.MQTT_USER === undefined || process.env.MQTT_PASS === undefined) {
    throw new Error('MQTT_HOST, MQTT_PORT, MQTT_USER, MQTT_PASS environment variables must be set');
}

const connectUrl = `mqtt://${process.env.MQTT_HOST}:${process.env.MQTT_PORT}`;
const clientId = `tfg-mqtt-backend-${machineIdSync()}`;

console.log("Connecting to MQTT at: ", connectUrl, "with clientId: ", clientId);

const db = new PrismaClient();

const client = mqtt.connect(connectUrl, {
    clientId,
    clean: false,
    connectTimeout: 4000,
    username: process.env.MQTT_USER,
    password: process.env.MQTT_PASS,
    reconnectPeriod: 1000,
});

const topicList = ['/cc-shs/temp', '/cc-shs/level'];

client.on("connect", () => {
    console.log("Connected to MQTT broker");
    client.subscribe(topicList, {qos: 0}, (err, granted) => {
        granted.forEach((topic) => {
            console.log(`Subscribed to topics: ${topic.topic} with QOS: ${topic.qos}`);
        });
    })
})

client.on("error", (error) => {
    console.log(`Connection error: ${error}`);
});

client.on("message", (topic, message) => {
    const msgString = message.toString();
    if (msgString === '') return console.log("Empty message received");
    try {
        JSON.parse(msgString);
    } catch (e) {
        return console.log(`Invalid JSON received (${topic}): ${msgString}`);
    }
    
    console.log(`Received message on topic: ${topic} with message: ${msgString}`);
    if (topic === '/cc-shs/temp') {
        console.log(`Temperature data is: ${msgString}`);
        const data = JSON.parse(msgString);
        if (data !== undefined && !Number.isNaN(parseFloat(data.temp))) {
            const timestampData = parseInt(data.epoch)
            db.temperatureLog.create({
                data: {
                    value: parseFloat(data.temp),
                    device: {
                        connectOrCreate: {
                            where: {
                                id: data.deviceId
                            },
                            create: {
                                id: data.deviceId,
                                name: `New Device ${data.deviceId}`
                            }
                        }
                    },
                    timestamp: !Number.isNaN(timestampData) ? new Date(timestampData * 1000) : new Date()
                }
            }).then((result) => {
                console.log(`Temperature log created: ${JSON.stringify(result)}`);
            }).catch((error) => {
                console.log(error);
                console.log(`Error creating temperature log: ${JSON.stringify(error)}`);
            });
        } else {
            console.log("Invalid temperature data received");
        }
    }
    if (topic === '/cc-shs/level') {
        console.log(`Level data is: ${msgString}`, typeof msgString);
        const data = JSON.parse(msgString);
        if (data !== undefined && !Number.isNaN(parseFloat(data.distance) && !Number.isNaN(parseFloat(data.level)))) {
            const timestampData = parseInt(data.epoch)
            db.levelLog.create({
                data: {
                    height: parseFloat(data.distance),
                    level: parseFloat(data.level),
                    device: {
                        connectOrCreate: {
                            where: {
                                id: data.deviceId
                            },
                            create: {
                                id: data.deviceId,
                                name: `New Device ${data.deviceId}`
                            }
                        }
                    },
                    timestamp: !Number.isNaN(timestampData) ? new Date(timestampData * 1000) : new Date()
                }
            }).then((result) => {
                console.log(`Liquid Level log created: ${JSON.stringify(result)}`);
                db.levelLog.findFirst({
                    where: {
                        AND: [
                            {
                                deviceId: result.deviceId
                            },
                            {
                                timestamp: {
                                    lt: result.timestamp
                                }
                            },
                            {
                                timestamp: {
                                    not: result.timestamp
                                }
                            },
                            {
                                level: {
                                    gt: 0
                                }
                            }
                        ]
                    },
                    orderBy: {
                        timestamp: 'desc'
                    },
                }).then((prevData) => {
                    if (prevData === null) return;

                    // if the level difference is > 20 or the time difference is > 30 mins (10x time measurement sequence), then it is a new T0 (either refilled or start over)
                    if (result.level - prevData.level > 20 || Math.abs(result.timestamp.getTime() - prevData.timestamp.getTime()) >= 1800000 ) {
                        console.log("New T0 detected, updating previous data")
                        console.log("Current data: ", result);
                        console.log("Previous data: ", prevData);
                        db.levelLog.update({
                            where: {
                                deviceId_timestamp: {
                                    deviceId: result.deviceId,
                                    timestamp: result.timestamp
                                }
                            },
                            data: {
                                isT0: true
                            }
                        }).then((result) => {
                            console.log(`Liquid Level log updated (is new T0/refiled): ${JSON.stringify(result)}`);
                        }).catch((error) => {
                            console.log(`Error updating liquid level log: ${JSON.stringify(error)}`);
                        });
                    }
                })

            }).catch((error) => {
                console.log(error);
                console.log(`Error creating liquid level log: ${JSON.stringify(error)}`);
            });
        } else {
            console.log("Invalid liquid level data received");
        }
    }
});

// Firebase initialization
console.log('Initializing Firebase...');
const saPath = process.env.FIREBASE_SA_PATH
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET
if (saPath === undefined) {
    console.error("⚠️⚠️⚠️ Firebase Service Account Path doesn't exist. Please set it in env's 'FIREBASE_SA_PATH' before running the app. Exiting...")
    exit(99);
}
if (storageBucket === undefined) {
    console.error("⚠️⚠️⚠️ Firebase Storage Bucket Name doesn't exist. Please set it in env's 'FIREBASE_STORAGE_BUCKET' before running the app. Exiting...")
    exit(99);
}
initializeApp({credential: credential.cert(saPath)});
console.log("Firebase Initialized!");


// Express Initialization
app.use(Express.json());
app.use(Express.urlencoded({ extended: true }));
app.use(Express.static('public'));
app.set('views', path.join(__dirname, 'views'));

app.engine('html', require('ejs').renderFile);
app.set('view-engine', 'html');
app.use('/', indexRouter);

const server = app.listen(process.env.PORT || port, () => {
    console.log(`Server is listening on port ${port}`);
    }
);

// '* * * * *', <- this will be run every minute. below will run for every beginning of month (12:00am)
const cron = new CronJob(
    '0 0 1 * *',
    periodicLogCleanup,
    () => {console.log("Cron finished running.")},
    true,
    'Asia/Jakarta',
)

