// Browser globals the type-checked files use. The pages load plain scripts, so these are declared, not imported.
interface Window {
  CORTEX_CONFIG: Record<string, any>;
}
