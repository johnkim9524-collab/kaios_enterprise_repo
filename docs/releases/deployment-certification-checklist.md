# Deployment Certification Checklist

## Source Control

- [ ] Release pull request merged
- [ ] Main branch synchronized
- [ ] Working tree clean
- [ ] VERSION matches the intended Git tag

## Quality

- [ ] Full test suite passed
- [ ] Docker Compose configuration validated
- [ ] Release notes generated
- [ ] Release artifact manifest generated

## Operations

- [ ] Production health endpoint is healthy
- [ ] Production smoke test passed
- [ ] Backup and restore procedures remain valid
- [ ] Rollback target dry run passed
- [ ] Incident and recovery runbooks reviewed

## Release

- [ ] Annotated Git tag created
- [ ] Release workflow passed
- [ ] Artifacts retained for 90 days
- [ ] Deployment record approved