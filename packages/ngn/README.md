# ngn task scheduler

CLI scheduler for Node tasks.
Automate, monitor and orchestrate Javascript and Typescript tasks by single CLI command.

## Installation

Global installation

```bash
npm install -g @apisurf/ngn
ngn <command>
```

Or use without installing

```bash
npx @apisurf/ngn <command>
```

Cheat sheet:

```bash
ngn --version # check current version
ngn init # initialize ngn inside current folder
ngn add test.ts # add a task file
ngn run # start running all tasks
ngn run test.ts # start running tasks by glob match
ngn once test.ts # run once by glob match
```
