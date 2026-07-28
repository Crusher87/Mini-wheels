type TinyTractionTestApi = NonNullable<Window["__TINY_TRACTION_TEST__"]>;

export function installTestApi(api: TinyTractionTestApi): () => void {
  window.__TINY_TRACTION_TEST__ = api;

  return () => {
    delete window.__TINY_TRACTION_TEST__;
  };
}
