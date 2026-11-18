# npm scripts are the source of truth; these recipes are thin wrappers.
default:
    @just --list

lint:
    npm run lint
    npm run format:check

test-unit:
    npm run test:unit

test:
    npm test
