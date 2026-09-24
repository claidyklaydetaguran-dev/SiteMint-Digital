#!/bin/bash
set -e
pnpm install --frozen-lockfile

# Database changes are intentionally not applied after a merge. Voice schema
# changes use reviewed, versioned migrations; legacy schema pushes remain a
# separate, explicit owner-approved operation.
echo "Dependencies installed. Database migrations were not run automatically."
