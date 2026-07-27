\# KAIOS Run History API



\## Status



Sprint 09 Run History API and Portal Integration.



\## Objective



Expose persistent KAIOS runtime history through the existing Gateway response

contract and responsive operations portal.



\## Endpoints



\### Recent Runs



```text

GET /api/runs

GET /api/runs?limit=20

```



The default limit is:



```text

20

```



The accepted range is:



```text

1 through 100

```



The most recent runtime records are returned first.



\### Run Detail



```text

GET /api/runs/{run\_id}

```



The detail response includes:



```text

runtime metadata

stage executions

source executions

publication

error metadata

```



\## Successful Response Contract



Successful responses use the existing Gateway envelope.



```json

{

&#x20; "ok": true,

&#x20; "endpoint": "/api/runs",

&#x20; "data": {

&#x20;   "count": 1,

&#x20;   "limit": 20,

&#x20;   "runs": \[]

&#x20; }

}

```



\## Recent Run Fields



Each recent run can include:



```text

run\_id

trigger\_type

mode

status

published

edition

started\_at

completed\_at

duration\_ms

error

```



\## Run Detail Fields



A run detail response includes the recent run fields plus:



```text

stages

sources

publication

```



\## Stage Execution Fields



```text

sequence\_number

stage\_name

status

detail

recorded\_at

```



\## Source Execution Fields



```text

source\_id

source\_name

source\_type

status

attempts

signal\_count

error

recorded\_at

```



\## Publication Fields



```text

edition

published\_at

```



\## Error Responses



\### Missing Runtime Record



```text

HTTP 404

error type: run\_not\_found

```



Example:



```json

{

&#x20; "ok": false,

&#x20; "endpoint": "/api/runs/missing-run",

&#x20; "error": {

&#x20;   "type": "run\_not\_found",

&#x20;   "message": "No runtime history exists for run ID missing-run."

&#x20; }

}

```



\### Invalid Limit



```text

HTTP 400

error type: invalid\_request

```



Invalid cases include:



```text

non-integer limit

limit below 1

limit above 100

```



\### Unsupported Method



```text

HTTP 405

error type: method\_not\_allowed

```



\## Runtime Trigger Type



Runtime executions started through:



```text

GET /api/runtime?mode=fixture

```



are persisted with:



```text

trigger\_type = api

```



\## Portal Integration



The responsive operations portal displays:



```text

Recent Runs

Run Summary

Stage Timeline

Source Executions

Publication

Runtime Errors

```



The first recent run is selected automatically.



Selecting another run loads its complete detail from:



```text

GET /api/runs/{run\_id}

```



After a portal runtime execution finishes, the portal emits:



```text

kaios:runtime-complete

```



The Run History view listens for this event and reloads the recent run list.



\## Responsive Behavior



Desktop layout:



```text

Recent Runs | Run Detail

```



Tablet and mobile layout:



```text

Recent Runs

Run Detail

```



Long run IDs and error messages use overflow wrapping to prevent horizontal

page overflow.



\## Persistence



The APIs use the Sprint 08 SQLite persistence foundation.



Default local database:



```text

data/kaios.db

```



Default container database:



```text

/app/data/kaios.db

```



Docker persistence volume:



```text

kaios-runtime-data:/app/data

```



\## Current Boundary



This Sprint exposes read-only runtime history.



The following remain outside the current boundary:



```text

administrator authentication

protected write endpoints

scheduler execution

rate limiting

multi-user access

advanced filtering

pagination cursors

```
