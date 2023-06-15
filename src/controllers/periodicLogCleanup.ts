import { DateTime } from "luxon";
import { db } from "../database/db"
import { storage } from "firebase-admin";

export const periodicLogCleanup = async() => {
  try {
    console.log("Running Periodic Log Cleanup Cronjob");
    // get all data from db, to export as csv
    const currentDate = DateTime.now().toFormat('yyyy-MM-dd');

    console.log("Backing up data...");
    const levelLogData = await db.levelLog.findMany({orderBy: {timestamp: 'asc'}});
    const temperatureLog = await db.temperatureLog.findMany({orderBy: {timestamp: 'asc'}});
    const regressionHistory = await db.regressionHistory.findMany({orderBy: {createdAt: 'asc'}});

    const levelCsv = convertToCsv(levelLogData);
    const tempCsv = convertToCsv(temperatureLog);
    const regressionCsv = convertToCsv(regressionHistory);

    console.log("Uploading csv files to Firebase Storage")
    await Promise.all([
      uploadCsv(levelCsv, `levellog-${currentDate}.csv`),
      uploadCsv(tempCsv, `temperaturelog-${currentDate}.csv`),
      uploadCsv(regressionCsv, `regressionhistory-${currentDate}.csv`),
    ])
    
    console.log('Backup success.')

    // delete all data where timestamp > 6 months from today
    const sixMonthsBeforeNow = DateTime.now().minus({month: 6});

    console.log("Deleting data from before ", sixMonthsBeforeNow.toSQL());
    const deleted = await Promise.all([
      db.levelLog.deleteMany({
        where: {
          timestamp: {
            lt: sixMonthsBeforeNow.toJSDate()
          }
        }
      }),
      db.temperatureLog.deleteMany({
        where: {
          timestamp: {
            lt: sixMonthsBeforeNow.toJSDate()
          }
        }
      }),
      db.regressionHistory.deleteMany({
        where: {
          t0: {
            lt: sixMonthsBeforeNow.toJSDate()
          }
        }
      }),
    ])

    console.log("Data succesfully deleted.")
    console.log("Deleted entries (level, temp, regression): ", deleted[0].count, deleted[1].count, deleted[2].count)
    console.log('Periodic Log Cleanup Routine DONE.')
  } catch(e) {
    console.error("⚠️ Error while running cron periodic log cleanup: ", JSON.stringify(e));
    console.error(e);
  }
}

const convertToCsv = (object:any) => {
  let csvString = '';
  let keys: string[] = Object.keys(object[0]);
  csvString = csvString + keys.map(el => `"${el}"`).join(";") + "\n";
  for (const el of object) {
    csvString = csvString + keys.map(key => {
      const data = (el as any)[key];
      const str = data !== undefined && data !== null? ((data instanceof Date) ? DateTime.fromJSDate(data).setZone('UTC').toFormat('"yyyy-MM-dd HH:mm:ss"') : ((typeof data === 'boolean') ? (data ? 'True' : 'False') : `"${data.toString()}"`) ) : '';
    return `${str}`
  }).join(";") + "\n";
  }
  return csvString;
}

const uploadCsv = async (string:string, fileName:string) => {
  await storage().bucket(process.env.FIREBASE_STORAGE_BUCKET).file('log-backups/'+fileName).save(string, {
    gzip: true,
    contentType: 'text/csv'
  })
}