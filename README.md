# Task Master CLI

A comprehensive task management CLI for developers to manage project tasks, dependencies, and workflows.

## Features

- Task data model supporting user assignments, comments, and extended metadata
- Dependency management and visualization
- Task status tracking (pending, in-progress, done)
- Subtask management for breaking down complex tasks
- Notification system with pluggable architecture
- Project dashboards with progress metrics

## Getting Started

```bash
# Install dependencies
npm install

# Run Task Master
node bin/task-master.js

# Generate task files from custom-tasks.json
task-master generate --file=custom-tasks.json --output=custom-tasks

# Show next task to work on
task-master next --file=custom-tasks.json

# Update task status
task-master set-status --id=1 --status=in-progress --file=custom-tasks.json
```

## Task Structure

Tasks in Task Master include:
- Unique ID
- Title and description
- Status (pending, in-progress, done)
- Priority (high, medium, low)
- Dependencies
- Implementation details
- Test strategy
- Subtasks

## Project Status

This project is currently under active development. Task 1 (Enhance Task Data Model) has been completed, and the next task is Task 5 (Add Multi-User Support).