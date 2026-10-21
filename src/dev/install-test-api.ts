type MiniWheelsTestApi = NonNullable<Window["__MINI_WHEELS_TEST__"]>;

export function installTestApi(api: MiniWheelsTestApi): () => void {
  window.__MINI_WHEELS_TEST__ = api;

  return () => {
    delete window.__MINI_WHEELS_TEST__;
  };
}
