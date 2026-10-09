type AuthSignOut = (options: { scope: "local" }) => PromiseLike<unknown>;

/** Leave this device even when Auth is offline or its session lock stalls. */
export async function signOutWithLocalRecovery(
  signOut: AuthSignOut,
  storage: Pick<Storage, "removeItem">,
  storageKey: string,
  timeoutMs = 8000,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(() => signOut({ scope: "local" })),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } catch {
    // Local recovery still works if the remote sign-out fails.
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }

  // Clear only this project's credentials; keep other app data and accounts.
  storage.removeItem(storageKey);
  storage.removeItem(storageKey + "-user");
  storage.removeItem(storageKey + "-code-verifier");
}
