# op3 task scheduler

CLI scheduler for Node tasks.
Automate, monitor and orchestrate Javascript and Typescript tasks by single CLI command.

## Installation

Global installation

```bash
npm install -g @op3/cli
op3 <command>
```

Or use without installing

```bash
npx @op3/cli <command>
```

Cheat sheet:

```bash
op3 --version # check current version
op3 init # initialize op3 inside current folder
op3 add test.ts # add a task file
op3 run # start running all tasks
op3 run test.ts # start running tasks by glob match
op3 once test.ts # run once by glob match
```
