#!/usr/bin/env node
import { init } from "./cliCmd/init.js";
import { run } from "./cliCmd/run.js";
import { runOnce } from "./cliCmd/runOnce.js";
import { runSingle } from "./cliCmd/runSingle.js";
import { compile } from "./cliCmd/compile.js";
import { initDbFile } from "./cliCmd/initDbFile.js";
import { addTask } from "./cliCmd/addTask.js";
import { sql } from "./cliCmd/sql.js";
import { ui } from "./cliCmd/ui.js";
import { status } from "./cliCmd/status.js";
import { schedule } from "./cliCmd/schedule.js";
import { next, pause, resume } from "./cliCmd/control.js";
import { runs } from "./cliCmd/runs.js";
import { show } from "./cliCmd/show.js";
import { logs } from "./cliCmd/logs.js";
import { buildProgram } from "./program.js";

buildProgram(
  {
    init,
    addTask,
    run,
    runOnce,
    runSingle,
    sql,
    ui,
    status,
    schedule,
    pause,
    resume,
    next,
    runs,
    show,
    logs,
    compile,
    initDbFile,
  },
  { debug: Boolean(process.env.DEBUG) },
).parse(process.argv);
