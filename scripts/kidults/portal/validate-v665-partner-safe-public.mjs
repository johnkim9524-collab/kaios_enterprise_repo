import fs from 'node:fs';

const path = 'apps/kidults-enterprise-staging/public/index.html';
const html = fs.readFileSync(path, 'utf8');

const required = [
  'KIDULTS — Global Collectibles Intelligence',
  'Global Collectibles Intelligence',
  'Platform in development',
  'Evidence-driven',
  'Multi-category',
  'Rights-aware',
  'Toys &amp; Models',
  'Watches &amp; Jewelry',
  'Automobiles &amp; Mobility',
  'Fashion &amp; Accessories',
  'Design &amp; Furniture',
  'Technology &amp; Cameras',
  'Gaming / Music / Screen Culture',
  'Cards / Comics / Memorabilia',
  'DATA &amp; STRATEGIC PARTNERSHIPS',
  'partnerships@kidults.com',
  'not a live market-data or investment product'
];

const forbidden = [
  'Signals. Rankings. Research.',
  '94.8',
  '500+ Brands',
  '12 Categories',
  '94% Confidence',
  'Status Operational',
  'V6 RC',
  'Qualified signals',
  'Composite opportunity score',
  'Liquidity grade'
];

for (const token of required) {
  if (!html.includes(token)) throw new Error(`Missing required partner-safe token: ${token}`);
}
for (const token of forbidden) {
  if (html.includes(token)) throw new Error(`Forbidden stale/unverified public token present: ${token}`);
}
if (!html.includes('data-release="v665"')) throw new Error('V665 release binding missing');
if (!html.includes('data-surface="partner-safe-public"')) throw new Error('Partner-safe surface binding missing');

console.log('PASS KIDULTS V665 partner-safe public homepage');
