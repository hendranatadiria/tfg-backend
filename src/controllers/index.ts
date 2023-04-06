import { Request, Response } from 'express';
import { db } from '../database/db';

export const showIndex = async (req: Request, res: Response) => {
    const dataPercentage = await db.levelLog.findMany({
        orderBy: {
            timestamp: 'desc'
        },
        include: {
            device: true
        }
    });

    const dataTemperature = await db.temperatureLog.findMany({
        orderBy: {
            timestamp: 'desc'
        },
        include: {
            device: true
        }
    });

    res.render('index.ejs', {dataLevel: dataPercentage, dataTemp: dataTemperature});
}