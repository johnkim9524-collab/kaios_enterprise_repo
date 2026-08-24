import fs from 'node:fs';

const portfolioPath = 'coordination/kidults/internalization/provider-product-portfolio-v1.json';

const EXPECTED_PRODUCT_IDS = [
  'GEMRATE_DEVELOPER_TIER',
  'PSA_PREMIUM_API',
  'PSA_ENTERPRISE_API',
  'CLASSIC_COM_LICENSED_BUNDLE_3',
  'CGC_DEALER_PORTAL_API',
  'ALT_FNDATA',
  'LIVEART_PILOT',
  'HAGERTY_UNSPECIFIED_PRODUCT'
];

const EXPECTED_HOLD_IDS = [
  'GEMRATE_DEVELOPER_TIER',
  'PSA_PREMIUM_API',
  'CLASSIC_COM_LICENSED_BUNDLE_3'
];

const EXPECTED_DROP_IDS = [
  'PSA_ENTERPRISE_API',
  'CGC_DEALER_PORTAL_API',
  'ALT_FNDATA',
  'LIVEART_PILOT',
  'HAGERTY_UNSPECIFIED_PRODUCT'
];

const REQUIRED_CURRENT_SOLD_CAPABILITIES = [
  'ASSET_IDENTITY',
  'SALE_STATUS',
  'REALIZED_SOLD_PRICE',
  'SALE_DATE',
  'CURRENCY',
  'VENUE',
  'SOURCE_URL',
  'CURRENT_FRESHNESS',
  'COVERAGE_DISCLOSURE'
];

const REQUIRED_CURRENT_SOLD_RIGHTS = [
  'SOURCE_ACCESS',
  'PERMITTED_PURPOSE',
  'RETENTION',
  'DERIVED_OUTPUT',
  'PUBLICATION_EXPORT',
  'MODEL_USE',
  'TERMINATION_DELETION',
  'PORTABILITY'
];

const REQUIRED_CLASSIC_GATES = [
  'OFFICIAL_PRODUCT_PROPOSAL',
  'FIELD_SCHEMA',
  'SAMPLE_PAYLOAD',
  'SOLD_UNSOLD_SEPARATION',
  'REALIZED_PRICE_SEMANTICS',
  'COVERAGE_AND_FRESHNESS',
  'PERMITTED_PURPOSES',
  'RETENTION_RIGHTS',
  'DERIVED_OUTPUT_RIGHTS',
  'PUBLICATION_EXPORT_RIGHTS',
  'MODEL_USE_RIGHTS',
  'TERMINATION_DELETION',
  'PORTABILITY_RIGHTS',
  'QUOTE_AND_TOTAL_COST',
  'QUOTA_LATENCY_AND_SLA',
  'FOUNDER_APPROVAL'
];

