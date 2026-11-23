export async function placeRazorpayCheckout({
  connection,
  prepare,
  work,
  begin,
  commit,
  rollback,
  release,
  callProvider,
  compensate,
  onUncertainCommit,
}) {
  let transactionOpen = false;
  let commitConfirmed = false;
  try {
    const prepared = await prepare();
    let created;
    let stage = "begin";
    try {
      await begin(connection);
      transactionOpen = true;
      stage = "work";
      created = await work(prepared);
      stage = "commit";
      await commit(connection);
      transactionOpen = false;
      commitConfirmed = true;
    } catch (error) {
      if (stage === "commit" && onUncertainCommit) {
        transactionOpen = false;
        const outcome = await onUncertainCommit(error);
        if (!outcome?.committed) throw outcome?.error || error;
        created = outcome.created;
        commitConfirmed = true;
      } else if (transactionOpen) {
        await rollback(connection);
        transactionOpen = false;
        throw error;
      } else {
        throw error;
      }
    }

    try {
      return await callProvider(created, prepared);
    } catch (providerError) {
      try {
        await compensate(created, providerError);
      } catch (compensationError) {
        console.error(
          "Pending payment compensation failed:",
          compensationError?.message || compensationError
        );
        const surfaced = new Error(
          `Online checkout could not be completed, and stock compensation failed. ${compensationError?.message || "Compensation failed."}`
        );
        surfaced.statusCode = 500;
        surfaced.compensationError = compensationError;
        throw surfaced;
      }
      throw providerError;
    }
  } finally {
    try {
      if (transactionOpen) {
        await rollback(connection);
        transactionOpen = false;
      }
    } finally {
      if (!connection?.destroyed) await release(connection);
    }
  }
}
