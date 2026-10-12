# Worker startup and graceful drain

The worker process has one owner for initialization, polling and cleanup. `SIGTERM` and `SIGINT` request a stop through an abort signal. Both handlers remain installed during cleanup, including when a second signal arrives. They do not forcibly terminate a running query. The current dispatch settles before the pool and Nest application context are closed, and the listeners are then detached.

Previously the process installed both Nest shutdown hooks and independent one-shot handlers around a manually constructed worker. The worker was not a Nest-managed provider. The pinned Nest 12.1.2 context shutdown handler can re-send the termination signal after its own shutdown sequence, independently of that manually constructed worker's pending dispatch. The process now explicitly closes its application context after draining instead of installing that competing process-exit handler.

## Work already in progress

`ActivityWorker.once(batch, signal)` checks the stop signal before leasing and before each delivery. A delivery already started is allowed to settle. A stop during lease acquisition starts no delivery; a stop during a delivery starts no subsequent delivery. A rejected delivery during drain does not start extra failure-bookkeeping SQL. Unstarted or unsettled work retains its durable lease for expiry and recovery. It is not silently marked delivered or deleted.

Database delivery remains the existing transaction that inserts once per receipt and recipient and marks the outbox event delivered. Shutdown changes do not weaken role checks, change migration bytes, reset retry budgets or create external delivery acceptance. An interrupted leased attempt still counts toward the existing eight-attempt budget. Repeated interrupted attempts can therefore require operator attention to a visibly exhausted event; this patch does not implement an authorized retry-budget reset.

Existing query/connect timeouts still apply. A provider's hard termination, a nonresponsive runtime or machine loss can interrupt any graceful path; durable leases are the recovery mechanism in those cases. No fixed provider shutdown latency or loss-free infrastructure is certified here.

## Startup and failures

The default provider remains `disabled` and opens no worker database connection. `in-app` still requires non-production synthetic mode, simulation realm and separate restricted worker credentials. Role and exact schema readiness checks complete before polling or emitting the readiness message. A signal during initialization prevents polling. Partially initialized resources are closed on failure.

Startup and cleanup errors produce a generic diagnostic and a nonzero process exit code, not raw provider/SQL exception details. Successful disabled startup emits `Activity worker ready: disabled.`; it does not claim that any activity was delivered. Ordinary dispatch failures retain the previous fixed diagnostic and polling behavior.

## Verification

`tests/worker-drain.test.ts` adds 15 unit/process cases for initialization, cleanup, repeated signals, current-dispatch drain, polling interruption and stop-aware batches. Its child-process fixture receives actual operating-system signals while a synthetic job is held, verifies it stays alive during drain, then finishes the job and exits normally.

After building the worker, run `node --import tsx tests/worker-process.integration.ts`. Five compiled-process scenarios verify both shutdown signals, disabled operation, unsupported providers, the production gate and missing credentials without contacting a provider or database.

`tests/worker-drain.integration.ts` requires separate isolated synthetic PostgreSQL owner/runtime/worker credentials. It creates only invented cases, interrupts after actual lease/delivery SQL, checks durable unfinished events, simulates expiry of those test leases only and verifies real restricted-worker recovery with one inbox insertion per receipt/recipient. The clock manipulation is a test fixture, not a measured hosted recovery drill. CI retains all previous checks and adds these acceptance commands.

Framework and hosting context: https://docs.nestjs.com/fundamentals/lifecycle-events and https://render.com/docs/deploys#graceful-shutdown. This is code-level synthetic acceptance, not protected production activation, independent security review or proof of a provider's live settings.

Local October 12 continuation evidence: 124 unit tests passed, all four private application builds passed, all five compiled-process scenarios passed, and all 16 PostgreSQL integration suites passed on a fresh isolated PostgreSQL 16.15/PostGIS 3.4.2 database. Integration suites create synthetic fixtures; reuse of a heavily populated test database can interfere with the older worker test's bounded queue drain, so release acceptance uses a fresh isolated database rather than weakening its assertions. GitHub verification and browser acceptance remain separate gates, not implied by these local results.
