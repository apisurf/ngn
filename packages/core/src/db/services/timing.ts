import { Client } from "op3-persistence";

export class TimingService {
  constructor(private db: Client) {}

  start(file_task_id: number, task_run_id: number, label: string) {
    const startTime = Date.now();

    const stopAndRecordCb = async () => {
      const endTime = Date.now();
      const duration = endTime - startTime;

      // const { rows } = await this.db.execute({
      //   sql: "SELECT * FROM timings WHERE label = :label AND file_task_id = :file_task_id AND task_run_id = :task_run_id LIMIT 1",
      //   args: { label, file_task_id, task_run_id },
      // });

      // const existingTimeValue = rows[0] as unknown as Timing | undefined;

      // // update if exists
      // if (existingTimeValue) {
      //   return this.db.execute({
      //     sql: "UPDATE timings SET value = :value WHERE label = :label AND file_task_id = :file_task_id AND task_run_id = :task_run_id",
      //     args: {
      //       value: duration,
      //       label,
      //       file_task_id,
      //       task_run_id,
      //     },
      //   });
      // }

      // insert if not exists
      const { rows } = await this.db.execute({
        sql: "INSERT INTO timings (label, value, file_task_id, task_run_id) VALUES (:label, :value, :file_task_id, :task_run_id) RETURNING id",
        args: { label, value: duration, file_task_id, task_run_id },
      });

      return;
    };

    return stopAndRecordCb;
  }
}
