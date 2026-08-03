import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve('apps/kidults-enterprise-staging');
const dataRoot = path.join(appRoot, 'public', 'a13-b10', 'data');
const manifestPath = path.join(dataRoot, 'staging-release-freeze.json');
const outputPath = path.join(dataRoot, 'generated', 'staging-release-freeze-status.json');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const gates = {
  regression: manifest.quality.lastVerifiedTests >= 124 && manifest.quality.lastVerifiedFailures === 0 ? 'passed' : 'blocked',
  mobileSafety: manifest.quality.mobileSafe ? 'passed' : 'blocked',
  secretSafety: manifest.quality.secretSafe ? 'passed' : 'blocked',
  productionIsolation: manifest.quality.productionUntouched ? 'passed' : 'blocked',
  externalDependencyClosure: manifest.openExternalDependencies.length === 0 ? 'passed' : 'blocked',
  productionAuthorization: manifest.productionPromotionAuthorized ? 'passed' : 'blocked'
};

const report = {
  release: 'A13-B25',
  environment: 'staging',
  evaluatedAt: new Date().toISOString(),
  status: Object.values(gates).slice(0, 4).every(value => value === 'passed')
    ? 'staging-release-frozen'
    : 'release-freeze-blocked',
  productionPromotionAuthorized: false,
  frozenThrough: manifest.frozenThrough,
  quality: manifest.quality,
  frozenCapabilities: manifest.frozenCapabilities,
  openExternalDependencies: manifest.openExternalDependencies,
  changePolicy: manifest.changePolicy,
  gates
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(`A13-B25 staging release freeze: ${report.status}.`);
console.log(`Frozen capabilities: ${report.frozenCapabilities.length}; external dependencies: ${report.openExternalDependencies.length}.`);
console.log('Production promotion authorized: false.');
