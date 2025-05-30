[![Coverage Status](https://img.shields.io/badge/coverage-local--report-brightgreen)](./coverage/lcov-report/index.html)

# Disaster Data API (Node.js + TypeScript)

This project is a Node.js backend for storing and serving disaster data (e.g., wildfires) via a RESTful API. It uses Express.js, MongoDB, and is written in **TypeScript**.

## Features

- RESTful API for disaster data
- MongoDB for storage
- Express.js best practices
- TypeScript throughout
- Docker Compose for local development
- OpenAPI/Swagger documentation
- Prometheus metrics
- GraphQL endpoint
- Comprehensive test suite (run inside Docker container)

## Test Coverage

Test coverage is measured using Jest. After running tests, a detailed HTML report is available in the `coverage/lcov-report/index.html` file.

[![Coverage Status](https://img.shields.io/badge/coverage-local--report-brightgreen)](./coverage/lcov-report/index.html)

To generate a coverage report, run:

```sh
docker compose exec api npm test -- --coverage
```

---
