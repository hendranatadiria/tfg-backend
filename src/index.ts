import Express from 'express';
import mqtt from 'mqtt'
import * as dotenv from 'dotenv';
dotenv.config();
import { machineIdSync } from 'node-machine-id';
import { PrismaClient } from '@prisma/client';

console.log("Starting MQTT Backend...")

const app = Express();
const port = 3000;

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
                console.log(`Error creating temperature log: ${JSON.stringify(error)}`);
            });
        } else {
            console.log("Invalid temperature data received");
        }
    }
    if (topic === '/cc-shs/level') {
        console.log(`Level data is: ${msgString}`, typeof msgString);
        const data = JSON.parse(msgString);
        if (data !== undefined && !Number.isNaN(parseFloat(data.height) && !Number.isNaN(parseFloat(data.level)))) {
            const timestampData = parseInt(data.epoch)
            db.levelLog.create({
                data: {
                    height: parseFloat(data.height),
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
            }).catch((error) => {
                console.log(`Error creating liquid level log: ${JSON.stringify(error)}`);
            });
        } else {
            console.log("Invalid liquid level data received");
        }
    }
});

// const server = app.listen(port, () => {
//     console.log(`Server is listening on port ${port}`);
//     }
// );

