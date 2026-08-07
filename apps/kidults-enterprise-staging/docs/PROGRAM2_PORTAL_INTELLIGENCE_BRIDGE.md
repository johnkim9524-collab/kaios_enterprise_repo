# Program 2 Integration — Portal Intelligence Bridge

## Objective

Connect the governed Program 2 publication plan to the existing Kidults public-enterprise preview without bypassing the current editorial build or production controls.

## Flow

Collector → Normalization → Intelligence Graph → Insight Engine → Governed Publishing → Portal Intelligence Bridge → Public Enterprise Preview

## Bridge outputs

The bridge reads `.local-data/publishing/publish-snapshot.json` and the existing portal intelligence build, then produces:

- `public/public-enterprise-preview/api/v1/governed-intelligence.json`
- governed metadata and executive feed inside `intelligence-data.json`
- governed insight documents appended to `search-index.json`

Existing Kidult100, category, signal, archive, methodology, and portal content remain intact.

## Governance

- the bridge accepts only `kidults.publish-plan.v1`
- held insights remain visible only as governance metadata and are not added to public search documents
- production promotion remains disabled unless the upstream publish plan explicitly authorizes it
- this PR targets the local/staging public-enterprise preview; it does not deploy to live `kidults.com`

## Windows validation

From `apps\kidults-enterprise-staging`:

```powershell
Remove-Item .local-data -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force .local-data | Out-Null
Copy-Item examples\collector-input.sample.json .local-data\collector-input.json -Force
npm run build:sprint27a
```

Expected baseline after this bridge: 80 tests passed, 0 failed.

Then start the local portal:

```powershell
npm start
```

Review:

```text
http://127.0.0.1:4190/public-enterprise-preview/?data=preview
http://127.0.0.1:4190/public-enterprise-preview/api/v1/governed-intelligence.json
```

## Integration boundary

This is the first release where Program 2 engine output is mapped into files consumed by the Kidults portal. Production remains a separate promotion decision after local and staging review.
