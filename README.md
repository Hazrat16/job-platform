# Job Platform — API

A production-grade job platform backend: job postings, applications, real-time chat,
company profiles, paid job boosting, resume-fit AI scoring, and admin moderation —
built on Node.js, TypeScript, Express 5, and MongoDB.

## Highlights

- **Three roles** (jobseeker / employer / admin) with RBAC middleware and ownership
  checks enforced at the service layer, not just the route.
- **Redis-backed at scale**: shared cache and rate-limiting across instances, a
  background email queue (BullMQ), and a Socket.IO Redis adapter for horizontal
  chat scaling — all with automatic fallback to in-process behavior when Redis
  isn't configured, so nothing hard-depends on it.
- **Real-time chat**: Socket.IO + RabbitMQ, with direct-to-socket delivery on top
  of async persistence, verified end-to-end (message send → live delivery →
  database persistence → REST history retrieval).
- **Paid job boosting**: employers can feature a job post for a fixed number of
  days via SSLCommerz; pricing is computed server-side, never trusted from the
  client, and boosted listings are sorted first via a MongoDB aggregation pipeline.
- **Company profiles**: a real `Company` entity (not just a free-text field) with
  multi-member employer accounts and public company pages listing their open roles.
- **Genuinely tested**: integration tests run with `supertest` against a real
  disposable MongoDB (not mocks) — auth, jobs, applications, companies, and
  payment-validation flows, including regression tests that lock in specific
  security fixes (e.g. mass-assignment protection on job create/update).
- **Operationally real**: structured JSON logging, `/api/health` and
  `/api/health/ready` checks covering Mongo/Redis/RabbitMQ, graceful shutdown that
  actually drains every subsystem, optional Sentry error tracking, and a CI
  pipeline that runs typecheck/lint/test/build/`npm audit` on every push.

## Tech stack

Node.js · TypeScript · Express 5 · MongoDB/Mongoose · Redis (ioredis) · BullMQ ·
Socket.IO · RabbitMQ (amqplib) · JWT auth · SSLCommerz · Cloudinary · Sentry ·
Docker · GitHub Actions

## Getting started

```bash
npm install
cp .env.example .env   # fill in MONGODB_URI and JWT_SECRET at minimum
npm run dev
```

The server starts in degraded mode if MongoDB/Redis/RabbitMQ aren't reachable —
the REST API still runs, chat/caching/queueing just fall back to simpler behavior.
See `.env.example` for what each integration unlocks.

### Running tests

Integration tests need a real, disposable MongoDB (not your dev database):

```bash
docker run -d -p 27099:27017 mongo:7.0
npm test
```

### Running the full stack with Docker

```bash
docker compose -f docker-compose.chat.yml up --build
```

Spins up MongoDB, RabbitMQ, Redis, the API, and an nginx reverse proxy together.
See `DOCKER_README.md` for other compose variants and `QUICK_START.md` for a
minimal setup.

## Architecture

- `src/controllers/` — thin request/response adapters; no business logic.
- `src/services/` — business logic (`jobService`, `applicationService`,
  `companyService`, ...). Throws `HttpError` for expected failures (404/403/409/...);
  Express 5 automatically forwards both thrown errors and rejected promises from
  `async` handlers to the centralized error middleware, so no wrapper boilerplate
  is needed.
- `src/models/` — Mongoose schemas.
- `src/middlewares/` — auth, RBAC, rate limiting, input sanitization, error handling.
- `src/queues/` — BullMQ producers/workers (currently: background email delivery).
- `src/chat/` — Socket.IO service, RabbitMQ producer/consumer for chat.
- `src/config/` — Redis client, CORS origins, Sentry, Cloudinary — each reads env
  vars lazily (not at module load) since ESM import hoisting can otherwise
  evaluate a module before `dotenv.config()` has run.
- `src/bootstrap.ts` — process startup: env validation, service connections,
  graceful shutdown. `src/startChatServer.ts` is a thin entry point that loads
  `dotenv` before dynamically importing `bootstrap.ts`, guaranteeing env vars are
  populated before anything else in the app reads them.

## API documentation

- [`API_DOCUMENTATION.md`](./API_DOCUMENTATION.md) — REST endpoints.
- [`CHAT_SERVICE_README.md`](./CHAT_SERVICE_README.md) /
  [`CHAT_SERVICE_TUTORIAL.md`](./CHAT_SERVICE_TUTORIAL.md) — chat subsystem detail.
- [`DOCKER_README.md`](./DOCKER_README.md) — Docker Compose variants explained.