const REQUIRED_GAP_LANES = [
  'CLASSIC_BUNDLE3_DILIGENCE',
  'NEW_CURRENT_SOLD_FEED_DISCOVERY',
  'GRADER_HELPER_SEPARATION'
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sameMembers(actual = [], expected = []) {
  return actual.length === expected.length &&
    [...actual].sort().every((value, index) => value === [...expected].sort()[index]);
}

function validatePortfolio(portfolio) {
  const errors = [];
  const assert = (condition, message) => {
    if (!condition) errors.push(message);
  };

  assert(portfolio.schemaVersion === '1.0.0', 'schema version drift');
  assert(portfolio.contractId === 'KIDULTS_TRACK_Z_PROVIDER_PRODUCT_PORTFOLIO_V1', 'contract id drift');
  assert(
    sameMembers(portfolio.authorityChain, ['Track Z', 'KPMO', 'Founder']),
    'authority chain drift'
  );
  assert(portfolio.sourceDecision?.analysisState === 'COMPLETE', 'analysis must be complete');
  assert(portfolio.sourceDecision?.validationState === 'PASS', 'source validation must pass');
  assert(
    portfolio.sourceDecision?.basis === 'TRACK_Z_VALIDATED_PRODUCT_ANALYSIS',
    'source decision basis drift'
  );
  assert(
    portfolio.sourceDecision?.analysisCommits?.includes('e73a723f') &&
      portfolio.sourceDecision?.analysisCommits?.includes('fee5a7db'),
    'source decision commits missing'
  );

  assert(portfolio.decisionSemantics?.providerBaseline === 'HOLD', 'provider baseline must remain HOLD');
  assert(
    portfolio.decisionSemantics?.productDecisionPrecedence ===
      'PRODUCT_DECISION_NARROWS_BUT_NEVER_RELAXES_PROVIDER_HOLD',
    'product decision precedence drift'
  );

  const feed = portfolio.currentSoldTransactionFeed ?? {};
  assert(feed.status === 'OPEN_GAP', 'Current SOLD gap must remain OPEN_GAP');
  assert(
    feed.completeImmediatelyPurchasableProductCount === 0,
    'complete immediately purchasable Current SOLD product count must remain zero'
  );
  assert(
    feed.failClosedOutput === 'UNAVAILABLE_NO_RIGHTS_CLEAR_CURRENT_SOLD_FEED',
    'Current SOLD fail-closed output drift'
  );
  assert(
    sameMembers(feed.requiredCapabilities, REQUIRED_CURRENT_SOLD_CAPABILITIES),
    'Current SOLD capability contract drift'
  );
  assert(
    sameMembers(feed.requiredRights, REQUIRED_CURRENT_SOLD_RIGHTS),
    'Current SOLD rights contract drift'
  );
  for (const substitute of [
    'GRADING_CERTIFICATION',
    'POPULATION_DATA',
    'CROSS_GRADER_MAPPING',
    'LISTING_ASK_PRICE',
    'PRICE_GUIDE',
    'MODEL_ESTIMATE'
  ]) {
    assert(feed.nonQualifyingSubstitutes?.includes(substitute), `missing non-qualifying substitute ${substitute}`);
  }

  const products = portfolio.products ?? [];
  const ids = products.map(product => product.productId);
  assert(new Set(ids).size === ids.length, 'duplicate product ids');
  assert(sameMembers(ids, EXPECTED_PRODUCT_IDS), 'product universe drift');

  const byId = Object.fromEntries(products.map(product => [product.productId, product]));
  const conditionalHoldIds = products
    .filter(product => product.decision === 'CONDITIONAL_HOLD')
    .map(product => product.productId);
  const dropIds = products
    .filter(product => product.decision === 'DROP')
    .map(product => product.productId);

  assert(sameMembers(conditionalHoldIds, EXPECTED_HOLD_IDS), 'conditional HOLD universe drift');
  assert(sameMembers(dropIds, EXPECTED_DROP_IDS), 'DROP universe drift');
  assert(portfolio.summary?.conditionalHoldCount === 3, 'conditional HOLD count drift');
  assert(portfolio.summary?.dropCount === 5, 'DROP count drift');
  assert(
    sameMembers(portfolio.summary?.conditionalHoldProductIds, EXPECTED_HOLD_IDS),
    'conditional HOLD summary drift'
  );
  assert(
    sameMembers(portfolio.summary?.dropProductIds, EXPECTED_DROP_IDS),
    'DROP summary drift'
  );
  assert(
    sameMembers(
      portfolio.summary?.gradingOrCertificationHelperProductIds,
      ['GEMRATE_DEVELOPER_TIER', 'PSA_PREMIUM_API']
    ),
    'grading helper summary drift'
  );
  assert(
    sameMembers(
      portfolio.summary?.currentSoldPrimaryCandidateProductIds,
      ['CLASSIC_COM_LICENSED_BUNDLE_3']
    ),
    'Current SOLD primary candidate summary drift'
  );

  for (const product of products) {
    const activation = product.activation ?? {};
    assert(activation.state === 'PROHIBITED', `${product.productId}: activation must be prohibited`);
    for (const field of [
      'externalContactAllowed',
      'contractAllowed',
      'spendAllowed',
      'credentialAllowed',
      'dataAcquisitionAllowed',
      'adapterBacklogAdmissionAllowed',
      'productionAllowed'
    ]) {
      assert(activation[field] === false, `${product.productId}: ${field} must be false`);
    }
    assert(
      product.currentSoldCapability?.qualifiesAsCompleteCurrentSoldFeed === false,
      `${product.productId}: no product may qualify as a complete Current SOLD feed`
    );
  }

  const gemRate = byId.GEMRATE_DEVELOPER_TIER ?? {};
  assert(gemRate.decision === 'CONDITIONAL_HOLD', 'GemRate Developer decision drift');
  assert(gemRate.role === 'GRADING_ENRICHMENT_HELPER', 'GemRate role drift');
  assert(gemRate.currentSoldCapability?.providesTransactionHistory === false, 'GemRate cannot provide transaction history');
  assert(gemRate.economics?.monthlyAmount === 200, 'GemRate monthly cost drift');
  assert(gemRate.economics?.annualAmount === 2400, 'GemRate annual cost drift');
  assert(gemRate.economics?.trialDays === 7, 'GemRate trial duration drift');

  const psaPremium = byId.PSA_PREMIUM_API ?? {};
  assert(psaPremium.decision === 'CONDITIONAL_HOLD', 'PSA Premium decision drift');
  assert(psaPremium.role === 'CERTIFICATION_VERIFICATION_HELPER', 'PSA Premium role drift');
  assert(psaPremium.currentSoldCapability?.providesTransactionHistory === false, 'PSA Premium cannot provide transaction history');
  assert(psaPremium.economics?.annualAmount === 199, 'PSA Premium annual cost drift');
  assert(psaPremium.economics?.callsPerDay === 100, 'PSA Premium quota drift');

  const psaEnterprise = byId.PSA_ENTERPRISE_API ?? {};
  assert(psaEnterprise.decision === 'DROP', 'PSA Enterprise must remain DROP');
  assert(
    psaEnterprise.dropReason === 'COST_EFFICIENCY_INSUFFICIENT_AT_CURRENT_SCALE',
    'PSA Enterprise DROP reason drift'
  );
  assert(psaEnterprise.economics?.annualAmount === 3500, 'PSA Enterprise annual cost drift');
  assert(psaEnterprise.economics?.callsPerDay === 500, 'PSA Enterprise quota drift');

  const classic = byId.CLASSIC_COM_LICENSED_BUNDLE_3 ?? {};
  assert(classic.decision === 'CONDITIONAL_HOLD', 'Classic.com Bundle 3 decision drift');
  assert(classic.role === 'CURRENT_SOLD_PRIMARY_CANDIDATE', 'Classic.com role drift');
  assert(classic.currentSoldCapability?.providesTransactionHistory === true, 'Classic.com transaction-history fit drift');
  assert(classic.currentSoldCapability?.potentiallyRelevant === true, 'Classic.com relevance drift');
  assert(classic.economics?.quoteStatus === 'CUSTOM_QUOTE_REQUIRED', 'Classic.com quote status drift');
  assert(classic.economics?.annualAmount === null, 'Classic.com annual cost must remain unknown');
  for (const gate of REQUIRED_CLASSIC_GATES) {
    assert(classic.evidenceGates?.includes(gate), `Classic.com missing evidence gate ${gate}`);
  }

  for (const productId of EXPECTED_DROP_IDS) {
    const product = byId[productId] ?? {};
    const reentry = product.reentryPolicy ?? {};
    assert(reentry.requiresNewOfficialProductProposal === true, `${productId}: official proposal reentry gate missing`);
    assert(reentry.requiresMaterialChange === true, `${productId}: material-change reentry gate missing`);
    assert(reentry.requiresNewDecisionPacket === true, `${productId}: new decision packet gate missing`);
    assert((reentry.acceptedMaterialChanges ?? []).length > 0, `${productId}: accepted material changes missing`);
  }

  const lanes = portfolio.gapClosureWork?.lanes ?? [];
  assert(portfolio.gapClosureWork?.queueStatus === 'INTERNAL_ONLY', 'gap closure queue must remain internal-only');
  assert(
    sameMembers(lanes.map(lane => lane.laneId), REQUIRED_GAP_LANES),
    'gap closure lane universe drift'
  );
  for (const lane of lanes) {
    assert(lane.externalExecutionAllowed === false, `${lane.laneId}: external execution must be false`);
  }

  const nonBypass = portfolio.nonBypass ?? {};
  for (const boundary of [
    'externalContact',
    'contract',
    'spend',
    'credential',
    'dataAcquisition',
    'adapterDevelopment',
    'production'
  ]) {
    assert(nonBypass[boundary] === 'HOLD', `${boundary} boundary drift`);
  }
  assert(nonBypass.g5 === 'EXPLICIT_APPROVAL_REQUIRED', 'G5 boundary drift');

  return errors;
}

const portfolio = JSON.parse(fs.readFileSync(portfolioPath, 'utf8'));
const errors = validatePortfolio(portfolio);

const mutationTests = [
  {
    name: 'reject_nonzero_current_sold_count',
    mutate: value => {
      value.currentSoldTransactionFeed.completeImmediatelyPurchasableProductCount = 1;
    }
  },
  {
    name: 'reject_grader_as_current_sold_feed',
    mutate: value => {
      value.products.find(product => product.productId === 'GEMRATE_DEVELOPER_TIER')
        .currentSoldCapability.qualifiesAsCompleteCurrentSoldFeed = true;
    }
  },
  {
    name: 'reject_drop_reentry_without_official_proposal',
    mutate: value => {
      value.products.find(product => product.productId === 'CGC_DEALER_PORTAL_API')
        .reentryPolicy.requiresNewOfficialProductProposal = false;
    }
  },
  {
    name: 'reject_classic_without_derivative_rights_gate',
    mutate: value => {
      const product = value.products.find(product => product.productId === 'CLASSIC_COM_LICENSED_BUNDLE_3');
      product.evidenceGates = product.evidenceGates.filter(gate => gate !== 'DERIVED_OUTPUT_RIGHTS');
    }
  },
  {
    name: 'reject_external_spend_enablement',
    mutate: value => {
      value.nonBypass.spend = 'ALLOWED';
    }
  },
  {
    name: 'reject_psa_enterprise_cost_drift',
    mutate: value => {
      value.products.find(product => product.productId === 'PSA_ENTERPRISE_API')
        .economics.annualAmount = 199;
    }
  },
  {
    name: 'reject_product_universe_expansion',
    mutate: value => {
      value.products.push(clone(value.products[0]));
      value.products[value.products.length - 1].productId = 'UNAPPROVED_PRODUCT';
    }
  },
  {
    name: 'reject_adapter_backlog_bypass',
    mutate: value => {
      value.products.find(product => product.productId === 'PSA_PREMIUM_API')
        .activation.adapterBacklogAdmissionAllowed = true;
    }
  }
];

for (const test of mutationTests) {
  const mutated = clone(portfolio);
  test.mutate(mutated);
  if (validatePortfolio(mutated).length === 0) {
    errors.push(`mutation test did not fail: ${test.name}`);
  }
}

if (errors.length) {
  console.error(JSON.stringify({
    suite: 'KIDULTS_TRACK_Z_PROVIDER_PRODUCT_PORTFOLIO_V1',
    result: 'FAIL',
    errors
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  suite: 'KIDULTS_TRACK_Z_PROVIDER_PRODUCT_PORTFOLIO_V1',
  result: 'PASS',
  products: portfolio.products.length,
  conditional_hold: portfolio.summary.conditionalHoldCount,
  drop: portfolio.summary.dropCount,
  complete_immediately_purchasable_current_sold_products:
    portfolio.currentSoldTransactionFeed.completeImmediatelyPurchasableProductCount,
  mutation_tests: mutationTests.length,
  external_execution: portfolio.nonBypass.production
}, null, 2));
