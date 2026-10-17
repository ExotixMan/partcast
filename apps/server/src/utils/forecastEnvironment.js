// Bound native thread pools on small hosted instances, including during imports.
export const forecastProcessEnv = () => ({
  ...process.env, PYTHONUNBUFFERED:'1', OMP_NUM_THREADS:'1',
  OPENBLAS_NUM_THREADS:'1', MKL_NUM_THREADS:'1', NUMEXPR_NUM_THREADS:'1'
});
