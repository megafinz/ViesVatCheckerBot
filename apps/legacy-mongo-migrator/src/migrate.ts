import type {
  MigrationCounts,
  MigrationMode,
  MigrationResult,
  MigrationSource,
  MigrationTarget
} from './types';

export interface MigrateVatDataOptions {
  mode: MigrationMode;
  source: MigrationSource;
  target: MigrationTarget;
}

export async function migrateVatData(
  options: MigrateVatDataOptions
): Promise<MigrationResult> {
  const [pendingVatRequests, vatRequestErrors] = await Promise.all([
    options.source.getPendingVatRequests(),
    options.source.getVatRequestErrors()
  ]);
  const sourceCounts = {
    pendingVatRequests: pendingVatRequests.length,
    vatRequestErrors: vatRequestErrors.length
  };
  const targetBefore = await getTargetCounts(options.target);

  if (options.mode === 'verify') {
    return emptyWriteResult(options.mode, sourceCounts, targetBefore);
  }

  if (options.mode === 'dry-run') {
    return {
      mode: options.mode,
      source: sourceCounts,
      targetBefore,
      targetAfter: targetBefore,
      inserted: sourceCounts,
      skipped: { pendingVatRequests: 0 }
    };
  }

  let insertedPendingVatRequests = 0;
  let skippedPendingVatRequests = 0;

  for (const vatRequest of pendingVatRequests) {
    if (await options.target.insertPendingVatRequest(vatRequest)) {
      insertedPendingVatRequests++;
    } else {
      skippedPendingVatRequests++;
    }
  }

  for (const vatRequestError of vatRequestErrors) {
    await options.target.insertVatRequestError(vatRequestError);
  }

  return {
    mode: options.mode,
    source: sourceCounts,
    targetBefore,
    targetAfter: await getTargetCounts(options.target),
    inserted: {
      pendingVatRequests: insertedPendingVatRequests,
      vatRequestErrors: vatRequestErrors.length
    },
    skipped: {
      pendingVatRequests: skippedPendingVatRequests
    }
  };
}

async function getTargetCounts(
  target: MigrationTarget
): Promise<MigrationCounts> {
  const [pendingVatRequests, vatRequestErrors] = await Promise.all([
    target.countPendingVatRequests(),
    target.countVatRequestErrors()
  ]);

  return { pendingVatRequests, vatRequestErrors };
}

function emptyWriteResult(
  mode: MigrationMode,
  source: MigrationCounts,
  targetBefore: MigrationCounts
): MigrationResult {
  return {
    mode,
    source,
    targetBefore,
    targetAfter: targetBefore,
    inserted: { pendingVatRequests: 0, vatRequestErrors: 0 },
    skipped: { pendingVatRequests: 0 }
  };
}
